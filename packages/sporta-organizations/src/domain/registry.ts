/**
 * Organization registry — pure domain semantics (no IO, no timers).
 * See packages/sporta-organizations/SPEC.md: drafts append-only,
 * promotion freezes a version immutably, versions contiguous-monotonic
 * per organizationId.
 */
import type { Iso8601, PromotionRecord, SportaId } from "@sporta/contracts/contract";
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import type {
  PromoteOrganizationInput,
  RejectCandidateInput,
  RollbackPromotionInput,
} from "./ports.js";
import { stableEquals } from "./stable.js";
import {
  OrganizationDecisionError,
  OrganizationDraftConflictError,
  OrganizationImmutableError,
  OrganizationPromotionError,
  OrganizationVersionMonotonicError,
} from "./errors.js";

/**
 * One registry entry: the immutable record plus its decision state. The
 * optional decision records (promotion / rejection / rollback) are the
 * append-only per-candidate decision ledger (Wave 4): at most one
 * rejection on a never-promoted draft, or one promotion followed by at
 * most one rollback. `promoted` reflects the CURRENT promotion state —
 * a rolled-back promotion retracts it (the version leaves the resolver's
 * candidate set) while the granted records stay as immutable history.
 */
export interface StoredOrganizationVersion {
  record: OrganizationVersionRecord;
  promoted: boolean;
  promotion?: PromotionRecord;
  /** Wave 4 additive — the rejection decision (decision "rejected"), when granted. */
  rejection?: PromotionRecord;
  /** Wave 4 additive — the rollback decision (decision "rolled-back"), when granted. */
  rollback?: PromotionRecord;
}

/** Registry key for one version (opaque to callers). */
export function organizationKey(organizationId: SportaId, version: number): string {
  return `${organizationId}#${version}`;
}

/** Deterministic candidate id for one version. */
export function candidateIdFor(organizationId: SportaId, version: number): string {
  return `${organizationId}:${version}`;
}

export interface RegisterDraftResult {
  state: ReadonlyMap<string, StoredOrganizationVersion>;
  record: OrganizationVersionRecord;
  created: boolean;
}

/**
 * Register a draft version. Append-only + idempotent: an identical
 * re-registration returns the stored record; different content conflicts
 * (immutable error when promoted); a new version must be exactly
 * max + 1 (first registration: exactly 1).
 */
export function registerDraftInState(
  state: ReadonlyMap<string, StoredOrganizationVersion>,
  record: OrganizationVersionRecord,
): RegisterDraftResult {
  const key = organizationKey(record.organizationId, record.version);
  const existing = state.get(key);
  if (existing) {
    if (stableEquals(existing.record, record)) {
      return { state, record: existing.record, created: false };
    }
    if (existing.promoted) {
      throw new OrganizationImmutableError(
        `organization ${record.organizationId} version ${record.version} is promoted and immutable; mutation refused`,
      );
    }
    throw new OrganizationDraftConflictError(
      `organization ${record.organizationId} version ${record.version} already registered with different content (append-only registry: register a new version instead)`,
    );
  }
  const maxVersion = maxRegisteredVersion(state, record.organizationId);
  const expected = maxVersion === 0 ? 1 : maxVersion + 1;
  if (record.version !== expected) {
    throw new OrganizationVersionMonotonicError(
      `organization ${record.organizationId}: expected version ${expected}, got ${record.version} (versions are contiguous-monotonic per organization)`,
    );
  }
  const next = new Map(state);
  next.set(key, { record, promoted: false });
  return { state: next, record, created: true };
}

/** Effective promotion evidence: input evidence first, record evidence after, deduped. */
function effectiveEvidence(
  inputEvidence: readonly SportaId[] | undefined,
  record: OrganizationVersionRecord,
): SportaId[] {
  const combined = [...(inputEvidence ?? []), ...record.evidence];
  return [...new Set(combined)];
}

function policyDefined(record: OrganizationVersionRecord): boolean {
  return record.policy.rights.holders.length > 0 && record.policy.rights.usages.length > 0;
}

export interface PromoteResult {
  entry: StoredOrganizationVersion;
  promotion: PromotionRecord;
}

/**
 * Promote one version (minimal A6 path). Evidence + policy gated; the
 * resulting PromotionRecord is immutable — re-promotion is idempotent
 * for identical evidence and a typed immutability error otherwise.
 *
 * Wave 4: a candidate carrying ANY prior decision is not promotable — a
 * rejected candidate's decision is terminal, and a rolled-back
 * promotion must not be silently re-granted (register a new version
 * instead; the append-only registry law).
 */
export function promoteStoredVersion(
  entry: StoredOrganizationVersion,
  input: PromoteOrganizationInput,
  now: Iso8601,
): PromoteResult {
  const { record } = entry;
  const evidence = effectiveEvidence(input.evidence, record);
  if (entry.promoted && entry.promotion) {
    if (stableEquals([...entry.promotion.evidence], evidence)) {
      return { entry, promotion: entry.promotion };
    }
    throw new OrganizationImmutableError(
      `organization ${record.organizationId} version ${record.version} already promoted; the promotion record is immutable`,
    );
  }
  if (entry.rejection !== undefined) {
    throw new OrganizationImmutableError(
      `organization ${record.organizationId} version ${record.version} carries a terminal decision (rejected); decisions are immutable — register a new version to promote again`,
    );
  }
  if (entry.rollback !== undefined) {
    throw new OrganizationImmutableError(
      `organization ${record.organizationId} version ${record.version} was promoted and rolled back; the decision ledger is immutable — register a new version to promote again`,
    );
  }
  const gates: { gate: string; passed: boolean }[] = [
    { gate: "version-registered", passed: true },
    { gate: "evidence-present", passed: evidence.length > 0 },
    { gate: "policy-defined", passed: policyDefined(record) },
  ];
  const failed = gates.filter((gate) => !gate.passed).map((gate) => gate.gate);
  if (failed.length > 0) {
    throw new OrganizationPromotionError(
      `promotion refused for ${candidateIdFor(record.organizationId, record.version)}: failed gates: ${failed.join(", ")}`,
    );
  }
  const promotion: PromotionRecord = {
    promotionId: `promotion:${record.organizationId}:${record.version}`,
    candidateId: candidateIdFor(record.organizationId, record.version),
    decision: "promoted",
    gates,
    evidence,
    decidedAt: now,
  };
  return { entry: { record, promoted: true, promotion }, promotion };
}

