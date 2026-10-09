import type { SportaId, Iso8601 } from "./primitives.js";
/**
 * Intent & Work records — IntentSpec, WorkGraph nodes/record, AgentBody, Capability, OrganizationVersion, ToolSession.
 */
import type { PolicySet } from "@sporta/policy/contract";
import type { WorkGraphNodeRef } from "./readSeams.js";

/** How learning is permitted for a run. Empty scopes = no learning. */
export interface LearningPolicyRef {
  scopes: readonly (
    | "preference"
    | "workflow"
    | "tool-selection"
    | "organization-composition"
    | "capability"
    | "knowledge"
  )[];
  requireConsent: boolean;
}

/** A structured user goal (canonical contracts: IntentSpec). */
export interface IntentSpec {
  goal: string;
  constraints: readonly string[];
  qualityTarget?: string;
  deadline?: Iso8601;
  budget?: { currency: string; limit: number };
  editorPreferences?: readonly string[];
  toolPreferences?: readonly string[];
  artifactRequirements: readonly string[];
  learningPolicy: LearningPolicyRef;
  policy: PolicySet;
}

/** Canonical operational graph node kinds. */
export type WorkGraphNodeKind = "task" | "run" | "action" | "artifact" | "evidence" | "outcome";

/** One node of a WorkGraph. */
export interface WorkGraphNode {
  nodeId: SportaId;
  kind: WorkGraphNodeKind;
  parent?: SportaId;
  /** Monotonic sequence within the graph. */
  seq: number;
  /**
   * Wave-3 additive: typed cross-domain references (escalations, gaps,
   * arena results, artifact revisions, editor sessions, learning
   * artifacts) reachable from this node. Optional — v1 graphs without
   * refs stay valid (the projection degrades to seam-pending).
   * Shape authority: records/readSeams.ts (TL-serialized).
   */
  refs?: readonly WorkGraphNodeRef[];
}

/** Intent -> Tasks -> Runs -> Actions -> Artifacts -> Evidence -> Outcomes. */
export interface WorkGraphRecord {
  workGraphId: SportaId;
  intent: IntentSpec;
  nodes: readonly WorkGraphNode[];
  createdAt: Iso8601;
  updatedAt: Iso8601;
  status: "open" | "executing" | "awaiting-user" | "escalated" | "closed";
}

/** Persistent professional capability composition independent of model/provider. */
export interface AgentBodyRecord {
  bodyId: SportaId;
  capabilities: readonly SportaId[];
  cognitiveSubstrates: readonly string[];
  tools: readonly SportaId[];
}

/** A typed capability with IO, limits and evidence expectations. */
export interface CapabilityRecord {
  capabilityId: SportaId;
  inputs: readonly string[];
  outputs: readonly string[];
  limits: readonly string[];
  requiredTools: readonly SportaId[];
  evidenceExpectations: readonly string[];
}

/** Immutable organization composition. Promoted versions never change. */
export interface OrganizationVersionRecord {
  organizationId: SportaId;
  version: number;
  intentProfile: string;
  roleGraph: readonly SportaId[];
  agentBodies: readonly SportaId[];
  cognitiveSubstrates: readonly string[];
  toolGraph: readonly SportaId[];
  workflowGraph: readonly SportaId[];
  environmentProfile: string;
  fallbacks: readonly string[];
  budgets: { latencyMsMax?: number; costMax?: number };
  learnedPreferences: readonly SportaId[];
  evidence: readonly SportaId[];
  policy: PolicySet;
}

/** One execution of a provider-neutral tool. */
export interface ToolSessionRecord {
  toolSessionId: SportaId;
  toolRef: SportaId;
  startedAt: Iso8601;
  endedAt?: Iso8601;
  status: "running" | "succeeded" | "failed" | "refused";
  policy: PolicySet;
}
