/**
 * sporta-product — the intent-first product shell projection.
 *
 * The product shell is a READ MODEL over the public contracts of the
 * other Sporta modules: it projects a WorkGraph into the canonical
 * 12-stage product loop trace (intent -> ... -> organization
 * improvement) and records explicit learning consent. It implements no
 * domain logic and mutates no other module's state; the learning
 * candidates it creates are scope "user", status "candidate" only —
 * promotion belongs to the organizations/lab/evaluation modules.
 */
import type { LearningPolicyRef, SportaId } from "@sporta/contracts/contract";
import type { LearningArtifactRecord } from "@sporta/contracts/contract";

/** The 12 canonical UX stages of the Sporta product loop. */
export type ProductLoopStageKind =
  | "intent"
  | "organization"
  | "execution"
  | "progress"
  | "artifact"
  | "takeover"
  | "editor"
  | "learning"
  | "capability-gap"
  | "arena"
  | "result"
  | "organization-improvement";

/** One stage of the product loop trace. */
export interface ProductLoopStage {
  stage: ProductLoopStageKind;
  /** Reference to the underlying record when derivable (e.g. the organization version). */
  ref?: string;
  state: "pending" | "active" | "done" | "blocked" | "refused";
  detail?: string;
}

/** The full product loop trace for one WorkGraph. */
export interface ProductLoopTrace {
  workGraphId: string;
  stages: readonly ProductLoopStage[];
}

/** Projects a WorkGraph into the 12-stage product loop trace. */
export interface ProductLoopProjectionPort {
  trace(workGraphId: string): Promise<ProductLoopTrace>;
}

/** Input for recording one explicit learning-consent decision. */
export interface LearningConsentInput {
  workGraphId: SportaId;
  userId: SportaId;
  /** Learning scopes the consent covers (values from LearningPolicyRef.scopes). */
  scopes: LearningPolicyRef["scopes"];
  decision: "granted" | "denied";
}

/**
 * The learning-consent intake port. Granted consent produces a candidate
 * LearningArtifactRecord (scope "user"); denied consent creates NO
 * artifact and throws `LearningConsentRefusedError` (design decision:
 * the port is a pure success type, refusals are typed errors — see
 * CONTRACT.md). Idempotent per (workGraphId, userId, scopes).
 */
export interface LearningIntakePort {
  recordConsent(input: LearningConsentInput): Promise<LearningArtifactRecord>;
}

/** Typed error taxonomy of this module. */
export {
  ProductShellError,
  UnknownWorkGraphError,
  LearningConsentRefusedError,
  LearningScopeError,
} from "./domain/errors.js";

// Wave-3 additive (ADR: docs/architecture/adr-wave3-read-seams.md): the
// learning read seam. `LearningIntakeService` implements
// `LearningArtifactReadPort` additively (bounded listLearningArtifacts,
// summaries field-for-field with LearningArtifactRecord). The projection
// consumes it (and the sibling read seams) as OPTIONAL injected deps —
// absent seams keep their stages honestly pending.
export type {
  LearningArtifactReadPort,
  LearningArtifactSummary,
  LearningArtifactQuery,
} from "@sporta/contracts/contract";
