/**
 * w6c-1: minimal honest RFC 6455 frame codec — node stdlib only.
 * Laws: SPEC §W6C-1 (masking, extended lengths, control frames, caps, strict UTF-8, close codes).
 */
import { randomBytes } from 'node:crypto';

export const OP_CONTINUATION = 0x0;
export const OP_TEXT = 0x1;
export const OP_BINARY = 0x2;
export const OP_CLOSE = 0x8;
export const OP_PING = 0x9;
export const OP_PONG = 0xa;

export const CLOSE_NORMAL = 1000;
export const CLOSE_GOING_AWAY = 1001;
export const CLOSE_PROTOCOL_ERROR = 1002;
export const CLOSE_INVALID_PAYLOAD = 1007;
export const CLOSE_MESSAGE_TOO_BIG = 1009;
export const CLOSE_INTERNAL_ERROR = 1011;

export const MAX_CONTROL_PAYLOAD = 125;
const LENGTH_16_MARKER = 126;
const LENGTH_64_MARKER = 127;
const INVALID_WIRE_CLOSE_CODES: ReadonlySet<number> = new Set([1004, 1005, 1006, 1015]);

export interface WireFrame {
  readonly fin: boolean;
  readonly opcode: number;
  /** Payload bytes with the client mask removed (or never applied, server→client). */
  readonly payload: Buffer;
}

export class FrameCodecError extends Error {
  readonly closeCode: number;
  constructor(message: string, closeCode: number = CLOSE_PROTOCOL_ERROR) {
    super(message);
    this.name = 'FrameCodecError';
    this.closeCode = closeCode;
  }
}

export interface EncodeFrameOptions {
  /** REQUIRED for client→server frames (RFC 6455 §5.1). Omit for server→client. */
  readonly mask?: boolean;
  readonly fin?: boolean;
}

export function isControlOpcode(opcode: number): boolean {
  return opcode === OP_CLOSE || opcode === OP_PING || opcode === OP_PONG;
}

/** Default frame payload cap (1 MiB — SPEC §W6C-1). */
export const DEFAULT_MAX_FRAME_PAYLOAD_BYTES = 1 << 20;

export function applyMaskInPlace(payload: Buffer, maskingKey: Buffer): void {
  for (let i = 0; i < payload.length; i += 1) {
    payload[i] = (payload[i] ?? 0) ^ (maskingKey[i & 3] ?? 0);
  }
}

export function encodeFrame(opcode: number, payload: Buffer = Buffer.alloc(0), options: EncodeFrameOptions = {}): Buffer {
  const mask = options.mask === true;
  const fin = options.fin !== false;
  if (isControlOpcode(opcode)) {
    if (!fin) throw new FrameCodecError('control frames must not be fragmented');
    if (payload.length > MAX_CONTROL_PAYLOAD) throw new FrameCodecError('control frame payload exceeds 125 bytes');
  }
  const len = payload.length;
  const extraLengthBytes = len > 0xffff ? 8 : len > MAX_CONTROL_PAYLOAD ? 2 : 0;
  const header = Buffer.alloc(2 + extraLengthBytes + (mask ? 4 : 0));
  header[0] = (fin ? 0x80 : 0x00) | (opcode & 0x0f);
  header[1] =
    (mask ? 0x80 : 0x00) |
    (extraLengthBytes === 8 ? LENGTH_64_MARKER : extraLengthBytes === 2 ? LENGTH_16_MARKER : len);
  let offset = 2;
  if (extraLengthBytes === 8) {
    header.writeBigUInt64BE(BigInt(len), 2);
    offset = 10;
  } else if (extraLengthBytes === 2) {
    header.writeUInt16BE(len, 2);
    offset = 4;
  }
  if (!mask) return Buffer.concat([header, payload]);
  const maskingKey = randomBytes(4);
  maskingKey.copy(header, offset);
  const masked = Buffer.from(payload);
  applyMaskInPlace(masked, maskingKey);
  return Buffer.concat([header, masked]);
}

export interface DecodeFramesOptions {
  /** true when decoding client→server bytes (peer MUST mask); false for server→client (peer MUST NOT mask). */
  readonly requireMask: boolean;
  readonly maxFramePayloadBytes: number;
}