/** Highest registered version for one organizationId (0 when none). */
function maxRegisteredVersion(
  state: ReadonlyMap<string, StoredOrganizationVersion>,
  organizationId: SportaId,
): number {
  let max = 0;
  for (const entry of state.values()) {
    if (entry.record.organizationId === organizationId && entry.record.version > max) {
      max = entry.record.version;
    }
  }
  return max;
}

/** Result shape shared by the Wave 4 decision transitions. */
export interface DecisionResult {
  entry: StoredOrganizationVersion;
  decision: PromotionRecord;
}

/** The failed-gate names of a gate list (typed refusal evidence). */
function failedGates(gates: readonly { gate: string; passed: boolean }[]): string[] {
  return gates.filter((gate) => !gate.passed).map((gate) => gate.gate);
}

/**
 * Reject one candidate version (Wave 4 decision path, decision
 * "rejected"). Mirrors the promotion gates (evidence + policy); the
 * record is immutable — re-rejection is idempotent for identical
 * effective evidence. A candidate that already carries ANY decision is
 * not rejectable: a granted promotion is retracted by rollbackPromotion,
 * not by rejection (typed immutability refusals, never silent fallbacks).
 */
export function rejectStoredCandidate(
  entry: StoredOrganizationVersion,
  input: RejectCandidateInput,
  now: Iso8601,
): DecisionResult {
  const { record } = entry;
  const evidence = effectiveEvidence(input.evidence, record);
  if (entry.rejection !== undefined) {
    if (stableEquals([...entry.rejection.evidence], evidence)) {
      return { entry, decision: entry.rejection };
    }
    throw new OrganizationImmutableError(
      `organization ${record.organizationId} version ${record.version} already rejected; the rejection record is immutable`,
    );
  }
  if (entry.promoted || entry.promotion !== undefined || entry.rollback !== undefined) {
    throw new OrganizationImmutableError(
      `organization ${record.organizationId} version ${record.version} already carries a promotion decision; rejection refused — use rollbackPromotion to retract a promotion`,
    );
  }
  const gates: { gate: string; passed: boolean }[] = [
    { gate: "version-registered", passed: true },
    { gate: "evidence-present", passed: evidence.length > 0 },
    { gate: "policy-defined", passed: policyDefined(record) },
  ];
  const failed = failedGates(gates);
  if (failed.length > 0) {
    throw new OrganizationDecisionError(
      `rejection refused for ${candidateIdFor(record.organizationId, record.version)}: failed gates: ${failed.join(", ")}`,
    );
  }
  const decision: PromotionRecord = {
    promotionId: `rejection:${record.organizationId}:${record.version}`,
    candidateId: candidateIdFor(record.organizationId, record.version),
    decision: "rejected",
    gates,
    evidence,
    decidedAt: now,
  };
  return { entry: { record, promoted: false, rejection: decision }, decision };
}

/**
 * Roll back a granted promotion (Wave 4 decision path, decision
 * "rolled-back"). Gated on a prior promotion of the same candidate
 * (prior-promotion), plus the shared evidence + policy gates. The
 * granted promotion record is KEPT (append-only history) while the
 * version's promoted flag is retracted — the version leaves the
 * resolver's candidate set. Idempotent for identical effective evidence.
 */
export function rollbackStoredPromotion(
  entry: StoredOrganizationVersion,
  input: RollbackPromotionInput,
  now: Iso8601,
): DecisionResult {
  const { record } = entry;
  const evidence = effectiveEvidence(input.evidence, record);
  if (entry.rollback !== undefined) {
    if (stableEquals([...entry.rollback.evidence], evidence)) {
      return { entry, decision: entry.rollback };
    }
    throw new OrganizationImmutableError(
      `organization ${record.organizationId} version ${record.version} already rolled back; the rollback record is immutable`,
    );
  }
  const gates: { gate: string; passed: boolean }[] = [
    { gate: "version-registered", passed: true },
    { gate: "prior-promotion", passed: entry.promoted && entry.promotion !== undefined },
    { gate: "evidence-present", passed: evidence.length > 0 },
    { gate: "policy-defined", passed: policyDefined(record) },
  ];
  const failed = failedGates(gates);
  if (failed.length > 0) {
    throw new OrganizationDecisionError(
      `rollback refused for ${candidateIdFor(record.organizationId, record.version)}: failed gates: ${failed.join(", ")}`,
    );
  }
  const decision: PromotionRecord = {
    promotionId: `rollback:${record.organizationId}:${record.version}`,
    candidateId: candidateIdFor(record.organizationId, record.version),
    decision: "rolled-back",
    gates,
    evidence,
    decidedAt: now,
  };
  return {
    entry: { record, promoted: false, promotion: entry.promotion, rollback: decision },
    decision,
  };
}
