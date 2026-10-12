/**
 * w6c-1: the stdlib RFC 6455 test client IMPLEMENTATION (split out of
 * `wsClient.ts` in w7c-3 for the file-size law). Client-side masking is
 * REQUIRED (RFC 6455 §5.1); the accept hash is verified in `connectWs`
 * (wsConnect.ts); the server's close frame is reported separately from the
 * client's own (SPEC §W6C-1). Accepts single-frame server messages only
 * (the w6c server sends single-frame text; fragmented server input surfaces
 * as a loud close rather than a silent mis-read).
 *
 * This module holds the client's public types (WsCloseInfo, WsTestClient)
 * and the impl class; the connection builder lives in wsConnect.ts.
 */
import type { Socket as TcpSocket } from 'node:net';
import {
  CLOSE_NORMAL,
  DEFAULT_MAX_FRAME_PAYLOAD_BYTES,
  FrameCodecError,
  OP_CLOSE,
  OP_PING,
  OP_PONG,
  OP_TEXT,
  decodeFrames,
  encodeClosePayload,
  encodeFrame,
  parseClosePayload,
  utf8Strict,
} from './frameCodec.js';

export interface WsCloseInfo {
  readonly code: number;
  readonly reason: string;
}

export interface WsTestClient {
  readonly id: string;
  readonly isOpen: boolean;
  readonly receivedTexts: readonly string[];
  /** Close frame RECEIVED from the server (null until then) — distinct from our own close(). */
  readonly serverClose: WsCloseInfo | null;
  sendText(text: string): Promise<void>;
  ping(payload?: Buffer): Promise<void>;
  close(code?: number, reason?: string): Promise<void>;
  waitForMessage(predicate?: (text: string) => boolean, timeoutMs?: number): Promise<string>;
  waitForClose(timeoutMs?: number): Promise<WsCloseInfo>;
}

