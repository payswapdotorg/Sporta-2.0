import type {
  EditorSessionHistoryQuery,
  EditorSessionRecord,
  EditorSessionSummary,
  Iso8601,
  RightsScope,
  SportaId,
} from "@sporta/contracts/contract";
import { EditorSessionHistoryQueryError } from "./errors.js";
/**
 * Wave-3 editor-session history read seam (domain layer — pure).
 *
 * Implements the TL-serialized read-seam decision
 * (docs/architecture/adr-wave3-read-seams.md): bounded, rights-gated
 * session-history reads for the product projection's takeover/editor
 * stages, behind the authoritative contracts shapes
 * (`EditorSessionHistoryReadPort`). The port type itself is frozen in
 * sporta-contracts; this module owns the additive input extension (the
 * caller's usage context), the store port implementations are built
 * against, and the invariant-22 read gate.
 */

/** Default page size when a query carries no limit (bounded-query law). */
export const EDITOR_SESSION_HISTORY_DEFAULT_LIMIT = 50;

/** Hard ceiling on any single history read, explicit limit included. */
export const EDITOR_SESSION_HISTORY_MAX_LIMIT = 500;

/**
 * The caller's usage context for a rights-gated read (invariant 22 —
 * rights propagate through editors; this is the read boundary's half).
 * Usage classes mirror `RightsScope.usages`/`prohibitions` vocabulary.
 */
export interface EditorSessionHistoryUsageContext {
  /** Usage classes the caller is permitted to exercise. */
  readonly usages: readonly string[];
}

/**
 * The query input this package's read seam accepts: the frozen contracts
 * `EditorSessionHistoryQuery` PLUS an additive options object carrying
 * the caller's usage context. A bare contracts query is structurally
 * valid input — it simply declares no usages, and the gate is fail-closed.
 */
export interface EditorSessionHistoryListInput extends EditorSessionHistoryQuery {
  /**
   * Caller's usage context. Sessions whose PolicySet rights forbid the
   * caller's usage are NOT listed (honest absence, never an error).
   */
  readonly usage?: EditorSessionHistoryUsageContext;
}

/** Structural filter + resolved bound handed to the history store. */
export interface EditorSessionHistoryFilter {
  readonly revisionId?: SportaId;
  readonly editorSessionId?: SportaId;
  readonly openOnly?: boolean;
  /** Resolved positive page bound (default 50, capped at 500). */
  readonly limit: number;
}

/**
 * Durable-capable editor-session history store: the projection the read
 * seam lists from. Adapters implement it (in-memory for tests, a real
 * filesystem JSON ledger for durable deployments).
 */
export interface EditorSessionHistoryStorePort {
  /**
   * Record an opened session. Idempotent per `editorSessionId`:
   * the first write wins, later appends are no-ops.
   */
  append(record: EditorSessionRecord): Promise<void>;
  /**
   * Close a session (sets `closedAt`). First close wins; closing an
   * unknown session is a typed `UnknownEditorSessionError`. Returns the
   * stored record after the operation.
   */
  close(editorSessionId: SportaId, closedAt: Iso8601): Promise<EditorSessionRecord>;
  /** Bounded structural listing, newest first (see compare helpers). */
  list(filter: EditorSessionHistoryFilter): Promise<readonly EditorSessionRecord[]>;
}

/** Constructor wiring for EditorSessionHistoryService. */
export interface EditorSessionHistoryDeps {
  readonly history: EditorSessionHistoryStorePort;
}

/**
 * Resolve a query limit into a positive page bound: default 50 when
 * absent, hard-capped at 500, malformed values refused with a typed error
 * (a bounded seam never guesses what a non-positive bound meant).
 */
export function resolveEditorSessionHistoryLimit(limit?: number): number {
  if (limit === undefined) return EDITOR_SESSION_HISTORY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new EditorSessionHistoryQueryError(
      `limit must be a positive integer, got ${String(limit)}`,
      String(limit),
    );
  }
  return Math.min(limit, EDITOR_SESSION_HISTORY_MAX_LIMIT);
}

/**
 * Invariant-22 read gate: may a session be listed for a caller whose
 * usage context is `usage`?
 *
 * Law (fail-closed): a session is visible iff AT LEAST ONE declared
 * usage is affirmatively permitted by the session's PolicySet rights AND
 * NO declared usage is prohibited. A missing or empty usage context
 * lists NOTHING — the gate cannot affirm any permission, so the seam
 * refuses by emptiness (it is a read seam, not an authorization oracle:
 * absence is the only signal, never an error or an explanation).
 *
 * Holders are not evaluated here: the seam gates on usage classes only;
 * holder-bound authorization is a policy-domain concern above this port.
 */
export function sessionVisibleToUsage(
  rights: RightsScope,
  usage?: EditorSessionHistoryUsageContext,
): boolean {
  if (usage === undefined || usage.usages.length === 0) return false;
  const permitted = usage.usages.some((candidate) => rights.usages.includes(candidate));
  const prohibited = usage.usages.some((candidate) => rights.prohibitions.includes(candidate));
  return permitted && !prohibited;
}

/** Project a session record onto the authoritative summary, field-for-field. */
export function toEditorSessionSummary(record: EditorSessionRecord): EditorSessionSummary {
  return {
    editorSessionId: record.editorSessionId,
    editorId: record.editorId,
    revisionId: record.revisionId,
    mode: record.mode,
    integrationLevel: record.integrationLevel,
    openedAt: record.openedAt,
    ...(record.closedAt === undefined ? {} : { closedAt: record.closedAt }),
  };
}

/** Structural query match (pure): filters by revision, session id, openness. */
export function matchesEditorSessionHistoryFilter(
  record: EditorSessionRecord,
  filter: EditorSessionHistoryFilter,
): boolean {
  if (filter.revisionId !== undefined && record.revisionId !== filter.revisionId) return false;
  if (filter.editorSessionId !== undefined && record.editorSessionId !== filter.editorSessionId) {
    return false;
  }
  if (filter.openOnly === true && record.closedAt !== undefined) return false;
  return true;
}

/**
 * Newest-first order (pure): descending `openedAt`, ties broken by
 * descending `editorSessionId` — deterministic on every store alike.
 */
export function compareEditorSessionsNewestFirst(
  left: EditorSessionRecord,
  right: EditorSessionRecord,
): number {
  if (left.openedAt !== right.openedAt) return left.openedAt < right.openedAt ? 1 : -1;
  if (left.editorSessionId === right.editorSessionId) return 0;
  return left.editorSessionId < right.editorSessionId ? 1 : -1;
}
