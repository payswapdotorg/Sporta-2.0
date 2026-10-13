/**
 * sporta-transforms — typed transform DAG, resolution/composition and
 * transform-run manifests (P9 / Wave 0 TL freeze).
 *
 * Source of truth: docs/contracts/transform-marketplace.md and
 * docs/architecture/adr-transform-studio-marketplace-and-application-environments.md.
 *
 * A pipeline is a typed directed ACYCLIC graph. Nodes are models, scripts,
 * deterministic filters, existing Sporta capabilities or granted
 * application-environment actions — pinned by immutable digest, never by
 * moving tag. Execution stays a WorkGraph run over the existing ZCode
 * runtime/compute seams; this module owns NO second runtime, scheduler or
 * task authority (architecture lock invariants 25, 27, 37).
 *
 * This file is the single public entrypoint (TL-frozen). Workers add
 * implementations behind it additively; semantic changes to these names
 * require an ADR.
 */
import type {
  SportaId,
  Iso8601,
  ContentHash,
  Confidence,
  ProvenanceDescriptor,
  PolicySet,
  WorkGraphRecord,
  ArtifactRevisionRecord,
} from "@sporta/contracts/contract";
export type {
  SportaId,
  Iso8601,
  ContentHash,
  Confidence,
  ProvenanceDescriptor,
  PolicySet,
  WorkGraphRecord,
  ArtifactRevisionRecord,
} from "@sporta/contracts/contract";

/** What a node executes. Models are optional; pipelines may be pure code. */
export type TransformNodeKind =
  | "model"
  | "script"
  | "deterministic-filter"
  | "sporta-capability"
  | "application-environment-action";

/** Typed input/output port on a node. */
export interface TransformPortSpec {
  /** Port name unique within its node. */
  name: string;
  /** Opaque, pipeline-declared data kind (e.g. "video/football-feed"). */
  dataKind: string;
  /** Whether the port is required for the node to run. */
  required: boolean;
  /** Declared multiplicity (single item vs stream/chunked). */
  cardinality: "single" | "stream";
}

/** Bounded resource envelope declared per node and enforced at run time. */
export interface TransformResourceBudget {
  /** Wall-clock ceiling in milliseconds for the node; 0 = declared unset. */
  timeoutMs: number;
  /** Maximum output bytes a node may emit; overflow is a typed failure. */
  maxOutputBytes: number;
  /** Declared CPU-weight class for sandbox placement. */
  cpuClass: "light" | "standard" | "heavy";
  /** Declared memory ceiling in MiB for sandbox placement. */
  memoryMiB: number;
}

/** Isolation profile for untrusted node execution (lock invariant 32). */
export interface TransformSandboxProfile {
  /** Sandbox kind; "none" is only legal for declared-trusted nodes. */
  kind: "process" | "container" | "worker" | "none";
  /** Default-deny network egress; exceptions are explicit and narrow. */
  networkEgress: "denied" | "allowlisted";
  /** Host secret access is never granted by default. */
  hostSecretAccess: false | { explicitlyGranted: readonly string[] };
}

/** One typed operation in the pipeline DAG. */
export interface TransformNode {
  /** Stable node id unique within the pipeline. */
  nodeId: string;
  kind: TransformNodeKind;
  /** Immutable component reference — digest-pinned, never a moving tag. */
  componentRef: { kind: TransformNodeKind; digest: string; name: string };
  /** Input/output port declarations. */
  inputs: readonly TransformPortSpec[];
  outputs: readonly TransformPortSpec[];
  /** JSON-schema-ish parameter declaration (types + defaults + bounds). */
  parameterSchema: Record<string, unknown>;
  /** Permissions this node requires; marketplace/policy checks them. */
  requiredPermissions: readonly string[];
  sandbox: TransformSandboxProfile;
  resources: TransformResourceBudget;
  /** Declared error/fallback behavior (typed, never silent). */
  errorBehavior: {
    /** Failure classification declared by the publisher. */
    mode: "typed-failure" | "declared-fallback" | "fail-closed";
    /** Human-readable contract for what happens on failure. */
    contract: string;
  };
  /** Provenance rules this node promises for its outputs. */
  provenanceRules: readonly string[];
}

