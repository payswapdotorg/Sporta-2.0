import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSE_INVALID_PAYLOAD,
  CLOSE_MESSAGE_TOO_BIG,
  FrameCodecError,
  OP_CLOSE,
  OP_PING,
  OP_TEXT,
  decodeFrames,
  encodeClosePayload,
  encodeFrame,
  parseClosePayload,
  utf8Strict,
} from '../src/adapters/wsSharedDeltaSink/frameCodec.js';

const DEC_SERVER = { requireMask: true, maxFramePayloadBytes: 1_048_576 } as const; // decoding client→server bytes
const DEC_CLIENT = { requireMask: false, maxFramePayloadBytes: 1_048_576 } as const; // decoding server→client bytes

test('w6c-1 codec: server→client text frame round-trips unmasked', () => {
  const wire = encodeFrame(OP_TEXT, Buffer.from('{"revision":1}', 'utf8'));
  assert.equal((wire[1] & 0x80) !== 0, false); // MASK bit MUST be clear server→client
  const { frames, rest } = decodeFrames(wire, DEC_CLIENT);
  assert.equal(rest.length, 0);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].opcode, OP_TEXT);
  assert.equal(frames[0].fin, true);
  assert.equal(frames[0].payload.toString('utf8'), '{"revision":1}');
});

test('w6c-1 codec: client→server masked frame round-trips; mask is stripped on decode', () => {
  const wire = encodeFrame(OP_TEXT, Buffer.from('hello delta', 'utf8'), { mask: true });
  assert.equal((wire[1] & 0x80) !== 0, true); // MASK bit REQUIRED client→server
  const { frames } = decodeFrames(wire, DEC_SERVER);
  assert.equal(frames[0].payload.toString('utf8'), 'hello delta');
});

test('w6c-1 codec: 16-bit extended length (300-byte payload) round-trips both directions', () => {
  const payload = Buffer.alloc(300, 0x61);
  const fromServer = decodeFrames(encodeFrame(OP_TEXT, payload), DEC_CLIENT);
  assert.equal(fromServer.frames[0].payload.length, 300);
  const fromClient = decodeFrames(encodeFrame(OP_TEXT, payload, { mask: true }), DEC_SERVER);
  assert.equal(fromClient.frames[0].payload.length, 300);
});

test('w6c-1 codec: 64-bit extended length (70_000-byte payload) round-trips', () => {
  const payload = Buffer.alloc(70_000, 0x62);
  const { frames } = decodeFrames(encodeFrame(OP_TEXT, payload), DEC_CLIENT);
  assert.equal(frames[0].payload.length, 70_000);
  assert.deepEqual(frames[0].payload, payload);
});

test('w6c-1 codec: unmasked client→server frame is a protocol error (1002)', () => {
  assert.throws(() => decodeFrames(encodeFrame(OP_TEXT, Buffer.from('a')), DEC_SERVER), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
});

test('w6c-1 codec: masked server→client frame is a protocol error (1002)', () => {
  assert.throws(() => decodeFrames(encodeFrame(OP_TEXT, Buffer.from('a'), { mask: true }), DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
});

test('w6c-1 codec: RSV bits set without a negotiated extension → 1002', () => {
  const wire = encodeFrame(OP_TEXT, Buffer.from('a'));
  wire[0] |= 0x40;
  assert.throws(() => decodeFrames(wire, DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
});

test('w6c-1 codec: control frame payload > 125 rejected on encode and decode', () => {
  assert.throws(() => encodeFrame(OP_PING, Buffer.alloc(126)));
  const wire = encodeFrame(OP_PING, Buffer.alloc(4));
  wire[1] = (wire[1] & 0x80) | 126; // forge an over-long control length
  assert.throws(() => decodeFrames(wire, DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
});

test('w6c-1 codec: fragmented control frames rejected', () => {
  assert.throws(() => encodeFrame(OP_PING, Buffer.alloc(0), { fin: false }));
  const wire = encodeFrame(OP_PING, Buffer.alloc(0));
  wire[0] &= 0x7f; // clear FIN
  assert.throws(() => decodeFrames(wire, DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
});

test('w6c-1 codec: header claiming length beyond cap → 1009 WITHOUT buffering the body', () => {
  const header = Buffer.alloc(10);
  header[0] = 0x81; // FIN + text
  header[1] = 0x7f; // 127 → 64-bit length
  header.writeBigUInt64BE(BigInt(10_000_000), 2);
  assert.throws(() => decodeFrames(header, DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === CLOSE_MESSAGE_TOO_BIG);
});

test('w6c-1 codec: non-minimal length encodings → 1002', () => {
  const nonMinimal16 = Buffer.from([0x81, 0x7e, 0x00, 0x01, 0x61]); // 126-marker for a 1-byte payload
  assert.throws(() => decodeFrames(nonMinimal16, DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
  const nonMinimal64 = Buffer.alloc(10);
  nonMinimal64[0] = 0x81;
  nonMinimal64[1] = 0x7f;
  nonMinimal64.writeBigUInt64BE(BigInt(200), 2);
  assert.throws(() => decodeFrames(nonMinimal64, DEC_CLIENT), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
});

test('w6c-1 codec: streaming — partial frames wait in rest, completion decodes exactly', () => {
  const wire = encodeFrame(OP_TEXT, Buffer.from('0123456789'));
  const first = decodeFrames(wire.subarray(0, 5), DEC_CLIENT);
  assert.equal(first.frames.length, 0);
  assert.ok(first.rest.length > 0);
  const second = decodeFrames(Buffer.concat([first.rest, wire.subarray(5)]), DEC_CLIENT);
  assert.equal(second.frames.length, 1);
  assert.equal(second.frames[0].payload.toString(), '0123456789');
  assert.equal(second.rest.length, 0);
});

test('w6c-1 codec: multiple frames in one chunk decode in order', () => {
  const wire = Buffer.concat([encodeFrame(OP_TEXT, Buffer.from('one')), encodeFrame(OP_TEXT, Buffer.from('two'))]);
  const { frames } = decodeFrames(wire, DEC_CLIENT);
  assert.deepEqual(frames.map((f) => f.payload.toString()), ['one', 'two']);
});

test('w6c-1 codec: strict UTF-8 and close-payload laws', () => {
  assert.throws(() => utf8Strict(Buffer.from([0xff, 0xfe])), (err: unknown) => err instanceof FrameCodecError && err.closeCode === CLOSE_INVALID_PAYLOAD);
  assert.deepEqual(parseClosePayload(encodeClosePayload(3000, 'done')), { code: 3000, reason: 'done' });
  assert.throws(() => parseClosePayload(Buffer.from([0x0b])), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
  assert.throws(() => parseClosePayload(encodeClosePayload(1004, '')), (err: unknown) => err instanceof FrameCodecError && err.closeCode === 1002);
  assert.throws(() => encodeClosePayload(1005, ''), (err: unknown) => err instanceof FrameCodecError); // reserved codes never go on the wire
  assert.equal(decodeFrames(encodeFrame(OP_CLOSE, encodeClosePayload(1000, '')), DEC_CLIENT).frames[0].opcode, OP_CLOSE);
});
