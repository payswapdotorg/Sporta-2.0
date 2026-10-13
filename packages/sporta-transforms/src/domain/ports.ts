/**
 * sporta-transforms execution ports (domain layer — pure declarations).
 *
 * Execution composes THROUGH these seams, never around them (the
 * architecture lock): the deterministic lane spawns real child
 * processes, the model lane is provider-neutral, hashing and clocks
 * are injected. Adapters (src/adapters) implement; the app-layer run
 * service consumes. No IO lives in this file — declarations only,
 * the sporta-work domain/ports.ts precedent.
 */
import type {
  ContentHash,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type { TransformNode, TransformNodeKind } from "@sporta/transforms/contract";

/**
 * W9A-2 — resolves pinned component references. The component store is
 * the trusted home of executable component sources (digest-pinned).
 * Returning null means the pinned reference cannot be resolved in
 * this execution environment — a typed plan refusal, never an
 * execution-time surprise.
 */
export interface TransformComponentResolverPort {
  resolve(
    componentRef: { kind: TransformNodeKind; digest: string; name: string },
  ): { kind: "deterministic-filter" | "script"; name: string; digest: string } | null;
}

/**
 * W9A-2 — the bounded execution plan resolved from a validated DAG.
 * Pure data: the run service executes it, the plan never schedules by
 * itself (no second runtime — lock invariant 2/27).
 */
export interface TransformExecutionPlanOptions {
  /**
   * Maximum number of steps the plan may declare. Default: the node
   * count (each node executes once; any re-attempt budget must be
   * declared explicitly). Overflow is a typed refusal.
   */
  maxSteps?: number;
  /**
   * Per-node run-time parameters (checked against parameterSchema
   * during the plan's internal re-validation).
   */
  parameters?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** One step in the bounded plan. */
export interface TransformPlannedStep {
  nodeId: string;
  kind: TransformNodeKind;
  /** Execution lane assigned to this step (see SPEC W9A-2). */
  lane: "deterministic-process" | "model-adapter" | "capability-lane-deferred";
  /** Upstream node ids this step depends on (plan order respects them). */
  dependsOn: readonly string[];
}

/** The resolved, bounded plan (W9A-2). */
export interface TransformExecutionPlan {
  pipelineId: SportaId;
  version: string;
  /** Deterministic topological step order (Kahn, declaration tie-break). */
  steps: readonly TransformPlannedStep[];
  /** The step budget this plan was resolved under. */
  budget: { maxSteps: number; declaredSteps: number };
  /** Per-node resource budget projection (declared envelopes, summed). */
  resources: {
    totalMaxOutputBytes: number;
    placement: readonly {
      nodeId: string;
      cpuClass: "light" | "standard" | "heavy";
      memoryMiB: number;
    }[];
  };
}

/**
 * W9A-3 — the REAL deterministic node lane. Implementations spawn a
 * real local child process over real temp-dir files, enforce the
 * declared resource limits, honor cancellation, and return typed
 * outcomes with REAL resource evidence (never fabricated numbers).
 */
export interface TransformDeterministicNodeInput {
  /** The declared node (kind deterministic-filter or script). */
  node: TransformNode;
  /** Run-time parameters for this node (already validated). */
  parameters: Readonly<Record<string, unknown>>;
  /** The input payload plus its carried provenance. */
  input: { bytes: Uint8Array; provenance: ProvenanceDescriptor | null };
  /** Cancellation; aborted runs never commit output. */
  signal?: AbortSignal;
}

/** Typed outcome of one deterministic node execution. */
export interface TransformDeterministicNodeOutput {
  status: "succeeded" | "typed-failure" | "cancelled";
  /** Output bytes exactly when status is "succeeded". */
  outputBytes: Uint8Array | null;
  /** Trim accounting: kept/dropped counts and byte totals (succeeded runs). */
  summary: {
    keptCount: number;
    droppedCount: number;
    inBytes: number;
    outBytes: number;
  } | null;
  /** Real wall-clock milliseconds for the child execution. */
  timingMs: number;
  /** REAL resource evidence observed from the child process. */
  resourceUse: { cpuMs: number; memoryMiB: number; outputBytes: number };
  /** Machine-readable typed detail; never a hidden semantic change. */
  detail: string;
}

export interface TransformDeterministicNodePort {
  execute(input: TransformDeterministicNodeInput): Promise<TransformDeterministicNodeOutput>;
}

/**
 * W9A-3 — provider-neutral model lane. Refusal kinds mirror the
 * compute TypedRefusal precedent (an honest no, never a retry storm).
 * REAL adapters report real cost and evidenceGrade "real"; fixture
 * adapters report evidenceGrade "fixture" and cost null — the grade
 * is the adapter's honesty contract, verified by tests.
 */
export interface TransformModelInvokeInput {
  /** The pinned model component this invocation executes. */
  modelRef: { name: string; digest: string };
  /** Provider-neutral text payload (the lane input). */
  prompt: string;
  /** Model parameters (validated against the node's schema upstream). */
  parameters: Readonly<Record<string, unknown>>;
}

export type TransformModelRefusalKind =
  | "provider-unavailable"
  | "quota-exhausted"
  | "credentials-missing"
  | "policy-denied"
  | "unsupported-operation";

export interface TransformModelInvokeOutput {
  /** Which provider adapter answered. */
  providerId: string;
  /** "real" only for real providers; fixtures say "fixture". */
  evidenceGrade: "real" | "fixture";
  /** Non-null exactly when the invocation was not refused. */
  output: string | null;
  refusal: { kind: TransformModelRefusalKind; detail: string } | null;
  timingMs: number;
  /** Real cost when a real provider charged; null otherwise. */
  cost: { amount: number; currency: string } | null;
  /** Machine-readable detail for the step record. */
  detail: string;
}

export interface TransformModelPort {
  invokeModel(input: TransformModelInvokeInput): Promise<TransformModelInvokeOutput>;
}

/**
 * W9A-4 — injected hashing (domain stays crypto-free). Adapters
 * provide sha256 text/bytes implementations (node:crypto).
 */
export interface TransformHashPort {
  text(value: string): ContentHash;
  bytes(value: Uint8Array): ContentHash;
}
