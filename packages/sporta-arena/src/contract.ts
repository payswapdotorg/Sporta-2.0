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
  urgency: ArenaEscalationRecord["urgency"];
  sessionMode: ArenaEscalationRecord["sessionMode"];
  permittedActions: readonly string[];
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
