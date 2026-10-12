/**
 * w7c-3 REAL test lanes: origin allow-list + shared-token auth on the RFC 6455
 * upgrade (SPEC §W7C-3). Real loopback TCP, real handshakes, real frames.
 *
 * RUNTIME LAW: node:test + tsx (bun does not deliver http 'upgrade' events).
 *
 * The fail-closed law under test: a refused upgrade gets an honest HTTP
 * status (403 origin / 401 token) and the connection NEVER frames — the
 * server's connection count stays zero and no WebSocket frame is ever sent.
 * Absent auth config = the documented dev-mode law (the plain w6c client
 * connects with no Origin and no token — the backward-compat law).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WsServer } from '../src/adapters/wsSharedDeltaSink/wsServer.js';
import { WsSharedDeltaSink } from '../src/adapters/wsSharedDeltaSink/wsSharedDeltaSink.js';
import { connectWs } from '../src/adapters/wsSharedDeltaSink/wsClient.js';
import {
  WsAuthConfigError,
  timingSafeTokenEqual,
  validateWsUpgradeAuthConfig,
  type UpgradeAuthRejection,
} from '../src/adapters/wsSharedDeltaSink/wsAuth.js';

const PATH = '/shared-deltas';
const ALLOWED_ORIGIN = 'http://localhost:3000';
const OTHER_ORIGIN = 'http://evil.example:8080';
const TOKEN = 'sporta-test-shared-token-0123456789abcdef';
const WRONG_TOKEN = 'wrong-token-0000000000000000000000000';
const AUTH = { allowedOrigins: [ALLOWED_ORIGIN], sharedToken: TOKEN };

test('w7c-3 REAL: allowed origin + correct token connects; a delta frames end-to-end; the 101 echoes the auth subprotocol', async () => {
  const server = new WsServer({ path: PATH, auth: AUTH });
  try {
    const port = await server.listen(0);
    const client = await connectWs({ host: '127.0.0.1', port, path: PATH, origin: ALLOWED_ORIGIN, token: TOKEN });
    assert.equal(server.connectionCount(), 1, 'the authorized connection is live');
    const sent = server.listConnections()[0]?.sendText('{"delta":"after-auth"}');
    await sent;
    assert.equal(await client.waitForMessage(undefined, 2000), '{"delta":"after-auth"}');
    await client.close(1000);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL: wrong origin is refused 403 BEFORE the handshake — never frames, zero server connections, audited', async () => {
  const rejections: UpgradeAuthRejection[] = [];
  const server = new WsServer({ path: PATH, auth: AUTH });
  server.on({ onAuthRejection: (rejection) => rejections.push(rejection) });
  try {
    const port = await server.listen(0);
    await assert.rejects(
      connectWs({ host: '127.0.0.1', port, path: PATH, origin: OTHER_ORIGIN, token: TOKEN }),
      /got HTTP 403/,
      'the refused upgrade surfaces as an honest HTTP 403',
    );
    assert.equal(server.connectionCount(), 0, 'the connection never frames');
    assert.equal(rejections.length, 1);
    assert.equal(rejections[0]?.kind, 'origin');
    assert.equal(rejections[0]?.statusCode, 403);
    assert.match(rejections[0]?.reason ?? '', /not allowed/);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL: missing Origin header is refused 403 (fail-closed: non-browser clients must send it too)', async () => {
  const server = new WsServer({ path: PATH, auth: AUTH });
  try {
    const port = await server.listen(0);
    // token offered, but NO Origin header (the raw non-browser posture)
    await assert.rejects(
      connectWs({ host: '127.0.0.1', port, path: PATH, token: TOKEN }),
      /got HTTP 403/,
    );
    assert.equal(server.connectionCount(), 0);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL: wrong token is refused 401 — never frames, zero server connections, audited', async () => {
  const rejections: UpgradeAuthRejection[] = [];
  const server = new WsServer({ path: PATH, auth: AUTH });
  server.on({ onAuthRejection: (rejection) => rejections.push(rejection) });
  try {
    const port = await server.listen(0);
    await assert.rejects(
      connectWs({ host: '127.0.0.1', port, path: PATH, origin: ALLOWED_ORIGIN, token: WRONG_TOKEN }),
      /got HTTP 401/,
      'the refused upgrade surfaces as an honest HTTP 401',
    );
    assert.equal(server.connectionCount(), 0, 'the connection never frames');
    assert.equal(rejections.length, 1);
    assert.equal(rejections[0]?.kind, 'token');
    assert.equal(rejections[0]?.statusCode, 401);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL: missing auth subprotocol is refused 401', async () => {
  const server = new WsServer({ path: PATH, auth: AUTH });
  try {
    const port = await server.listen(0);
    await assert.rejects(
      connectWs({ host: '127.0.0.1', port, path: PATH, origin: ALLOWED_ORIGIN }),
      /got HTTP 401/,
    );
    assert.equal(server.connectionCount(), 0);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL: multiple offered subprotocols are refused 401 (exactly one token is the law)', async () => {
  const server = new WsServer({ path: PATH, auth: AUTH });
  try {
    const port = await server.listen(0);
    await assert.rejects(
      connectWs({
        host: '127.0.0.1',
        port,
        path: PATH,
        origin: ALLOWED_ORIGIN,
        subprotocols: [TOKEN, 'chat-v1'],
      }),
      /got HTTP 401/,
    );
    assert.equal(server.connectionCount(), 0);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL (backward-compat law): absent auth config stays open for the plain client — the documented dev mode', async () => {
  const server = new WsServer({ path: PATH }); // NO auth config
  try {
    const port = await server.listen(0);
    const client = await connectWs({ host: '127.0.0.1', port, path: PATH }); // no Origin, no token
    assert.equal(server.connectionCount(), 1);
    await server.listConnections()[0]?.sendText('{"delta":"dev-mode"}');
    assert.equal(await client.waitForMessage(undefined, 2000), '{"delta":"dev-mode"}');
    await client.close(1000);
  } finally {
    await server.close();
  }
});

test('w7c-3 REAL: the auth option passes through WsSharedDeltaSink (the product-shaped wiring)', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH, auth: AUTH });
  try {
    const port = await sink.listen(0);
    const client = await connectWs({ host: '127.0.0.1', port, path: PATH, origin: ALLOWED_ORIGIN, token: TOKEN });
    assert.equal(sink.clientCount, 1);
    const receipt = await sink.deliver('{"sessionId":"s","revision":1}');
    assert.equal(receipt.delivered, 1);
    assert.equal(await client.waitForMessage(undefined, 2000), '{"sessionId":"s","revision":1}');
    // and the fail-closed gate still holds on the same sink: wrong token never frames
    await assert.rejects(
      connectWs({ host: '127.0.0.1', port, path: PATH, origin: ALLOWED_ORIGIN, token: WRONG_TOKEN }),
      /got HTTP 401/,
    );
    assert.equal(sink.clientCount, 1, 'only the authorized client is connected');
    await client.close(1000);
  } finally {
    await sink.close();
  }
});

test('w7c-3 (fail-closed config): an empty allow-list, a malformed origin or a weak token throws the typed WsAuthConfigError', () => {
  assert.throws(
    () => validateWsUpgradeAuthConfig({ allowedOrigins: [], sharedToken: TOKEN }),
    WsAuthConfigError,
  );
  assert.throws(
    () => validateWsUpgradeAuthConfig({ allowedOrigins: ['not an origin'], sharedToken: TOKEN }),
    WsAuthConfigError,
  );
  assert.throws(
    () => validateWsUpgradeAuthConfig({ allowedOrigins: [ALLOWED_ORIGIN], sharedToken: 'short' }),
    WsAuthConfigError,
  );
  assert.throws(
    () => validateWsUpgradeAuthConfig({ allowedOrigins: [ALLOWED_ORIGIN], sharedToken: 'has spaces and commas, evil' }),
    WsAuthConfigError,
  );
  // the valid config passes (and the constructor path fail-closes the same way)
  validateWsUpgradeAuthConfig(AUTH);
  assert.throws(() => new WsServer({ auth: { allowedOrigins: [], sharedToken: TOKEN } }), WsAuthConfigError);
});

test('w7c-3 (constant-time compare): timingSafeTokenEqual accepts only the exact token', () => {
  assert.equal(timingSafeTokenEqual(TOKEN, TOKEN), true);
  assert.equal(timingSafeTokenEqual(WRONG_TOKEN, TOKEN), false);
  assert.equal(timingSafeTokenEqual('', TOKEN), false);
  assert.equal(timingSafeTokenEqual(TOKEN, ''), false);
  assert.equal(timingSafeTokenEqual(TOKEN.toUpperCase(), TOKEN), false, 'comparison is case-sensitive');
});
