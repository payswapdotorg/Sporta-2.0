import type { SportaId, Iso8601 } from "./primitives.js";
/**
 * Wave-3 additive read seams — TL-serialized (ADR:
 * docs/architecture/adr-wave3-read-seams.md).
 *
 * These are READ-ONLY projection seams: summary shapes + ports the
 * product shell's ProductLoopTrace projection consumes to un-pend the
 * takeover/editor/learning/arena/result/organization-improvement
 * stages. Domain modules IMPLEMENT the ports behind their own
 * entrypoints (sporta-editors, sporta-product learning intake,
 * sporta-lab/evaluation, sporta-arena); nothing here mutates state.
 *
 * Laws (the wave-2 contracts doctrine, carried forward):
 * - additive-only: v1 frozen surfaces unchanged; new names only;
 * - summaries align field-for-field with the canonical records
 *   (EditorSessionRecord, LearningArtifactRecord, PromotionRecord,
 *   ArenaEscalationRecord, ArenaResultRecord) — no shape drift;
 * - implementers may return a SUPERSET of fields, never fewer;
 * - queries are bounded (optional filters + limit); no unbounded reads.
 */

/** Cross-domain reference kinds a work-graph node may carry (additive, optional). */
export type WorkGraphNodeRefKind =
  | "capability-gap"
  | "escalation"
  | "arena-result"
  | "artifact-revision"
  | "editor-session"
  | "learning-artifact";

/** One typed cross-domain reference on a WorkGraphNode. */
export interface WorkGraphNodeRef {
  kind: WorkGraphNodeRefKind;
  refId: SportaId;
}

/** Editor-session summary — mirrors EditorSessionRecord (artifacts.ts). */
export interface EditorSessionSummary {
  editorSessionId: SportaId;
  editorId: string;
  revisionId: SportaId;
  mode: "local" | "remote" | "embedded" | "external";
  integrationLevel: 1 | 2 | 3;
  openedAt: Iso8601;
  closedAt?: Iso8601;
}

/** Bounded editor-session history query. */
export interface EditorSessionHistoryQuery {
  revisionId?: SportaId;
  editorSessionId?: SportaId;
  openOnly?: boolean;
  limit?: number;
}

/**
 * Read seam implemented by sporta-editors: bounded session-history
 * reads for the product projection (takeover + editor stages).
 */
export interface EditorSessionHistoryReadPort {
  listEditorSessions(
    query: EditorSessionHistoryQuery,
  ): Promise<readonly EditorSessionSummary[]>;
}

/** Learning-artifact summary — mirrors LearningArtifactRecord (arena.ts). */
export interface LearningArtifactSummary {
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
  status: "candidate" | "evaluating" | "promoted" | "rejected" | "expired";
}

/** Bounded learning-artifact query. */
export interface LearningArtifactQuery {
  scope?: "user" | "tenant" | "global";
  status?: "candidate" | "evaluating" | "promoted" | "rejected" | "expired";
  learningArtifactId?: SportaId;
  limit?: number;
}

/**
 * Read seam implemented by sporta-product's learning intake: bounded
 * candidate/learning-artifact reads for the product projection
 * (learning stage).
 */
export interface LearningArtifactReadPort {
  listLearningArtifacts(
    query: LearningArtifactQuery,
  ): Promise<readonly LearningArtifactSummary[]>;
}

/** Organization candidate summary — the Lab population's candidate view. */
export interface OrganizationCandidateSummary {
  /** The candidate record id (lab/evaluation population member). */
  candidateId: SportaId;
  organizationId: SportaId;
  version: number;
  status: "candidate" | "promoted" | "rejected" | "rolled-back";
  basis: string;
}

/** Promotion summary — mirrors PromotionRecord (arena.ts). */
export interface PromotionSummary {
  promotionId: SportaId;
  candidateId: SportaId;
  decision: "promoted" | "rejected" | "rolled-back";
  decidedAt: Iso8601;
}

/** Bounded organization candidate/promotion query. */
export interface OrganizationCandidateQuery {
  organizationId?: SportaId;
  candidateId?: SportaId;
  status?: "candidate" | "promoted" | "rejected" | "rolled-back";
  limit?: number;
}

/**
 * Read seam implemented by sporta-lab/sporta-evaluation (worker A's
 * lane): bounded candidate + promotion reads for the product projection
 * (organization-improvement stage).
 */
export interface OrganizationCandidateReadPort {
  listOrganizationCandidates(
    query: OrganizationCandidateQuery,
  ): Promise<readonly OrganizationCandidateSummary[]>;
  listPromotions(
    query: OrganizationCandidateQuery,
  ): Promise<readonly PromotionSummary[]>;
}

/** Escalation summary — mirrors ArenaEscalationRecord (arena.ts). */
export interface EscalationSummary {
  escalationId: SportaId;
  gapId: SportaId;
  workGraphId: SportaId;
  sessionMode: "observe" | "correct" | "unblock" | "takeover" | "teach" | "review";
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
}

/** Arena result summary — mirrors ArenaResultRecord (arena.ts). */
export interface EscalationResultSummary {
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
  validated: boolean;
}

/** Bounded escalation query. */
export interface EscalationQuery {
  workGraphId?: SportaId;
  gapId?: SportaId;
  escalationId?: SportaId;
  limit?: number;
}

/** Bounded arena-result query. */
export interface EscalationResultQuery {
  escalationId?: SportaId;
  resultId?: SportaId;
  validatedOnly?: boolean;
  limit?: number;
}

/**
 * Read seam implemented by sporta-arena: bounded escalation + result
 * reads for the product projection (arena + result stages).
 */
export interface EscalationReadPort {
  listEscalations(query: EscalationQuery): Promise<readonly EscalationSummary[]>;
  listResults(
    query: EscalationResultQuery,
  ): Promise<readonly EscalationResultSummary[]>;
}
