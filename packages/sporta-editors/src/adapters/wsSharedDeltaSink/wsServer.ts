/** w6c-1: minimal honest RFC 6455 server over node:http — upgrade, frames, close (SPEC §W6C-1). */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Socket as TcpSocket } from 'node:net';
import {
  CLOSE_GOING_AWAY,
  CLOSE_NORMAL,
  FrameCodecError,
  OP_BINARY,
  OP_CLOSE,
  OP_CONTINUATION,
  OP_PING,
  OP_PONG,
  OP_TEXT,
  decodeFrames,
  encodeClosePayload,
  encodeFrame,
  isControlOpcode,
  parseClosePayload,
  utf8Strict,
  type WireFrame,
} from './frameCodec.js';
import { handshakeResponseFor } from './handshake.js';

export const DEFAULT_MAX_FRAME_PAYLOAD_BYTES = 1_048_576;
export const DEFAULT_MAX_MESSAGE_BYTES = 1_048_576;

export interface WsServerOptions {
  readonly path?: string;
  readonly maxFramePayloadBytes?: number;
  readonly maxMessageBytes?: number;
}

export interface WsCloseInfo {
  readonly code: number;
  readonly reason: string;
}

export interface WsServerConnection {
  readonly id: string;
  readonly remoteAddress: string | undefined;
  /** One unmasked text frame (server→client). Resolves when bytes are flushed to the socket. */
  sendText(text: string): Promise<void>;
  /** Begins the RFC 6455 §7 closing handshake; resolves when the peer closes or the guard fires. */
  close(code?: number, reason?: string): Promise<void>;
  readonly closeInfo: WsCloseInfo | null;
}

export interface WsServerHandlers {
  onConnection?(connection: WsServerConnection): void;
  onText?(connection: WsServerConnection, text: string): void;
  onClose?(connection: WsServerConnection, close: WsCloseInfo): void;
}

interface ConnState {
  id: string;
  socket: TcpSocket;
  view: WsServerConnection;
  buffer: Buffer;
  fragments: { opcode: number; chunks: Buffer[]; bytes: number } | null;
  closeSent: boolean;
  closeInfo: WsCloseInfo | null;
  closeEmitted: boolean;
}

export class WsServer {
  private readonly httpServer: Server;
  private readonly path: string | undefined;
  private readonly maxFramePayloadBytes: number;
  private readonly maxMessageBytes: number;
  private readonly states = new Map<string, ConnState>();
  private handlers: WsServerHandlers = {};
  private nextId = 0;

