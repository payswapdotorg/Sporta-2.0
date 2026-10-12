/**
 * w6c-4: read-only shared-session projection for the takeover UX (SPEC §W6C-4).
 * READ-ONLY: never mutates session state — the level-3 editors service is the sole writer.
 * Optional-port pattern (W4-B): absent port ⇒ EMPTY projection (wired:false, empty list,
 * not-found detail) — never a crash, never a throw. No new product dependencies; the
 * registered @sporta/editors edge is used as-is.
 *
 * Station re-seam note (TL, appendix-B2 drift resolution): the frozen
 * `SharedSessionHistoryReadPort` (editors) exposes `listEditorSessions` — the
 * W4-B editor-session read seam, NOT a shared-session listing. The projection
 * therefore owns its port contract (`SharedSessionProjectionPort`) — the row
 * shape the worker designed — and the REAL adapter
 * (`sharedSessionStoreProjection.ts`) maps the REAL `FsSharedSessionStore`
 * ledger surface onto it. Rows are normalized defensively through `unknown`
 * so the projection stays tolerant of adapter row-field drift.
 */
import type { SharedSessionProjectionPort } from './sharedSessionProjectionPort.js';

export type { SharedSessionProjectionPort } from './sharedSessionProjectionPort.js';

export interface SharedSessionProjectionDeps {
  readonly sharedSessionHistory?: SharedSessionProjectionPort;
}

export interface SharedSessionSummaryView {
  readonly sessionId: string;
  readonly status: 'open' | 'closed';
  readonly participants: readonly string[];
  readonly headRevision: number;
}

export interface SharedSessionDeltaLogEntry {
  readonly revision: number;
  readonly payload: unknown;
}

export interface SharedSessionDetailView extends SharedSessionSummaryView {
  readonly deltaLog: readonly SharedSessionDeltaLogEntry[];
}

export interface SharedSessionListView {
  /** false = the history port was absent: this is an EMPTY projection, not an empty world. */
  readonly wired: boolean;
  readonly sessions: readonly SharedSessionSummaryView[];
}

export type SharedSessionDetailResult =
  | { readonly wired: true; readonly found: true; readonly detail: SharedSessionDetailView }
  | { readonly wired: boolean; readonly found: false };

interface HistoryRowLike {
  sessionId: string;
  status: string;
  participants: ReadonlyArray<string | { participantId: string }>;
  headRevision: number;
}

interface DeltaLogEntryLike {
  revision: number;
  payload: unknown;
}

export class SharedSessionProjection {
  private readonly history: SharedSessionProjectionPort | undefined;

  constructor(deps: SharedSessionProjectionDeps) {
    this.history = deps.sharedSessionHistory;
  }

  get wired(): boolean {
    return this.history !== undefined;
  }

  async listSessions(): Promise<SharedSessionListView> {
    if (this.history === undefined) return { wired: false, sessions: [] }; // absent port = empty projection
    const rows = (await this.history.listSessions()) as unknown as readonly HistoryRowLike[];
    return { wired: true, sessions: rows.map(toSummaryView) };
  }

  async sessionDetail(sessionId: string): Promise<SharedSessionDetailResult> {
    if (this.history === undefined) return { wired: false, found: false };
    const row = (await this.history.getSession(sessionId)) as unknown as HistoryRowLike | null | undefined;
    if (row === null || row === undefined) return { wired: true, found: false };
    const log = (await this.history.getDeltaLog(sessionId)) as unknown as readonly DeltaLogEntryLike[] | null | undefined;
    if (log === null || log === undefined) return { wired: true, found: false };
    return {
      wired: true,
      found: true,
      detail: { ...toSummaryView(row), deltaLog: log.map((entry) => ({ revision: entry.revision, payload: entry.payload })) },
    };
  }
}

function toSummaryView(row: HistoryRowLike): SharedSessionSummaryView {
  return {
    sessionId: row.sessionId,
    status: row.status === 'closed' ? 'closed' : 'open',
    participants: row.participants.map((p) => (typeof p === 'string' ? p : p.participantId)),
    headRevision: row.headRevision,
  };
}

export function sharedSessionProjectionFromDeps(deps: SharedSessionProjectionDeps): SharedSessionProjection {
  return new SharedSessionProjection(deps);
}

export function emptySharedSessionListView(): SharedSessionListView {
  return { wired: false, sessions: [] };
}

/** Pure combiner: attach the shared-session read-out to any takeover view additively. */
export function withSharedSessions<V>(takeoverView: V, sharedSessions: SharedSessionListView): V & { readonly sharedSessions: SharedSessionListView } {
  return { ...takeoverView, sharedSessions };
}