interface MessageWaiter {
  predicate: (text: string) => boolean;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface CloseWaiter {
  resolve: (info: WsCloseInfo) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface PendingPong {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WsTestClientImpl implements WsTestClient {
  private static nextId = 0;
  readonly id: string;
  private readonly socket: TcpSocket;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly texts: string[] = [];
  private readonly messageWaiters: MessageWaiter[] = [];
  private readonly closeWaiters: CloseWaiter[] = [];
  private readonly pendingPongs: PendingPong[] = [];
  private closed = false;
  private closeEchoSent = false;
  private ownCloseInfo: WsCloseInfo | null = null;
  private receivedServerClose: WsCloseInfo | null = null;

  constructor(socket: TcpSocket, head: Buffer) {
    this.id = `ws-test-client-${String(++WsTestClientImpl.nextId).padStart(4, '0')}`;
    this.socket = socket;
    this.buffer = Buffer.from(head);
    socket.on('data', (chunk: Buffer) => this.onBytes(chunk));
    socket.on('error', () => this.markClosed({ code: 1006, reason: 'socket error' }));
    socket.on('close', () => this.markClosed(this.receivedServerClose ?? { code: 1006, reason: 'socket closed' }));
  }

  get isOpen(): boolean {
    return !this.closed;
  }
  get receivedTexts(): readonly string[] {
    return [...this.texts];
  }
  get serverClose(): WsCloseInfo | null {
    return this.receivedServerClose;
  }

  sendText(text: string): Promise<void> {
    if (this.closed) return Promise.reject(new Error(`${this.id} is closed`));
    return this.write(encodeFrame(OP_TEXT, Buffer.from(text, 'utf8'), { mask: true }));
  }

  ping(payload: Buffer = Buffer.alloc(0)): Promise<void> {
    if (this.closed) return Promise.reject(new Error(`${this.id} is closed`));
    return new Promise<void>((resolve, reject) => {
      const entry: PendingPong = {
        resolve: () => {
          clearTimeout(entry.timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(entry.timer);
          reject(err);
        },
        timer: (() => {
          const t = setTimeout(() => {
            const i = this.pendingPongs.indexOf(entry);
            if (i >= 0) {
              this.pendingPongs.splice(i, 1);
              reject(new Error('pong timeout'));
            }
          }, 5000);
          t.unref?.();
          return t;
        })(),
      };
      this.pendingPongs.push(entry);
      this.write(encodeFrame(OP_PING, payload, { mask: true })).catch((err: Error) => {
        const i = this.pendingPongs.indexOf(entry);
        if (i >= 0) {
          this.pendingPongs.splice(i, 1);
          entry.reject(err);
        }
      });
    });
  }

  async close(code: number = CLOSE_NORMAL, reason: string = ''): Promise<void> {
    if (this.closed) return;
    if (!this.closeEchoSent) {
      this.closeEchoSent = true;
      if (this.ownCloseInfo === null) this.ownCloseInfo = { code, reason };
      try {
        await this.write(encodeFrame(OP_CLOSE, encodeClosePayload(code, reason), { mask: true }));
      } catch {
        /* socket already gone */
      }
    }
    await new Promise<void>((resolve) => {
      const guard = setTimeout(() => {
        try {
          this.socket.destroy();
        } catch {
          /* ignore */
        }
        resolve();
      }, 500);
      guard.unref?.();
      try {
        this.socket.end(() => {
          clearTimeout(guard);
          resolve();
        });
      } catch {
        clearTimeout(guard);
        try {
          this.socket.destroy();
        } catch {
          /* ignore */
        }
        resolve();
      }
    });
  }

  waitForMessage(predicate?: (text: string) => boolean, timeoutMs: number = 2000): Promise<string> {
    const pred = predicate ?? (() => true);
    for (const text of this.texts) {
      if (pred(text)) return Promise.resolve(text);
    }
    return new Promise<string>((resolve, reject) => {
      if (this.closed) {
        reject(new Error(`${this.id} closed before the awaited message arrived`));
        return;
      }
      const timer = setTimeout(() => {
        const i = this.messageWaiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this.messageWaiters.splice(i, 1);
        reject(new Error(`waitForMessage timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this.messageWaiters.push({ predicate: pred, resolve, reject, timer });
    });
  }

  waitForClose(timeoutMs: number = 2000): Promise<WsCloseInfo> {
    if (this.closed && this.ownCloseInfo !== null) return Promise.resolve(this.ownCloseInfo);
    return new Promise<WsCloseInfo>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`waitForClose timed out after ${timeoutMs}ms`)), timeoutMs);
      timer.unref?.();
      this.closeWaiters.push({ resolve, timer });
    });
  }

  private write(bytes: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket.write(bytes, (err) => (err ? reject(err) : resolve()));
    });
  }

  private onBytes(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let decoded: ReturnType<typeof decodeFrames>;
    try {
      decoded = decodeFrames(this.buffer, { requireMask: false, maxFramePayloadBytes: DEFAULT_MAX_FRAME_PAYLOAD_BYTES });
    } catch (err) {
      this.markClosed({
        code: err instanceof FrameCodecError ? err.closeCode : 1002,
        reason: err instanceof Error ? err.message : 'decode error',
      });
      try {
        this.socket.destroy();
      } catch {
        /* ignore */
      }
      return;
    }
    this.buffer = Buffer.from(decoded.rest);
    for (const frame of decoded.frames) {
      if (frame.opcode === OP_TEXT) {
        let text: string;
        try {
          text = utf8Strict(frame.payload);
        } catch {
          this.markClosed({ code: 1007, reason: 'invalid utf-8 from server' });
          return;
        }
        this.texts.push(text);
        this.matchMessageWaiters();
      } else if (frame.opcode === OP_PING) {
        if (!this.closeEchoSent) {
          this.write(encodeFrame(OP_PONG, frame.payload, { mask: true })).catch(() => undefined);
        }
      } else if (frame.opcode === OP_PONG) {
        const pending = this.pendingPongs.shift();
        if (pending) pending.resolve();
      } else if (frame.opcode === OP_CLOSE) {
        let info: WsCloseInfo = { code: 1005, reason: '' };
        try {
          const parsed = parseClosePayload(frame.payload);
          info = { code: parsed.code, reason: parsed.reason };
        } catch {
          info = { code: 1002, reason: 'bad close payload from server' };
        }
        this.receivedServerClose = info;
        if (this.ownCloseInfo === null) this.ownCloseInfo = info;
        if (!this.closeEchoSent) {
          this.closeEchoSent = true;
          const echoCode = info.code === 1005 ? CLOSE_NORMAL : info.code;
          this.write(encodeFrame(OP_CLOSE, encodeClosePayload(echoCode, ''), { mask: true })).catch(() => undefined);
        }
        try {
          this.socket.end();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private matchMessageWaiters(): void {
    for (let i = 0; i < this.messageWaiters.length; ) {
      const waiter = this.messageWaiters[i];
      if (!waiter) {
        i += 1;
        continue;
      }
      const idx = this.texts.findIndex(waiter.predicate);
      const hit = idx >= 0 ? this.texts[idx] : undefined;
      if (idx >= 0 && hit !== undefined) {
        this.messageWaiters.splice(i, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(hit);
      } else {
        i += 1;
      }
    }
  }

  private markClosed(info: WsCloseInfo): void {
    if (this.closed) return;
    this.closed = true;
    if (this.ownCloseInfo === null) this.ownCloseInfo = info;
    for (const waiter of this.messageWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`${this.id} closed while waiting for a message`));
    }
    for (const waiter of this.closeWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve(this.ownCloseInfo);
    }
    for (const pending of this.pendingPongs.splice(0)) pending.reject(new Error(`${this.id} closed before pong`));
  }
}
