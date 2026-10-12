/**
 * w6c-2: presence staleness policy — host-level, ABOVE the pure heartbeat record. The frozen
 * presence.ts is untouched. Additive, pure, deterministic, I/O-free (SPEC §W6C-2).
 */
export type StalenessClass = 'FRESH' | 'STALE' | 'EXPIRED';

export interface StalenessPolicy {
  readonly staleAfterMs: number;
  readonly expiredAfterMs: number;
}

export interface StalenessRecord {
  readonly participantId: string;
  /** null/undefined = missing heartbeat record → EXPIRED (fail-closed). */
  readonly lastHeartbeatAtMs: number | null;
}

export interface StalenessDecision {
  readonly participantId: string;
  readonly classification: StalenessClass;
  /** null when no heartbeat record exists (fail-closed). */
  readonly ageMs: number | null;
  /** The threshold that governed this classification. */
  readonly thresholdMs: number;
  readonly reason: string;
}

export interface StalenessSnapshot {
  readonly nowMs: number;
  readonly policy: StalenessPolicy;
  /** Same order as the input records — order-stable by law. */
  readonly decisions: readonly StalenessDecision[];
  readonly counts: Readonly<Record<StalenessClass, number>>;
}

export class InvalidStalenessPolicyError extends Error {
  readonly field: string;
  constructor(message: string, field: string) {
    super(message);
    this.name = 'InvalidStalenessPolicyError';
    this.field = field;
  }
}

export const MISSING_HEARTBEAT_REASON = 'missing-heartbeat-record: fail-closed';

export function validateStalenessPolicy(policy: StalenessPolicy): void {
  if (!Number.isFinite(policy.staleAfterMs) || policy.staleAfterMs < 0) {
    throw new InvalidStalenessPolicyError('staleAfterMs must be a finite non-negative number', 'staleAfterMs');
  }
  if (!Number.isFinite(policy.expiredAfterMs) || policy.expiredAfterMs < 0) {
    throw new InvalidStalenessPolicyError('expiredAfterMs must be a finite non-negative number', 'expiredAfterMs');
  }
  if (policy.expiredAfterMs < policy.staleAfterMs) {
    throw new InvalidStalenessPolicyError('threshold ordering violated: expiredAfterMs must be >= staleAfterMs', 'expiredAfterMs');
  }
}

export function classifyStaleness(record: StalenessRecord, nowMs: number, policy: StalenessPolicy): StalenessDecision {
  validateStalenessPolicy(policy);
  const { participantId } = record;
  if (record.lastHeartbeatAtMs === null || record.lastHeartbeatAtMs === undefined) {
    return { participantId, classification: 'EXPIRED', ageMs: null, thresholdMs: policy.expiredAfterMs, reason: MISSING_HEARTBEAT_REASON };
  }
  const ageMs = nowMs - record.lastHeartbeatAtMs;
  if (ageMs < policy.staleAfterMs) {
    return { participantId, classification: 'FRESH', ageMs, thresholdMs: policy.staleAfterMs, reason: 'age < staleAfterMs' };
  }
  if (ageMs < policy.expiredAfterMs) {
    return { participantId, classification: 'STALE', ageMs, thresholdMs: policy.expiredAfterMs, reason: 'staleAfterMs <= age < expiredAfterMs' };
  }
  return { participantId, classification: 'EXPIRED', ageMs, thresholdMs: policy.expiredAfterMs, reason: 'age >= expiredAfterMs' };
}

export function stalenessSnapshot(
  records: readonly StalenessRecord[],
  nowMs: number,
  policy: StalenessPolicy,
): StalenessSnapshot {
  const decisions = records.map((record) => classifyStaleness(record, nowMs, policy));
  const counts: Record<StalenessClass, number> = { FRESH: 0, STALE: 0, EXPIRED: 0 };
  for (const decision of decisions) counts[decision.classification] += 1;
  return { nowMs, policy, decisions, counts };
}

export function participantRecord(participantId: string, lastHeartbeatAtMs: number | null): StalenessRecord {
  return { participantId, lastHeartbeatAtMs };
}
