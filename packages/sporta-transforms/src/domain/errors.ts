/**
 * Typed sporta-transforms errors (domain layer — pure, no IO).
 *
 * The compute-fallback precedent law: failures are typed records with
 * machine-readable reasons, never stringly exceptions and never silent
 * defaults. Validation failures carry the frozen
 * `TransformGraphValidation` record; plan refusals carry their
 * refusal kind; run-assembly failures carry the refusing seam.
 */
import type { TransformGraphValidation } from "@sporta/transforms/contract";
import type { LiveIngressRefusal, LiveSessionEvidence } from "./liveSource.js";

/** Base class for all typed sporta-transforms errors. */
export class TransformError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/**
 * A pipeline manifest failed typed validation at run time (P9-01,
 * fail-closed). Carries the full frozen validation record — the same
 * shape `validateTransformPipelineManifest` returns — so callers and
 * tests observe one vocabulary.
 */
export class TransformGraphValidationError extends TransformError {
  readonly validation: TransformGraphValidation & { valid: false };

  constructor(validation: TransformGraphValidation & { valid: false }) {
    const first = validation.violations[0];
    super(
      `transform pipeline manifest failed validation: ${first?.kind ?? "unknown"} — ${first?.detail ?? "no violations recorded"}`,
      `graph-validation:${first?.kind ?? "none"}`,
    );
    this.validation = validation;
  }
}

/** The typed plan-level refusal family (W9A-2). */
export type TransformExecutionRefusalKind =
  | "unresolvable-pinned-dependency"
  | "step-budget-overflow"
  | "sandbox-unsupported";

/**
 * A validated graph could not be resolved into an executable bounded
 * plan: a pinned component the resolver cannot resolve, a step-budget
 * overflow, or a sandbox profile this execution environment does not
 * support. Cycles are already caught at validation; this error family
 * is plan-level only.
 */
export class TransformExecutionPlanError extends TransformError {
  readonly refusalKind: TransformExecutionRefusalKind;
  /** The node or component the refusal is about, when applicable. */
  readonly nodeId: string | null;

  constructor(
    message: string,
    refusalKind: TransformExecutionRefusalKind,
    nodeId: string | null = null,
  ) {
    super(message, `plan-refusal:${refusalKind}${nodeId === null ? "" : `:${nodeId}`}`);
    this.refusalKind = refusalKind;
    this.nodeId = nodeId;
  }
}

/**
 * Run-assembly failed (W9A-4): the Artifact Fabric refused a commit,
 * or the run cannot honestly proceed. Never fabricated success.
 */
export class TransformRunError extends TransformError {
  readonly runManifestId: string | null;

  constructor(message: string, detail: string, runManifestId: string | null = null) {
    super(message, detail);
    this.runManifestId = runManifestId;
  }
}

/**
 * W10A-3 — typed live-ingress failure: the live session refused to
 * open, failed mid-drain, or the run aborted before completion.
 * Carries the typed refusal and the partial `LiveSessionEvidence`
 * retained per the back-pressure law (either may be null when
 * nothing opened). A live refusal never fabricates a run — callers
 * fail closed (a disconnected/failed source is never successful).
 */
export class LiveIngressError extends TransformError {
  readonly refusal: LiveIngressRefusal | null;
  readonly evidence: LiveSessionEvidence | null;

  constructor(message: string, refusal: LiveIngressRefusal | null, evidence: LiveSessionEvidence | null) {
    super(message, `live-ingress:${refusal === null ? "unknown" : refusal.kind}`);
    this.refusal = refusal;
    this.evidence = evidence;
  }
}
