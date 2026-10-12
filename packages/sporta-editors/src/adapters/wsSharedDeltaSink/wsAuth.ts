/**
 * w7c-3: origin allow-list + shared-token auth for the RFC 6455 upgrade
 * (SPEC §W7C-3). Pure pre-handshake gate: every check runs BEFORE the 101
 * response is written, so a refused upgrade is an honest HTTP status and the
 * connection NEVER frames (the caller writes the failure response and
 * destroys the socket).
 *
 * Mechanism (RFC-honest): browsers cannot set custom headers on a WebSocket,
 * so the shared token rides `Sec-WebSocket-Protocol` (RFC 6455 §4.2) — the
 * client offers EXACTLY ONE subprotocol (the token); the server compares it
 * in constant time and, on success, echoes it in the 101 response (§4.2.2 —
 * the client can verify auth was actually applied).
 *
 * ABSENT auth config (checked by the caller, not here) = the documented
 * dev-mode law: w6c behavior exactly. PRESENT config = fail-closed.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { EditorError } from '../../domain/errors.js';
import { buildHandshakeFailureResponse, type UpgradeRejection } from './handshake.js';

/** The fail-closed auth config (see SPEC §W7C-3). */
export interface WsUpgradeAuthConfig {
  /** Exact-match (case-sensitive, no wildcard) origin allow-list. */
  readonly allowedOrigins: readonly string[];
  /** The shared token, offered as the single Sec-WebSocket-Protocol value. */
  readonly sharedToken: string;
}

/** Why an upgrade was refused (machine-readable kind + honest reason). */
export interface UpgradeAuthRejection extends UpgradeRejection {
  /** 'origin' | 'token' — which check fail-closed. */
  readonly kind: UpgradeAuthKind;
}

export type UpgradeAuthKind = 'origin' | 'token';

/** Fail-closed config validation error (typed, never a silent default). */
export class WsAuthConfigError extends EditorError {
  constructor(message: string, detail = 'ws-auth-config') {
    super(message, detail);
    this.name = 'WsAuthConfigError';
  }
}

/** The token charset: a comma-free RFC 7230 token-safe subset. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
/** Minimum/maximum shared-token length (meaningful tokens only). */
const MIN_TOKEN_CHARS = 16;
const MAX_TOKEN_CHARS = 256;
/** An origin-shaped string: scheme://host[:port] with no whitespace. */
const ORIGIN_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/;

/**
 * Fail-closed config validation. Throws `WsAuthConfigError` on any violation
 * — an empty allow-list or a weak/malformed token must never silently become
 * "allow everything" or a broken wire value.
 */
export function validateWsUpgradeAuthConfig(config: WsUpgradeAuthConfig): void {
  if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
    throw new WsAuthConfigError(
      'ws auth config: allowedOrigins must be a non-empty array (an empty allow-list would be fail-open)',
    );
  }
  for (const origin of config.allowedOrigins) {
    if (typeof origin !== 'string' || !ORIGIN_PATTERN.test(origin)) {
      throw new WsAuthConfigError(
        `ws auth config: origin "${String(origin)}" is not an origin-shaped string (scheme://host[:port], no whitespace)`,
      );
    }
  }
  if (
    typeof config.sharedToken !== 'string' ||
    config.sharedToken.length < MIN_TOKEN_CHARS ||
    config.sharedToken.length > MAX_TOKEN_CHARS ||
    !TOKEN_PATTERN.test(config.sharedToken)
  ) {
    throw new WsAuthConfigError(
      `ws auth config: sharedToken must be ${String(MIN_TOKEN_CHARS)}-${String(MAX_TOKEN_CHARS)} chars of [A-Za-z0-9_-] (comma-free so it can never smuggle a second subprotocol)`,
    );
  }
}

/**
 * Constant-time string equality: sha-256 digests compared with
 * `crypto.timingSafeEqual` (equal-length buffers; the digest hides the
 * token's length too). Used for the shared-token compare.
 */
export function timingSafeTokenEqual(offered: string, expected: string): boolean {
  const offeredDigest = createHash('sha256').update(offered, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(offeredDigest, expectedDigest);
}

function headerOf(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

/**
 * The single offered subprotocol (RFC 6455 §4.2: comma-separated offers).
 * null = absent; an array with more than one entry = a multi-offer (the
 * caller refuses those — the auth protocol is exactly one token).
 */
function offeredSubprotocols(req: IncomingMessage): readonly string[] {
  const header = headerOf(req, 'sec-websocket-protocol');
  if (header === null) return [];
  return header
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * The single offered auth subprotocol, or null when the request offered
 * anything other than exactly one. Exported so the server can echo it in the
 * 101 response (RFC 6455 §4.2.2) after `authorizeUpgrade` accepted.
 */
export function offeredAuthProtocol(req: IncomingMessage): string | null {
  const offered = offeredSubprotocols(req);
  return offered.length === 1 ? (offered[0] as string) : null;
}

/**
 * The fail-closed gate. Returns null when the upgrade is AUTHORIZED (origin
 * allowed AND exactly one offered subprotocol equal to the shared token in
 * constant time); otherwise the typed rejection the caller must answer with
 * (via `authFailureResponseFor`) BEFORE destroying the socket. Order:
 * origin first, then token — policy before credential detail.
 */
export function authorizeUpgrade(
  req: IncomingMessage,
  config: WsUpgradeAuthConfig,
): UpgradeAuthRejection | null {
  const origin = headerOf(req, 'origin');
  if (origin === null) {
    return {
      kind: 'origin',
      statusCode: 403,
      reason: 'missing Origin header (fail-closed: non-browser clients must send it too)',
    };
  }
  if (!config.allowedOrigins.includes(origin)) {
    return { kind: 'origin', statusCode: 403, reason: `origin ${origin} not allowed` };
  }
  const offered = offeredSubprotocols(req);
  if (offered.length === 0) {
    return {
      kind: 'token',
      statusCode: 401,
      reason: 'missing auth subprotocol (offer the shared token as Sec-WebSocket-Protocol)',
    };
  }
  if (offered.length > 1) {
    return {
      kind: 'token',
      statusCode: 401,
      reason: 'exactly one auth subprotocol must be offered',
    };
  }
  const token = offered[0] as string;
  if (!timingSafeTokenEqual(token, config.sharedToken)) {
    return { kind: 'token', statusCode: 401, reason: 'auth token rejected' };
  }
  return null;
}

/**
 * The honest wire response for a refused upgrade: the w6c failure format
 * (HTTP status + `Connection: close` + `X-Sporta-Upgrade-Rejection` reason).
 * The caller writes these bytes, then destroys the socket — no WebSocket
 * frame is ever sent to a refused connection.
 */
export function authFailureResponseFor(rejection: UpgradeAuthRejection): string {
  return buildHandshakeFailureResponse(rejection);
}
