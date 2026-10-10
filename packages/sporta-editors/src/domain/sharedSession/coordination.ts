import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type { ArtifactRevisionRecord, EditDeltaRecord } from "@sporta/contracts/contract";
import { SharedSessionConflictError, SharedSessionOrderError } from "./errors.js";
/**
 * Deterministic delta-broadcast ordering for live/shared editor sessions
 * (domain layer — pure). One total order per shared session over the
 * broadcast deltas: coordinator-assigned CONTIGUOUS ascending sequences,
 * idempotent delivery per delta id, and conflict-refusal when a delta's
 * base revision no longer matches the session head (typed, carrying the
 * divergent revision ids).
 *
 * The head advances ONLY when a reconcile commits (save/close); live
 * broadcasts never move it.
 */

/** A participant's submitted live delta (pre-ordering). */
export interface SharedSessionEditDelta {
  readonly deltaId: SportaId;
  readonly participantId: string;
  /** The revision the participant based this edit on. */
  readonly baseRevisionId: SportaId;
  /** Serialized typed edit operations (the operations module's strings). */
  readonly operations: readonly string[];
}

/** One delivered delta, at its position in the session's total order. */
export interface OrderedSharedDelta {
  readonly sequence: number;
  readonly deltaId: SportaId;
  readonly participantId: string;
  readonly baseRevisionId: SportaId;
  readonly operations: readonly string[];
  readonly deliveredAt: Iso8601;
}

/** The coordination state of one shared session (single owner: the store). */
export interface SharedSessionCoordination {
  readonly sessionId: SportaId;
  /** The revision every incoming delta must be based on. */
  readonly headRevisionId: SportaId;
  /** The last delivered sequence (0 = nothing delivered yet). */
  readonly lastSequence: number;
  /** The total order over delivered deltas (append-only). */
  readonly log: readonly OrderedSharedDelta[];
}

/** The result of a broadcast attempt. */
export interface SharedDeltaBroadcast {
  /** The next coordination state (unchanged when deduplicated). */
  readonly coordination: SharedSessionCoordination;
  /** The delivered entry (the existing one when deduplicated). */
  readonly entry: OrderedSharedDelta;
  /** True when the delta was already delivered (idempotent no-op). */
  readonly deduplicated: boolean;
}

/** Fresh coordination state for a session opened on a checkpoint. */
export function initialSharedSessionCoordination(
  sessionId: SportaId,
  headRevisionId: SportaId,
): SharedSessionCoordination {
  return { sessionId, headRevisionId, lastSequence: 0, log: [] };
}

/**
 * Deliver one delta into the session's total order:
 *
 * 1. IDEMPOTENT first: a delta id already in the log is NOT re-delivered
 *    (the existing entry returns with `deduplicated: true`, log
 *    unchanged) — checked before the conflict rule so a retry after the
 *    head moved is still an idempotent no-op, never a spurious conflict;
 * 2. CONFLICT refusal: a base revision that no longer matches the head
 *    is refused typed, with BOTH divergent revision ids;
 * 3. delivery appends at `sequence = lastSequence + 1` (contiguous
 *    ascending from 1 — the deterministic total order).
 */
export function broadcastSharedDelta(
  state: SharedSessionCoordination,
  delta: SharedSessionEditDelta,
  deliveredAt: Iso8601,
): SharedDeltaBroadcast {
  const existing = state.log.find((entry) => entry.deltaId === delta.deltaId);
  if (existing !== undefined) {
    return { coordination: state, entry: existing, deduplicated: true };
  }
  if (delta.baseRevisionId !== state.headRevisionId) {
    throw new SharedSessionConflictError(
      "the delta's base revision no longer matches the shared session head — refusing (never merged, never guessed)",
      state.headRevisionId,
      delta.baseRevisionId,
    );
  }
  const entry: OrderedSharedDelta = {
    sequence: state.lastSequence + 1,
    deltaId: delta.deltaId,
    participantId: delta.participantId,
    baseRevisionId: delta.baseRevisionId,
    operations: [...delta.operations],
    deliveredAt,
  };
  return {
    coordination: {
      ...state,
      lastSequence: entry.sequence,
      log: [...state.log, entry],
    },
    entry,
    deduplicated: false,
  };
}

/** Advance the head after a reconcile committed (save/close only). */
export function advanceCoordinationHead(
  state: SharedSessionCoordination,
  revisionId: SportaId,
): SharedSessionCoordination {
  return { ...state, headRevisionId: revisionId };
}

/**
 * The total-order invariant: sequences strictly ascending AND contiguous
 * from 1, with no duplicate delta ids or sequences. True for every state
 * this module produces; false means corrupted or forged state.
 */
export function sharedSessionLogIsOrdered(log: readonly OrderedSharedDelta[]): boolean {
  const seenDeltaIds = new Set<string>();
  const seenSequences = new Set<number>();
  let previous = 0;
  for (const entry of log) {
    if (!Number.isInteger(entry.sequence) || entry.sequence !== previous + 1) return false;
    if (seenDeltaIds.has(entry.deltaId)) return false;
    if (seenSequences.has(entry.sequence)) return false;
    if (
      typeof entry.deltaId !== "string" ||
      typeof entry.participantId !== "string" ||
      typeof entry.baseRevisionId !== "string" ||
      typeof entry.deliveredAt !== "string" ||
      !Array.isArray(entry.operations)
    ) {
      return false;
    }
    seenDeltaIds.add(entry.deltaId);
    seenSequences.add(entry.sequence);
    previous = entry.sequence;
  }
  return true;
}

/**
 * The reconcile validation law (run on save AND close, BEFORE any state
 * is written — a failed validation leaves no trace):
 *
 * - chain law: the reconciled delta's `fromRevisionId` must equal the
 *   session head — OR the reconciled revision IS already the head (the
 *   idempotent re-delivery of the same reconcile). Anything else means
 *   the revision chain moved somewhere the shared session did not take
 *   it (e.g. an uncoordinated reconcile outside this service): typed
 *   conflict with both divergent ids.
 * - total-order invariant over the broadcast log (typed order error).
 */
export function validateSharedSessionReconcile(
  coordination: SharedSessionCoordination,
  reconciled: {
    readonly revision: ArtifactRevisionRecord;
    readonly delta: EditDeltaRecord;
  },
): void {
  if (!sharedSessionLogIsOrdered(coordination.log)) {
    throw new SharedSessionOrderError(
      `the broadcast log of shared session ${coordination.sessionId} violates the total-order invariant`,
      `lastSequence=${coordination.lastSequence} entries=${coordination.log.length}`,
    );
  }
  const head = coordination.headRevisionId;
  if (reconciled.revision.revisionId === head) return; // idempotent re-save
  if (reconciled.delta.fromRevisionId !== head) {
    throw new SharedSessionConflictError(
      "the reconcile landed on a head the shared session did not advance — refusing (uncoordinated revision chain)",
      head,
      reconciled.delta.fromRevisionId,
    );
  }
}
