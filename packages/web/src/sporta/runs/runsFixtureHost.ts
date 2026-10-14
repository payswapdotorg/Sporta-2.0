/**
 * The runs screen browser FIXTURE host (W11C — the
 * studioBrowserFixture.ts precedent). EVIDENCE CLASS: FIXTURE, labeled
 * at the point of use. The REAL TransformRunService is a headless Node
 * leg and cannot execute in a browser bundle; these static demo records
 * (one succeeded, one typed-failure, one fallback) let the destination
 * screen be exercised in the browser. No run record here is ever
 * claimed real — the REAL run records (including a real-local-live
 * graded live session) are projected in the node battery.
 *
 * A run-history read seam on the composition is NEXT DEPENDENCIES; the
 * real-host adapter for this lane surfaces that honestly (typed
 * refusal) instead of carrying fake history.
 */
import type { RunsScreenPort, RunRecordShape } from "./runsScreenPorts.js";

const FIXTURE_SUCCEEDED: RunRecordShape = {
  runManifestId: "run:fixture-highlights-1",
  workGraph: { workGraphId: "wg:fixture-runs", runRef: "run:fixture-1" },
  release: {
    pipelineId: "pipe:fixture-runs-highlights",
    version: "1.0.0",
    releaseDigest: "sha256:" + "9a".repeat(32),
  },
  componentDigests: [
    { nodeId: "node:trim", digest: "sha256:" + "9b".repeat(32) },
  ],
  configHash: "sha256:" + "9c".repeat(32),
  inputs: [{ artifactRef: "art:fixture-feed-1", rightsSnapshot: "rights:fixture-operator" }],
  grantedApplicationCapabilities: [],
  steps: [
    {
      nodeId: "node:trim",
      status: "succeeded",
      timingMs: 812,
      resourceUse: { cpuMs: 96, memoryMiB: 64, outputBytes: 1024 },
      cost: null,
      detail: "fixture demo step — trimmed to the highlights window (3 kept, 2 dropped)",
      provenance: {
        sourceKind: "authorized-source",
        sourceRef: "art:fixture-feed-1",
        capturedAt: "2026-10-13T12:00:00.000Z",
        confidence: 0.95,
      },
    },
  ],
  outputs: [
    {
      artifactRevisionId: "rev:fixture-runs-1",
      semanticEvidence: "fixture demo — kept events byte-exact, drops counted",
    },
  ],
  semanticFidelity: { grade: "fixture", note: "fixture demo run — the REAL measured run is the headless composition" },
  startedAt: "2026-10-13T12:01:00.000Z",
  finishedAt: "2026-10-13T12:01:01.000Z",
  retention: "fixture demo retention note",
};

const FIXTURE_TYPED_FAILURE: RunRecordShape = {
  runManifestId: "run:fixture-failure-1",
  workGraph: { workGraphId: "wg:fixture-runs", runRef: "run:fixture-2" },
  release: {
    pipelineId: "pipe:fixture-runs-boards",
    version: "1.0.0",
    releaseDigest: "sha256:" + "8d".repeat(32),
  },
  componentDigests: [{ nodeId: "node:boards", digest: "sha256:" + "8e".repeat(32) }],
  configHash: "sha256:" + "8f".repeat(32),
  inputs: [{ artifactRef: "art:fixture-feed-2", rightsSnapshot: "rights:fixture-operator" }],
  grantedApplicationCapabilities: [],
  steps: [
    {
      nodeId: "node:boards",
      status: "typed-failure",
      timingMs: 120,
      resourceUse: { cpuMs: 12, memoryMiB: 32, outputBytes: 0 },
      cost: null,
      detail: "fixture demo typed failure — output-size envelope exceeded; nothing written",
      provenance: null,
    },
  ],
  outputs: [],
  semanticFidelity: { grade: "declared", note: "typed failure — no output to grade" },
  startedAt: "2026-10-13T12:02:00.000Z",
  finishedAt: "2026-10-13T12:02:01.000Z",
  retention: "fixture demo retention note",
};

const FIXTURE_FALLBACK: RunRecordShape = {
  runManifestId: "run:fixture-fallback-1",
  workGraph: { workGraphId: "wg:fixture-runs", runRef: "run:fixture-3" },
  release: {
    pipelineId: "pipe:fixture-runs-overlay",
    version: "0.9.0",
    releaseDigest: "sha256:" + "7e".repeat(32),
  },
  componentDigests: [{ nodeId: "node:overlay", digest: "sha256:" + "6d".repeat(32) }],
  configHash: "sha256:" + "6e".repeat(32),
  inputs: [{ artifactRef: "art:fixture-feed-3", rightsSnapshot: "rights:fixture-operator" }],
  grantedApplicationCapabilities: ["observe"],
  steps: [
    {
      nodeId: "node:overlay",
      status: "fallback-used",
      timingMs: 640,
      resourceUse: { cpuMs: 80, memoryMiB: 48, outputBytes: 512 },
      cost: { amount: 0.02, currency: "USD" },
      detail: "fixture demo fallback — model lane unavailable, declared fallback served a lower-fidelity overlay",
      provenance: {
        sourceKind: "observation",
        sourceRef: "source:fixture-overlay",
        capturedAt: "2026-10-13T12:03:00.000Z",
        confidence: 0.6,
      },
    },
  ],
  outputs: [{ artifactRevisionId: "rev:fixture-fallback-1", semanticEvidence: "fixture demo fallback output" }],
  semanticFidelity: { grade: "declared", note: "fallback path — fidelity declared by the publisher" },
  startedAt: "2026-10-13T12:03:00.000Z",
  finishedAt: "2026-10-13T12:03:02.000Z",
  retention: "fixture demo retention note",
};

const FIXTURE_RUNS: readonly RunRecordShape[] = [
  FIXTURE_SUCCEEDED,
  FIXTURE_TYPED_FAILURE,
  FIXTURE_FALLBACK,
];

/** The labeled FIXTURE runs host (see file header). */
export function createRunsFixtureHost(): RunsScreenPort {
  return {
    backing: "fixture",
    async listRuns() {
      return FIXTURE_RUNS.map((run) => ({ ...run }));
    },
    async readRun(runManifestId: string) {
      const run = FIXTURE_RUNS.find((entry) => entry.runManifestId === runManifestId);
      if (run === undefined) {
        throw new Error(`fixture host: no run ${runManifestId} (typed refusal — never a fabricated record)`);
      }
      return { ...run };
    },
  };
}
