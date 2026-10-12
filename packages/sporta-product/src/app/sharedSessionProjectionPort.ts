/**
 * w6c-4 station re-seam: the projection's port contract — owned by the
 * product projection (NOT the frozen editors `SharedSessionHistoryReadPort`,
 * which is the W4-B editor-session listing seam). See
 * sharedSessionProjection.ts's station re-seam note.
 */

/** A shared-session summary row as consumed by the projection. */
export interface SharedSessionSummaryRow {
  readonly sessionId: string;
  /** 'open' | 'closed' (anything else normalizes to 'open'). */
  readonly status: string;
  readonly participants: ReadonlyArray<string | { participantId: string }>;
  readonly headRevision: number;
}

/** One ordered delta-log row (sequence + payload). */
export interface SharedSessionDeltaLogRow {
  readonly revision: number;
  readonly payload: unknown;
}

/** The read-only seam the shared-session projection consumes. */
export interface SharedSessionProjectionPort {
  listSessions(): Promise<readonly SharedSessionSummaryRow[]>;
  getSession(sessionId: string): Promise<SharedSessionSummaryRow | null>;
  getDeltaLog(sessionId: string): Promise<readonly SharedSessionDeltaLogRow[] | null>;
}
