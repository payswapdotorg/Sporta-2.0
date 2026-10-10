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
// Wave-4 W4C-3 restructure: the trace/port type definitions moved to
// src/domain (loopPorts.ts, learningPorts.ts) — the repo pattern for
// every sibling package — and are re-exported here unchanged, so the
// public surface is the identical set of names (verified by
// sporta-surface-check). The app layer now imports them from the domain
// files, never from this entrypoint (which value-exports the wave-4
// composition roots below); that app->contract edge was the only one of
// its kind in the repo and became an import cycle.
export type {
  ProductLoopStageKind,
  ProductLoopStage,
  ProductLoopTrace,
  ProductLoopProjectionPort,
} from "./domain/loopPorts.js";
export type { LearningConsentInput, LearningIntakePort } from "./domain/learningPorts.js";

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

// Wave-4 W4C-3 additive (ADR: docs/architecture/adr-wave4-c6-host.md —
// the host-conversion lane): the composition roots re-exported through
// the public entrypoint so the packages/web host (and any future shell)
// constructs them through the package boundary exactly like every
// sibling module's service exports. Surface change is additive-only
// (frozen names unchanged; verified by sporta-surface-check).
export { ProductLoopProjection } from "./app/productLoopProjection.js";
export type { ProductLoopProjectionDeps } from "./app/productLoopDeps.js";
export { LearningIntakeService } from "./app/learningIntake.js";
export type { LearningIntakeServiceDeps } from "./app/learningIntake.js";