/** Directed edge between two node ports. */
export interface TransformEdge {
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

/** Pinned dependency on an external component or model. */
export interface TransformPinnedDependency {
  kind: "code" | "model" | "runtime" | "dependency";
  name: string;
  digest: string;
  /** License declared for the pinned component. */
  license: string;
  /** Where bytes are stored (GitHub/HF/blob seam); never the authority. */
  storageRef: string;
}

/** Semantic-preservation contract declared by the publisher (P9-04). */
export interface TransformSemanticInvariants {
  /** Claims about event/entity identity, order, timestamps, uncertainty. */
  preservationClaims: readonly string[];
  /** Explicit list of what may change or drop; empty = fully preserved. */
  declaredChanges: readonly string[];
  /** How preservation is measured (evidence kind + benchmark ids). */
  measurement: { evidenceKind: string; benchmarkIds: readonly string[] };
}

/** The pipeline manifest — an immutable, typed, versioned product. */
export interface TransformPipelineManifest {
  pipelineId: SportaId;
  version: string;
  manifestDigest: ContentHash;
  publisher: string;
  purpose: string;
  limitations: readonly string[];
  /** Typed pipeline-level input/output ports. */
  inputs: readonly TransformPortSpec[];
  outputs: readonly TransformPortSpec[];
  nodes: readonly TransformNode[];
  edges: readonly TransformEdge[];
  semantics: TransformSemanticInvariants;
  expectedOutputs: readonly string[];
  pinnedDependencies: readonly TransformPinnedDependency[];
  licensing: { license: string; provenance: string };
  policy: PolicySet;
  /** Cancellation/checkpoint behavior declared for runs. */
  cancellation: { supportsCheckpoint: boolean; contract: string };
  /** Latency/resource expectations declared for feed-launch disclosure. */
  expectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: "measured" | "fixture" | "declared";
  };
}

/** Immutable submission for review — hashes over everything behavioral. */
export interface TransformReleaseCandidate {
  candidateId: SportaId;
  pipelineId: SportaId;
  version: string;
  /** Digest of the exact manifest under review. */
  manifestDigest: ContentHash;
  /** Hashes over source, weights, dependencies, runtime image, tests. */
  contentHashes: readonly { kind: string; digest: ContentHash }[];
  /** License/source attestations + SBOM/provenance references. */
  attestations: readonly { kind: string; reference: string }[];
  submittedAt: Iso8601;
  submittedBy: string;
}

/** Per-run pinning record (P9-03/06): the audit anchor of one execution. */
export interface TransformRunManifest {
  runManifestId: SportaId;
  /** The WorkGraph run that executed this pipeline (task authority). */
  workGraph: { workGraphId: SportaId; runRef: string };
  /** The approved release + component digests actually executed. */
  release: { pipelineId: SportaId; version: string; releaseDigest: ContentHash };
  componentDigests: readonly { nodeId: string; digest: ContentHash }[];
  /** Non-secret configuration hash; secrets never appear here. */
  configHash: ContentHash;
  /** Input feed/artifact references + the rights snapshot used. */
  inputs: readonly { artifactRef: string; rightsSnapshot: string }[];
  /** Granted application capabilities this run may exercise. */
  grantedApplicationCapabilities: readonly string[];
  /** Step-level results: timing, resource, cost, typed failures/fallbacks. */
  steps: readonly TransformStepResult[];
  /** Output Artifact Fabric revisions produced by this run. */
  outputs: readonly { artifactRevisionId: SportaId; semanticEvidence: string }[];
  /** Semantic-fidelity evidence grade for this run. */
  semanticFidelity: { grade: "measured" | "fixture" | "declared"; note: string };
  startedAt: Iso8601;
  finishedAt: Iso8601;
  /** Retention scope for this run record. */
  retention: string;
}

