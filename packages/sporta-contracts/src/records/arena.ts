import type { SportaId, Iso8601, ContentHash, ProvenanceDescriptor } from "./primitives.js";
/**
 * Evidence, Gap, Arena, Learning, Evaluation, Promotion records — EvidenceRecord, CapabilityGap, ArenaEscalation/Result, LearningArtifact.
 */
import type { PolicySet } from "@sporta/policy/contract";
import type { LearningPolicyRef } from "./work.js";

/** Machine-readable evidence. No hidden chain-of-thought is ever stored. */
export interface EvidenceRecord {
  evidenceId: SportaId;
  kind: "action" | "observation" | "measurement" | "evaluation" | "human-judgment";
  subject: SportaId;
  payloadHash: ContentHash;
  provenance: ProvenanceDescriptor;
}

/** Typed missing capability discovered during execution. */
export interface CapabilityGapRecord {
  gapId: SportaId;
  workGraphId: SportaId;
  capabilityNeed: string;
  attemptedStrategies: readonly string[];
  contextRefs: readonly SportaId[];
  evidence: readonly SportaId[];
  status: "open" | "escalated" | "resolved" | "closed";
}

/** Idempotent typed request to Arena. */
export interface ArenaEscalationRecord {
  escalationId: SportaId;
  idempotencyKey: string;
  gapId: SportaId;
  tenantRef: string;
  workGraphId: SportaId;
  urgency: "routine" | "high" | "critical";
  budget?: { currency: string; limit: number };
  sessionMode: "observe" | "correct" | "unblock" | "takeover" | "teach" | "review";
  permittedActions: readonly string[];
  learningPermissions: LearningPolicyRef;
  lifecycle:
    | "created"
    | "triaged"
    | "matching"
    | "offered"
    | "accepted"
    | "session_ready"
    | "in_progress"
    | "submitted"
    | "validating"
    | "accepted_result"
    | "revision_required"
    | "rejected"
    | "closed";
  policy: PolicySet;
}

/** Validated typed result returned from Arena. */
export interface ArenaResultRecord {
  resultId: SportaId;
  escalationId: SportaId;
  resultType:
    | "correction"
    | "unblock"
    | "solution"
    | "review"
    | "evidence-bundle"
    | "knowledge-patch"
    | "tool-gap-signal"
    | "evaluation-verdict"
    | "learning-artifact-ref";
  payloadHash: ContentHash;
  validated: boolean;
  learningArtifactRefs: readonly SportaId[];
  provenance: ProvenanceDescriptor;
}

/** Candidate reusable improvement. */
export interface LearningArtifactRecord {
  learningArtifactId: SportaId;
  class:
    | "preference"
    | "workflow"
    | "tool-selection"
    | "organization-composition"
    | "capability"
    | "knowledge"
    | "policy"
    | "non-reusable-observation";
  scope: "user" | "tenant" | "global";
  evidence: readonly SportaId[];
  permission: LearningPolicyRef;
  status: "candidate" | "evaluating" | "promoted" | "rejected" | "expired";
}

/** Evidence used to compare organization candidates. */
export interface EvaluationReportRecord {
  reportId: SportaId;
  candidateIds: readonly SportaId[];
  metrics: readonly EvaluationMetric[];
  evidence: readonly SportaId[];
}

/** One comparison axis. No single metric suffices for promotion. */
export interface EvaluationMetric {
  axis:
    | "intent-success"
    | "output-quality"
    | "source-fidelity"
    | "preference-fit"
    | "intervention-cost"
    | "latency"
    | "resource-cost"
    | "reliability"
    | "determinism"
    | "provenance"
    | "rights-security-privacy";
  value: number;
  basis: "measured" | "estimated" | "fixture";
}

/** Immutable lifecycle/promotion decision. */
export interface PromotionRecord {
  promotionId: SportaId;
  candidateId: SportaId;
  decision: "promoted" | "rejected" | "rolled-back";
  gates: readonly { gate: string; passed: boolean }[];
  evidence: readonly SportaId[];
  decidedAt: Iso8601;
}