export interface DecodedFrames {
  readonly frames: WireFrame[];
  /** Unconsumed trailing bytes (incomplete frame) — feed back with the next chunk. */
  readonly rest: Buffer;
}

export function decodeFrames(buffer: Buffer, options: DecodeFramesOptions): DecodedFrames {
  const frames: WireFrame[] = [];
  let cursor = 0;
  while (cursor + 2 <= buffer.length) {
    const first = buffer[cursor] ?? 0;
    const second = buffer[cursor + 1] ?? 0;
    const fin = (first & 0x80) !== 0;
    const rsv = first & 0x70;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let len = second & 0x7f;
    let offset = cursor + 2;
    if (rsv !== 0) throw new FrameCodecError('RSV bits set without a negotiated extension');
    if (options.requireMask && !masked) throw new FrameCodecError('client frame is not masked (RFC 6455 §5.1)');
    if (!options.requireMask && masked) throw new FrameCodecError('server frame must not be masked');
    if (len === LENGTH_16_MARKER) {
      if (offset + 2 > buffer.length) break;
      len = buffer.readUInt16BE(offset);
      offset += 2;
      if (len <= MAX_CONTROL_PAYLOAD) throw new FrameCodecError('non-minimal 16-bit length encoding');
    } else if (len === LENGTH_64_MARKER) {
      if (offset + 8 > buffer.length) break;
      const bigLen = buffer.readBigUInt64BE(offset);
      offset += 8;
      if (bigLen > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new FrameCodecError('frame length exceeds the safe integer range', CLOSE_MESSAGE_TOO_BIG);
      }
      len = Number(bigLen);
      if (len <= 0xffff) throw new FrameCodecError('non-minimal 64-bit length encoding');
    }
    if (len > options.maxFramePayloadBytes) {
      throw new FrameCodecError(`frame payload ${len} exceeds cap ${options.maxFramePayloadBytes}`, CLOSE_MESSAGE_TOO_BIG);
    }
    if (isControlOpcode(opcode)) {
      if (!fin) throw new FrameCodecError('fragmented control frame');
      if (len > MAX_CONTROL_PAYLOAD) throw new FrameCodecError('control frame payload exceeds 125 bytes');
    }
    const maskingKeyLength = masked ? 4 : 0;
    if (offset + maskingKeyLength + len > buffer.length) break; // incomplete frame: wait for more bytes
    let payload = buffer.subarray(offset + maskingKeyLength, offset + maskingKeyLength + len);
    if (masked) {
      payload = Buffer.from(payload);
      applyMaskInPlace(payload, buffer.subarray(offset, offset + 4));
    }
    frames.push({ fin, opcode, payload });
    cursor = offset + maskingKeyLength + len;
  }
  return { frames, rest: buffer.subarray(cursor) };
}

/** Strict UTF-8: Node replaces invalid sequences with U+FFFD, so a round-trip mismatch detects them. */
export function utf8Strict(payload: Buffer): string {
  const text = payload.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(payload)) {
    throw new FrameCodecError('invalid utf-8 in text payload', CLOSE_INVALID_PAYLOAD);
  }
  return text;
}

export function isValidWireCloseCode(code: number): boolean {
  return code >= 1000 && code <= 4999 && !INVALID_WIRE_CLOSE_CODES.has(code);
}

export function parseClosePayload(payload: Buffer): { code: number; reason: string } {
  if (payload.length === 0) return { code: 1005, reason: '' }; // "no status code" (never re-sent on the wire)
  if (payload.length === 1) throw new FrameCodecError('close payload must be 0 or >= 2 bytes');
  const code = payload.readUInt16BE(0);
  if (!isValidWireCloseCode(code)) throw new FrameCodecError(`invalid close code ${code}`);
  return { code, reason: utf8Strict(payload.subarray(2)) };
}

export function encodeClosePayload(code: number, reason: string): Buffer {
  if (!isValidWireCloseCode(code)) throw new FrameCodecError(`close code ${code} must never go on the wire`);
  const reasonBytes = Buffer.from(reason, 'utf8');
  if (reasonBytes.length > MAX_CONTROL_PAYLOAD - 2) throw new FrameCodecError('close reason too long');
  const buf = Buffer.alloc(2 + reasonBytes.length);
  buf.writeUInt16BE(code, 0);
  reasonBytes.copy(buf, 2);
  return buf;
}
