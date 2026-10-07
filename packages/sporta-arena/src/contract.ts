/**
 * sporta-arena — CapabilityGap intake and the Arena client boundary.
 *
 * Arena owns human expert sessions; Sporta stays authoritative over its
 * own state. Arena never directly mutates Sporta canonical state; results
 * are validated before application (invariants 14/15).
 */
import type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  CapabilityGapRecord,
  LearningPolicyRef,
  PolicySet,
  SportaId,
} from "@sporta/contracts/contract";

export type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  CapabilityGapRecord,
} from "@sporta/contracts/contract";

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

/** The Arena client boundary port. Escalation is idempotent per idempotencyKey. */
export interface ArenaClientPort {
  recordGap(input: RecordCapabilityGapInput): Promise<CapabilityGapRecord>;
  escalate(input: EscalateInput): Promise<ArenaEscalationRecord>;
  readResult(escalationId: SportaId): Promise<ArenaResultRecord | null>;
  validateResult(result: ArenaResultRecord): Promise<ValidationVerdict>;
}

/** Typed error taxonomy of this module (domain errors re-exported additively). */
export {
  ArenaError,
  GapConflictError,
  UnknownGapError,
  EscalationConflictError,
  EscalationPolicyError,
  IllegalGapTransitionError,
  IllegalEscalationTransitionError,
} from "./domain/errors.js";

/** Capability-gap lifecycle state (open -> escalated -> resolved/closed). */
export type { GapStatus } from "./domain/gap.js";

/** Arena escalation lifecycle state and outcome (contract chain). */
export type {
  EscalationLifecycle,
  EscalationOutcome,
} from "./domain/escalation.js";

/** Session-mode and result-type views used by validation. */
export type { SessionMode, ArenaResultType } from "./domain/resultValidation.js";