/** Result of one node execution inside a run. */
export interface TransformStepResult {
  nodeId: string;
  status: "succeeded" | "typed-failure" | "fallback-used" | "cancelled";
  timingMs: number;
  resourceUse: { cpuMs: number; memoryMiB: number; outputBytes: number };
  cost: { amount: number; currency: string } | null;
  /** Structured failure/fallback detail; never a hidden semantic change. */
  detail: string;
  provenance: ProvenanceDescriptor | null;
}

/** Typed validation outcome for graph checks (fail-closed, P9-01). */
export type TransformGraphValidation =
  | { valid: true; nodeCount: number; edgeCount: number }
  | {
      valid: false;
      violations: readonly {
        kind:
          | "cycle"
          | "unknown-port"
          | "unknown-node"
          | "duplicate-node"
          | "type-mismatch"
          | "missing-parameter"
          | "unpinned-component";
        detail: string;
      }[];
    };

// ============================================================================
// Wave 9 (Worker A) — additive implementations BEHIND the frozen types
// (frozen block above untouched; names appended, surface stays green).
// ============================================================================

// W9A-1 — typed DAG validation (fail-closed).
export type { TransformGraphValidationOptions } from "./domain/graphValidation.js";
export { validateTransformPipelineManifest } from "./domain/graphValidation.js";

// W9A-2 — bounded execution plans + typed plan refusals.
export type {
  TransformExecutionPlanOptions,
  TransformPlannedStep,
  TransformExecutionPlan,
} from "./domain/ports.js";
export { resolveTransformExecutionPlan } from "./domain/executionPlan.js";
export type { TransformExecutionRefusalKind } from "./domain/errors.js";
export {
  TransformError,
  TransformGraphValidationError,
  TransformExecutionPlanError,
  TransformRunError,
} from "./domain/errors.js";

// Execution ports (declared in domain; adapters implement).
export type {
  TransformComponentResolverPort,
  TransformDeterministicNodeInput,
  TransformDeterministicNodeOutput,
  TransformDeterministicNodePort,
  TransformModelInvokeInput,
  TransformModelInvokeOutput,
  TransformModelRefusalKind,
  TransformModelPort,
  TransformHashPort,
} from "./domain/ports.js";

// W9A-4 — carry-forward verification + run assembly.
export type { EventStreamCarryForward } from "./domain/carryForward.js";
export { verifyEventStreamCarryForward } from "./domain/carryForward.js";
export { stableStringify, stableEquals, fnv1aHex } from "./domain/stable.js";
export type {
  TransformRunServiceDeps,
  TransformRunInputArtifact,
  StartTransformRunInput,
} from "./app/transformRunService.js";
export { TransformRunService } from "./app/transformRunService.js";

// Real adapters (hash/clock/component store/REAL deterministic node).
export { sha256Text, sha256Bytes, Sha256TransformHash } from "./adapters/hash.js";
export { systemClockNow, FixedClock } from "./adapters/clock.js";
export type {
  DeterministicComponent,
  PinnedDeterministicComponent,
} from "./adapters/componentStore.js";
export {
  JSON_EVENT_STREAM_TRIM_SOURCE,
  jsonEventStreamTrimComponent,
  DeterministicComponentStore,
} from "./adapters/componentStore.js";
export type { DeterministicFilterNodeDeps } from "./adapters/deterministicFilterNode.js";
export { DeterministicFilterNodeAdapter } from "./adapters/deterministicFilterNode.js";
export type { FixtureTransformModelDeps } from "./adapters/fixtureModelAdapter.js";
export { FixtureTransformModelAdapter } from "./adapters/fixtureModelAdapter.js";
