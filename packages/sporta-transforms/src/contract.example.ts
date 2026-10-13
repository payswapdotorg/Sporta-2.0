import type {
  TransformPipelineManifest,
  TransformNode,
  TransformReleaseCandidate,
  TransformRunManifest,
  TransformStepResult,
  TransformGraphValidation,
} from "./contract.js";

/** Example deterministic filter node (fixture-grade, no model). */
export const exampleTransformNode: TransformNode = {
  nodeId: "node:filter-1",
  kind: "deterministic-filter",
  componentRef: { kind: "deterministic-filter", digest: "sha256:example", name: "clip-trim" },
  inputs: [{ name: "feed", dataKind: "video/football-feed", required: true, cardinality: "single" }],
  outputs: [{ name: "clipped", dataKind: "video/football-feed", required: true, cardinality: "single" }],
  parameterSchema: { startSec: { type: "number", minimum: 0 }, endSec: { type: "number", minimum: 0 } },
  requiredPermissions: [],
  sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
  resources: { timeoutMs: 5000, maxOutputBytes: 1000000, cpuClass: "light", memoryMiB: 128 },
  errorBehavior: { mode: "typed-failure", contract: "out-of-range parameters fail closed" },
  provenanceRules: ["output carries input provenance unchanged"],
};

/** Example pipeline manifest (one node, no model — the first-slice shape). */
export const exampleTransformPipelineManifest: TransformPipelineManifest = {
  pipelineId: "pipe:example",
  version: "1.0.0",
  manifestDigest: "sha256:example",
  publisher: "publisher:example",
  purpose: "trim an authorized clip deterministically",
  limitations: ["no model, no live feed claims"],
  inputs: [{ name: "feed", dataKind: "video/football-feed", required: true, cardinality: "single" }],
  outputs: [{ name: "clipped", dataKind: "video/football-feed", required: true, cardinality: "single" }],
  nodes: [exampleTransformNode],
  edges: [],
  semantics: {
    preservationClaims: ["event identity and order unchanged"],
    declaredChanges: ["start/end boundaries"],
    measurement: { evidenceKind: "fixture", benchmarkIds: [] },
  },
  expectedOutputs: ["trimmed video artifact"],
  pinnedDependencies: [],
  licensing: { license: "MIT", provenance: "example" },
  policy: {
    rights: { holders: ["holder:example"], usages: ["render", "derive"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
  cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
  expectations: { typicalLatencyMs: 500, declaredThroughput: "single clip", evidenceGrade: "fixture" },
};

/** Example immutable release candidate. */
export const exampleTransformReleaseCandidate: TransformReleaseCandidate = {
  candidateId: "cand:example",
  pipelineId: "pipe:example",
  version: "1.0.0",
  manifestDigest: "sha256:example",
  contentHashes: [{ kind: "source", digest: "sha256:example" }],
  attestations: [{ kind: "license", reference: "LICENSE" }],
  submittedAt: "2026-10-13T00:00:00.000Z",
  submittedBy: "publisher:example",
};

/** Example step result (typed failure lane shown honestly). */
export const exampleTransformStepResult: TransformStepResult = {
  nodeId: "node:filter-1",
  status: "typed-failure",
  timingMs: 12,
  resourceUse: { cpuMs: 10, memoryMiB: 64, outputBytes: 0 },
  cost: null,
  detail: "endSec before startSec — fail closed",
  provenance: null,
};

/** Example run manifest pinning the example release. */
export const exampleTransformRunManifest: TransformRunManifest = {
  runManifestId: "runm:example",
  workGraph: { workGraphId: "wg:example", runRef: "run:example" },
  release: { pipelineId: "pipe:example", version: "1.0.0", releaseDigest: "sha256:example" },
  componentDigests: [{ nodeId: "node:filter-1", digest: "sha256:example" }],
  configHash: "sha256:example-config",
  inputs: [{ artifactRef: "artifact:example", rightsSnapshot: "rights:example" }],
  grantedApplicationCapabilities: [],
  steps: [exampleTransformStepResult],
  outputs: [],
  semanticFidelity: { grade: "fixture", note: "example only" },
  startedAt: "2026-10-13T00:00:00.000Z",
  finishedAt: "2026-10-13T00:00:01.000Z",
  retention: "tenant-default",
};

/** Example fail-closed validation outcome. */
export const exampleTransformGraphValidation: TransformGraphValidation = {
  valid: false,
  violations: [{ kind: "type-mismatch", detail: "port dataKind mismatch: feed vs events" }],
};
