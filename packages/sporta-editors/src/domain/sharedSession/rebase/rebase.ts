/**
 * w6c-3: rebase-on-conflict for REFUSED stale deltas — additive, pure, I/O-free (SPEC §W6C-3).
 * Total outcome; never a silent drop; never a fake apply.
 */
export interface RebaseDeltaInput {
  readonly deltaId?: string;
  /** The (now stale) base revision the coordination domain refused. */
  readonly baseRevision: number;
  readonly payload: unknown;
  /** Rebase incompatibility surface: opaque coordinate tokens. Absent = UNKNOWN → fail-closed. */
  readonly touches?: readonly string[];
}

export interface RebaseLogEntry {
  readonly entryId?: string;
  readonly revision: number;
  readonly payload?: unknown;
  readonly touches?: readonly string[];
}

export interface RebasedDelta {
  readonly deltaId?: string;
  readonly baseRevision: number;
  readonly payload: unknown;
  readonly touches?: readonly string[];
  readonly rebase: Readonly<{
    previousBaseRevision: number;
    appliedLogRevisions: readonly number[];
  }>;
}

export type RebaseNotExpressibleReason = 'touch-surface-intersection' | 'unknown-touch-surface';

export class RebaseNotExpressibleError extends Error {
  readonly deltaId?: string;
  readonly conflictingEntryId: string;
  readonly conflictingRevision: number;
  readonly reason: RebaseNotExpressibleReason;
  constructor(detail: {
    deltaId?: string;
    conflictingEntryId: string;
    conflictingRevision: number;
    reason: RebaseNotExpressibleReason;
  }) {
    super(
      `rebase not expressible: log entry ${detail.conflictingEntryId} (revision ${detail.conflictingRevision}) — ${detail.reason}`,
    );
    this.name = 'RebaseNotExpressibleError';
    this.deltaId = detail.deltaId;
    this.conflictingEntryId = detail.conflictingEntryId;
    this.conflictingRevision = detail.conflictingRevision;
    this.reason = detail.reason;
  }
}

export type RebaseInvalidReason =
  | 'non-integer-revision'
  | 'base-ahead-of-head'
  | 'log-does-not-cover-intervening-revisions'
  | 'log-not-ascending'
  | 'log-revision-out-of-range';

export class RebaseInvalidInputError extends Error {
  readonly reason: RebaseInvalidReason;
  constructor(reason: RebaseInvalidReason, detail: string) {
    super(`rebase invalid input (${reason}): ${detail}`);
    this.name = 'RebaseInvalidInputError';
    this.reason = reason;
  }
}

export type RebaseOutcome =
  | { readonly kind: 'rebased'; readonly delta: RebasedDelta }
  | { readonly kind: 'not-expressible'; readonly error: RebaseNotExpressibleError }
  | { readonly kind: 'invalid-input'; readonly error: RebaseInvalidInputError };

export interface RebaseOptions {
  /** Caller-supplied PURE re-anchoring transform. No I/O; a throwing reanchor propagates (SPEC). */
  readonly reanchor?: (payload: unknown, appliedLog: readonly RebaseLogEntry[]) => unknown;
}

export function rebaseDelta(
  refused: RebaseDeltaInput,
  log: readonly RebaseLogEntry[],
  headRevision: number,
  options: RebaseOptions = {},
): RebaseOutcome {
  const invalid = validateShape(refused, log, headRevision);
  if (invalid !== null) return { kind: 'invalid-input', error: invalid };

  if (refused.baseRevision === headRevision) {
    // Trivial rebase: nothing intervened (empty log is enforced by validateShape here).
    return {
      kind: 'rebased',
      delta: {
        deltaId: refused.deltaId,
        baseRevision: headRevision,
        payload: options.reanchor !== undefined ? options.reanchor(refused.payload, []) : refused.payload,
        touches: refused.touches,
        rebase: { previousBaseRevision: refused.baseRevision, appliedLogRevisions: [] },
      },
    };
  }

  const conflict = firstConflict(refused.touches, log);
  if (conflict !== null) {
    return {
      kind: 'not-expressible',
      error: new RebaseNotExpressibleError({
        deltaId: refused.deltaId,
        conflictingEntryId: conflict.entry.entryId ?? `revision:${conflict.entry.revision}`,
        conflictingRevision: conflict.entry.revision,
        reason: conflict.reason,
      }),
    };
  }

  return {
    kind: 'rebased',
    delta: {
      deltaId: refused.deltaId,
      baseRevision: headRevision,
      payload: options.reanchor !== undefined ? options.reanchor(refused.payload, log) : refused.payload,
      touches: refused.touches,
      rebase: { previousBaseRevision: refused.baseRevision, appliedLogRevisions: log.map((entry) => entry.revision) },
    },
  };
}

interface Conflict {
  readonly entry: RebaseLogEntry;
  readonly reason: RebaseNotExpressibleReason;
}

function firstConflict(refusedTouches: readonly string[] | undefined, log: readonly RebaseLogEntry[]): Conflict | null {
  for (const entry of log) {
    if (refusedTouches === undefined || entry.touches === undefined) {
      return { entry, reason: 'unknown-touch-surface' }; // fail-closed (SPEC §W6C-3)
    }
    if (surfacesIntersect(refusedTouches, entry.touches)) {
      return { entry, reason: 'touch-surface-intersection' };
    }
  }
  return null;
}

function surfacesIntersect(a: readonly string[], b: readonly string[]): boolean {
  if (a.includes('*') || b.includes('*')) return true;
  return a.some((token) => b.includes(token));
}

function validateShape(
  refused: RebaseDeltaInput,
  log: readonly RebaseLogEntry[],
  headRevision: number,
): RebaseInvalidInputError | null {
  if (!Number.isInteger(refused.baseRevision) || !Number.isInteger(headRevision)) {
    return new RebaseInvalidInputError('non-integer-revision', `base=${String(refused.baseRevision)} head=${String(headRevision)}`);
  }
  if (refused.baseRevision > headRevision) {
    return new RebaseInvalidInputError('base-ahead-of-head', `base ${refused.baseRevision} > head ${headRevision}`);
  }
  if (refused.baseRevision < headRevision && log.length === 0) {
    return new RebaseInvalidInputError(
      'log-does-not-cover-intervening-revisions',
      `head ${headRevision} > base ${refused.baseRevision} but no intervening log was provided (a silent rebase would fake-apply)`,
    );
  }
  let previous: number | null = null;
  for (const entry of log) {
    if (!Number.isInteger(entry.revision)) {
      return new RebaseInvalidInputError('non-integer-revision', `log entry revision=${String(entry.revision)}`);
    }
    if (entry.revision <= refused.baseRevision || entry.revision > headRevision) {
      return new RebaseInvalidInputError('log-revision-out-of-range', `entry revision ${entry.revision} not in (${refused.baseRevision}, ${headRevision}]`);
    }
    if (previous !== null && entry.revision <= previous) {
      return new RebaseInvalidInputError('log-not-ascending', `entry revision ${entry.revision} follows ${previous}`);
    }
    previous = entry.revision;
  }
  return null;
}