  constructor(options: WsServerOptions = {}) {
    this.path = options.path;
    this.maxFramePayloadBytes = options.maxFramePayloadBytes ?? DEFAULT_MAX_FRAME_PAYLOAD_BYTES;
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
    this.httpServer = createServer((_req, res) => {
      res.statusCode = 426;
      res.setHeader('Upgrade', 'websocket');
      res.end('Upgrade Required');
    });
    this.httpServer.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket as TcpSocket, head));
  }

  on(handlers: WsServerHandlers): void {
    this.handlers = handlers;
  }

  /** Binds the listener. Port 0 → OS-assigned; resolves with the ACTUAL bound port read back. */
  listen(port: number, host: string = '127.0.0.1'): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onError = (err: Error): void => reject(err);
      const onListening = (): void => {
        this.httpServer.off('error', onError);
        const address = this.httpServer.address();
        if (address === null || typeof address === 'string') reject(new Error('http server address unavailable'));
        else resolve((address as AddressInfo).port);
      };
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);
      this.httpServer.listen(port, host);
    });
  }

  connectionCount(): number {
    return this.states.size;
  }

  connectionIds(): string[] {
    return [...this.states.keys()].sort();
  }

  listConnections(): WsServerConnection[] {
    return [...this.states.values()].map((state) => state.view);
  }

  connectionById(id: string): WsServerConnection | undefined {
    return this.states.get(id)?.view;
  }

  /** Closes every client with 1001 Going Away, then stops the listener. */
  async close(): Promise<void> {
    await Promise.all(
      [...this.states.values()].map((state) => this.closeConnection(state, { code: CLOSE_GOING_AWAY, reason: 'server shutting down' })),
    );
    for (const state of this.states.values()) {
      try {
        state.socket.destroy();
      } catch {
        /* ignore */
      }
    }
    await new Promise<void>((resolve) => this.httpServer.close(() => resolve()));
  }

  private handleUpgrade(req: IncomingMessage, socket: TcpSocket, head: Buffer): void {
    const handshake = handshakeResponseFor(req, { expectedPath: this.path });
    socket.write(handshake.response);
    if (!handshake.accepted) {
      socket.destroy();
      return;
    }
    socket.setNoDelay(true);
    const id = `ws-conn-${String(++this.nextId).padStart(6, '0')}`;
    const state: ConnState = {
      id,
      socket,
      view: null as unknown as WsServerConnection,
      buffer: Buffer.from(head),
      fragments: null,
      closeSent: false,
      closeInfo: null,
      closeEmitted: false,
    };
    state.view = {
      id,
      remoteAddress: socket.remoteAddress ?? undefined,
      sendText: (text) => this.sendText(state, text),
      close: (code = CLOSE_NORMAL, reason = '') => this.closeConnection(state, { code, reason }),
      get closeInfo() {
        return state.closeInfo;
      },
    };
    this.states.set(id, state);
    socket.on('data', (chunk: Buffer) => this.onBytes(state, chunk));
    socket.on('error', () => this.teardown(state));
    socket.on('close', () => this.teardown(state));
    this.handlers.onConnection?.(state.view);
  }

  private sendText(state: ConnState, text: string): Promise<void> {
    if (state.closeSent || state.socket.destroyed) {
      return Promise.reject(new Error(`connection ${state.id} is closed`));
    }
    return this.writeFrame(state, encodeFrame(OP_TEXT, Buffer.from(text, 'utf8')));
  }

  private writeFrame(state: ConnState, bytes: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      state.socket.write(bytes, (err) => (err ? reject(err) : resolve()));
    });
  }

  private onBytes(state: ConnState, chunk: Buffer): void {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    let decoded: ReturnType<typeof decodeFrames>;
    try {
      decoded = decodeFrames(state.buffer, { requireMask: true, maxFramePayloadBytes: this.maxFramePayloadBytes });
    } catch (err) {
      this.failConnection(state, err instanceof FrameCodecError ? err.closeCode : 1011, err instanceof Error ? err.message : 'decoder error');
      return;
    }
    state.buffer = Buffer.from(decoded.rest);
    for (const frame of decoded.frames) {
      if (this.states.get(state.id) !== state) return; // failed/removed mid-batch
      this.onFrame(state, frame);
    }
  }

  private onFrame(state: ConnState, frame: WireFrame): void {
    if (isControlOpcode(frame.opcode)) {
      this.onControlFrame(state, frame);
      return;
    }
    if (frame.opcode === OP_TEXT || frame.opcode === OP_BINARY) {
      if (state.fragments !== null) {
        this.failConnection(state, 1002, 'new data frame during a fragmented message');
        return;
      }
      if (frame.fin) {
        this.onCompleteMessage(state, frame.opcode, [frame.payload]);
        return;
      }
      state.fragments = { opcode: frame.opcode, chunks: [frame.payload], bytes: frame.payload.length };
      return;
    }
    if (frame.opcode === OP_CONTINUATION) {
      const fragments = state.fragments;
      if (fragments === null) {
        this.failConnection(state, 1002, 'continuation frame without an open message');
        return;
      }
      fragments.chunks.push(frame.payload);
      fragments.bytes += frame.payload.length;
      if (fragments.bytes > this.maxMessageBytes) {
        this.failConnection(state, 1009, 'assembled message exceeds cap');
        return;
      }
      if (frame.fin) {
        state.fragments = null;
        this.onCompleteMessage(state, fragments.opcode, fragments.chunks);
      }
      return;
    }
    this.failConnection(state, 1002, `unknown opcode ${frame.opcode}`);
  }

  private onCompleteMessage(state: ConnState, opcode: number, chunks: readonly Buffer[]): void {
    const payload = Buffer.concat([...chunks]);
    if (opcode !== OP_TEXT) return; // binary data frames are read but the delta protocol is text-only (SPEC §W6C-1)
    let text: string;
    try {
      text = utf8Strict(payload);
    } catch (err) {
      this.failConnection(state, err instanceof FrameCodecError ? err.closeCode : 1007, err instanceof Error ? err.message : 'invalid utf-8');
      return;
    }
    this.handlers.onText?.(state.view, text);
  }

  private onControlFrame(state: ConnState, frame: WireFrame): void {
    if (frame.opcode === OP_PING) {
      if (!state.closeSent) this.writeFrame(state, encodeFrame(OP_PONG, frame.payload)).catch(() => undefined);
      return;
    }
    if (frame.opcode === OP_PONG) return; // keepalive acknowledged; liveness is adapter runtime, not domain time
    // OP_CLOSE
    let parsed: ReturnType<typeof parseClosePayload>;
    try {
      parsed = parseClosePayload(frame.payload);
    } catch (err) {
      this.failConnection(state, err instanceof FrameCodecError ? err.closeCode : 1002, err instanceof Error ? err.message : 'bad close payload');
      return;
    }
    if (state.closeInfo === null) state.closeInfo = { code: parsed.code, reason: parsed.reason };
    if (!state.closeSent) {
      state.closeSent = true;
      const echoCode = parsed.code === 1005 ? CLOSE_NORMAL : parsed.code;
      this.writeFrame(state, encodeFrame(OP_CLOSE, encodeClosePayload(echoCode, ''))).catch(() => undefined);
    }
    this.emitClose(state);
    try {
      state.socket.end();
    } catch {
      /* ignore */
    }
  }

  private closeConnection(state: ConnState, close: WsCloseInfo): Promise<void> {
    if (state.closeSent) return Promise.resolve();
    state.closeSent = true;
    if (state.closeInfo === null) state.closeInfo = close;
    return new Promise<void>((resolve) => {
      let settled = false;
      let guard: ReturnType<typeof setTimeout>;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        this.emitClose(state);
        resolve();
      };
      guard = setTimeout(() => {
        try {
          state.socket.destroy();
        } catch {
          /* ignore */
        }
        finish();
      }, 500);
      guard.unref?.();
      try {
        state.socket.write(encodeFrame(OP_CLOSE, encodeClosePayload(close.code, close.reason.slice(0, 100))), () => {
          try {
            state.socket.end(() => finish());
          } catch {
            try {
              state.socket.destroy();
            } catch {
              /* ignore */
            }
            finish();
          }
        });
      } catch {
        try {
          state.socket.destroy();
        } catch {
          /* ignore */
        }
        finish();
      }
    });
  }

  private failConnection(state: ConnState, code: number, reasonText: string): void {
    const close: WsCloseInfo = { code, reason: reasonText.slice(0, 100) };
    if (state.closeInfo === null) state.closeInfo = close;
    if (!state.closeSent) {
      state.closeSent = true;
      try {
        state.socket.write(encodeFrame(OP_CLOSE, encodeClosePayload(code, close.reason)));
      } catch {
        /* ignore */
      }
    }
    this.emitClose(state);
    try {
      state.socket.destroy();
    } catch {
      /* ignore */
    }
  }

  private teardown(state: ConnState): void {
    if (this.states.get(state.id) === state) this.states.delete(state.id);
    this.emitClose(state);
  }

  private emitClose(state: ConnState): void {
    if (state.closeEmitted) return;
    state.closeEmitted = true;
    this.handlers.onClose?.(state.view, state.closeInfo ?? { code: 1006, reason: 'connection lost' });
  }
}
