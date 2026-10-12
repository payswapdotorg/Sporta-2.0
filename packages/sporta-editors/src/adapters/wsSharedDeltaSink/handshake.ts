/** w6c-1: RFC 6455 opening handshake (§4.2) — accept hash, request validation, response bytes. */
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const WEBSOCKET_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const WEBSOCKET_VERSION = '13';

export function computeSecWebSocketAccept(secWebSocketKey: string): string {
  return createHash('sha1').update(secWebSocketKey + WEBSOCKET_MAGIC_GUID).digest('base64');
}

export interface UpgradeRejection {
  readonly statusCode: number;
  readonly reason: string;
}

export interface UpgradeValidationOptions {
  /** Exact request path to accept (e.g. '/shared-deltas'); undefined accepts any path. */
  readonly expectedPath?: string;
  /** w7c-3 additive: the subprotocol to echo in the 101 (RFC 6455 §4.2.2). */
  readonly echoProtocol?: string;
}

function headerOf(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

/** The client key must be the canonical base64 of exactly 16 bytes (RFC 6455 §4.2.1). */
export function isValidClientKey(key: string): boolean {
  try {
    const decoded = Buffer.from(key, 'base64');
    return decoded.length === 16 && decoded.toString('base64') === key;
  } catch {
    return false;
  }
}

export function validateUpgradeRequest(
  req: IncomingMessage,
  options: UpgradeValidationOptions = {},
): UpgradeRejection | null {
  if (options.expectedPath !== undefined && (req.url ?? '/') !== options.expectedPath) {
    return { statusCode: 404, reason: `unknown path ${req.url ?? '/'}` };
  }
  const upgradeHeader = headerOf(req, 'upgrade');
  if (upgradeHeader === null || !upgradeHeader.toLowerCase().includes('websocket')) {
    return { statusCode: 400, reason: 'missing Upgrade: websocket' };
  }
  const connectionTokens = (headerOf(req, 'connection') ?? '')
    .toLowerCase()
    .split(',')
    .map((token) => token.trim());
  if (!connectionTokens.includes('upgrade')) {
    return { statusCode: 400, reason: 'missing Connection: Upgrade' };
  }
  if (headerOf(req, 'sec-websocket-version') !== WEBSOCKET_VERSION) {
    return { statusCode: 426, reason: 'Sec-WebSocket-Version must be 13' };
  }
  const key = headerOf(req, 'sec-websocket-key');
  if (key === null || !isValidClientKey(key)) {
    return { statusCode: 400, reason: 'missing or invalid Sec-WebSocket-Key' };
  }
  return null;
}

export function buildHandshakeResponse(accept: string, echoProtocol?: string): string {
  // w7c-3 additive: an optional Sec-WebSocket-Protocol echo (RFC 6455
  // §4.2.2 — the server includes the one subprotocol it selected). Absent
  // param = the exact w6c bytes (backward-compat law).
  const protocolHeader =
    echoProtocol === undefined ? '' : `Sec-WebSocket-Protocol: ${echoProtocol}\r\n`;
  return (
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    protocolHeader +
    '\r\n'
  );
}

function httpStatusText(code: number): string {
  if (code === 400) return 'Bad Request';
  if (code === 401) return 'Unauthorized'; // w7c-3 additive: token rejections
  if (code === 403) return 'Forbidden'; // w7c-3 additive: origin rejections
  if (code === 404) return 'Not Found';
  if (code === 426) return 'Upgrade Required';
  return 'Error';
}

export function buildHandshakeFailureResponse(rejection: UpgradeRejection): string {
  const reason = rejection.reason.replace(/[\r\n]/g, ' ');
  return (
    `HTTP/1.1 ${rejection.statusCode} ${httpStatusText(rejection.statusCode)}\r\n` +
    'Connection: close\r\n' +
    'Content-Length: 0\r\n' +
    `X-Sporta-Upgrade-Rejection: ${reason}\r\n` +
    '\r\n'
  );
}

/** Single source of truth: validate + build the exact response bytes in one pass. */
export function handshakeResponseFor(
  req: IncomingMessage,
  options: UpgradeValidationOptions = {},
): { accepted: boolean; response: string } {
  const rejection = validateUpgradeRequest(req, options);
  if (rejection !== null) return { accepted: false, response: buildHandshakeFailureResponse(rejection) };
  const key = headerOf(req, 'sec-websocket-key') as string;
  return {
    accepted: true,
    response: buildHandshakeResponse(computeSecWebSocketAccept(key), options.echoProtocol),
  };
}
