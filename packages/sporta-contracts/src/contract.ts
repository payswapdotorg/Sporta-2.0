/**
 * sporta-contracts — canonical Sporta 2.0 record contracts (baseline v1).
 *
 * Source: docs/contracts/sporta-canonical-contracts.md.
 * These types are the frozen semantic baseline. Domain modules own
 * operational ports and implementations; they import records from here.
 * IDs are stable and opaque. Clocks are injectable at runtime; record
 * timestamps are ISO-8601 strings.
 *
 * The record definitions live in src/records/* (module-internal); this
 * file is the single public entrypoint that re-exports the surface.
 */
export type {
  PolicySet,
  RightsScope,
  PrivacyScope,
  RetentionPolicy,
} from "@sporta/policy/contract";

export type {
  SportaId,
  Iso8601,
  ContentHash,
  Confidence,
  ProvenanceDescriptor,
} from "./records/primitives.js";

export type {
  LearningPolicyRef,
  IntentSpec,
  WorkGraphNodeKind,
  WorkGraphNode,
  WorkGraphRecord,
  AgentBodyRecord,
  CapabilityRecord,
  OrganizationVersionRecord,
  ToolSessionRecord,
} from "./records/work.js";

export type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  EditDeltaRecord,
  EditorSessionRecord,
} from "./records/artifacts.js";

export type { SportsWorldModelRecord } from "./records/world.js";

export type {
  EvidenceRecord,
  CapabilityGapRecord,
  ArenaEscalationRecord,
  ArenaResultRecord,
  LearningArtifactRecord,
  EvaluationReportRecord,
  EvaluationMetric,
  PromotionRecord,
} from "./records/arena.js";
