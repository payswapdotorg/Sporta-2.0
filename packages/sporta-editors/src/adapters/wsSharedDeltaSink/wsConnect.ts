/**
 * w7c-3: `connectWs` — the stdlib client's connection builder (split out of
 * `wsClient.ts` in w7c-3 for the file-size law; `wsClient.ts` re-exports the
 * identical names, so every historical import path keeps working).
 *
 * The client-side auth surface (additive, SPEC §W7C-3): `origin` (the
 * `Origin` header value), `token` (offered as the single
 * `Sec-WebSocket-Protocol` value and VERIFIED against the server's 101 echo —
 * RFC 6455 §4.2.2; a dishonest handshake fails loudly), and `subprotocols`
 * (the raw multi-offer form for the fail-closed rejection lanes).
 */
import { randomBytes } from 'node:crypto';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { Socket as TcpSocket } from 'node:net';
import { computeSecWebSocketAccept } from './handshake.js';
import { WsTestClientImpl, type WsTestClient } from './wsClientImpl.js';

export interface ConnectWsOptions {
  readonly host: string;
  readonly port: number;
  readonly path?: string;
  readonly timeoutMs?: number;
  /** w7c-3 additive: the `Origin` header value to offer (absent = no Origin header, the w6c behavior). */
  readonly origin?: string;
  /**
   * w7c-3 additive: the shared auth token, offered as the single
   * `Sec-WebSocket-Protocol` value. The client VERIFIES the server echoed
   * it in the 101 (RFC 6455 §4.2.2) — a dishonest handshake fails loudly.
   */
  readonly token?: string;
  /**
   * w7c-3 additive: the raw multi-offer form (fails closed on w7c-3
   * servers, which demand exactly one subprotocol — the rejection lane).
   * `token` and `subprotocols` are mutually exclusive.
   */
  readonly subprotocols?: readonly string[];
}

export function connectWs(options: ConnectWsOptions): Promise<WsTestClient> {
  if (options.token !== undefined && options.subprotocols !== undefined) {
    return Promise.reject(new Error('connectWs: token and subprotocols are mutually exclusive'));
  }
  const key = randomBytes(16).toString('base64');
  // The offered subprotocols: a single token, or the raw multi-offer form.
  const offeredProtocols =
    options.subprotocols !== undefined && options.subprotocols.length > 0
      ? [...options.subprotocols]
      : options.token !== undefined
        ? [options.token]
        : [];
  return new Promise<WsTestClient>((resolve, reject) => {
    let settled = false;
    const fail = (err: Error): void => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    const req: ClientRequest = httpRequest({
      host: options.host,
      port: options.port,
      path: options.path ?? '/',
      headers: {
        Host: `${options.host}:${options.port}`,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        ...(options.origin === undefined ? {} : { Origin: options.origin }),
        ...(offeredProtocols.length === 0
          ? {}
          : { 'Sec-WebSocket-Protocol': offeredProtocols.join(', ') }),
      },
    });
    const timer = setTimeout(() => {
      req.destroy();
      fail(new Error('connectWs timeout'));
    }, options.timeoutMs ?? 5000);
    timer.unref?.();
    req.on('response', (res: IncomingMessage) => {
      clearTimeout(timer);
      fail(new Error(`expected a 101 upgrade, got HTTP ${String(res.statusCode)}`));
    });
    req.on('upgrade', (res: IncomingMessage, socket: Duplex, head: Buffer) => {
      clearTimeout(timer);
      if (res.statusCode !== 101) {
        socket.destroy();
        fail(new Error(`unexpected upgrade status ${String(res.statusCode)}`));
        return;
      }
      if (res.headers['sec-websocket-accept'] !== computeSecWebSocketAccept(key)) {
        socket.destroy();
        fail(new Error('Sec-WebSocket-Accept mismatch — the handshake is not honest'));
        return;
      }
      // w7c-3: when we offered exactly one auth subprotocol, the server MUST
      // echo it (RFC 6455 §4.2.2) — an un-echoed or divergent echo means the
      // auth was not actually applied; that handshake is dishonest, fail it.
      if (offeredProtocols.length === 1) {
        const echoed = res.headers['sec-websocket-protocol'];
        const echoedFirst = Array.isArray(echoed) ? echoed[0] : echoed;
        if (echoedFirst !== offeredProtocols[0]) {
          socket.destroy();
          fail(
            new Error(
              `Sec-WebSocket-Protocol echo mismatch — offered "${String(offeredProtocols[0])}", echoed "${String(echoedFirst)}"`,
            ),
          );
          return;
        }
      }
      const tcp = socket as TcpSocket;
      tcp.setNoDelay(true);
      settled = true;
      resolve(new WsTestClientImpl(tcp, Buffer.from(head)));
    });
    req.on('error', (err: Error) => {
      clearTimeout(timer);
      fail(err);
    });
    req.end();
  });
}
