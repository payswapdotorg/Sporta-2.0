/**
 * sporta-arena client-boundary port declarations (module-internal).
 *
 * Moved here from contract.ts at wave-1 integration so the app layer
 * imports its types from the domain direction (the app may never import
 * the module's own public entrypoint — that direction created a cycle
 * once contract.ts began re-exporting the service). contract.ts remains
 * the single public entrypoint and re-exports these verbatim; the public
 * surface is unchanged (verified by scripts/architecture/sporta-surface-check.mjs).
 */
import type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  CapabilityGapRecord,
  LearningPolicyRef,
  PolicySet,
  SportaId,
} from "@sporta/contracts/contract";
import type { ArenaReadUsageContext } from "./escalationReadSeam.js";

/** Input for producing a typed capability gap. `gapId` provides idempotency. */
export interface RecordCapabilityGapInput {
  gapId?: SportaId;
  workGraphId: SportaId;
  capabilityNeed: string;
  attemptedStrategies: readonly string[];
  contextRefs: readonly SportaId[];
  evidence: readonly SportaId[];
}

/** Input for an idempotent escalation. */
export interface EscalateInput {
  idempotencyKey: string;
  gapId: SportaId;
  /** Tenant boundary check identity (canonical contracts: tenant checks at service boundaries). */
  tenantRef: string;
  urgency: ArenaEscalationRecord["urgency"];
  budget?: { currency: string; limit: number };
  sessionMode: ArenaEscalationRecord["sessionMode"];
  permittedActions: readonly string[];
  /** Learning permissions carried by the escalation record (invariant 12/22). */
  learningPermissions: LearningPolicyRef;
  /** Rights/privacy/retention policy propagated to the Arena boundary (invariant 22). */
  policy: PolicySet;
  /** Only context the escalation policy permits to leave the tenant. */
  contextRefs: readonly SportaId[];
}

/** Verdict of validating an Arena result before application. */
export interface ValidationVerdict {
  resultId: SportaId;
  accepted: boolean;
  checks: readonly { check: string; passed: boolean }[];
}

/**
 * The Arena client boundary port. Escalation is idempotent per idempotencyKey.
 *
 * Wave-4 W4C-2 additive (invariant 22): `readResult` accepts an optional
 * caller usage context; a prohibited direct read is a typed
 * `ArenaReadRefusalError`. Absent usage ⇒ the pre-wave-4 behavior.
 */
export interface ArenaClientPort {
  recordGap(input: RecordCapabilityGapInput): Promise<CapabilityGapRecord>;
  escalate(input: EscalateInput): Promise<ArenaEscalationRecord>;
  readResult(
    escalationId: SportaId,
    usage?: ArenaReadUsageContext,
  ): Promise<ArenaResultRecord | null>;
  validateResult(result: ArenaResultRecord): Promise<ValidationVerdict>;
}
