/**
 * W11B-3 — the live-evidence composition tests (packages/web,
 * node:test + tsx — the project law; the sportaHost.test.ts /
 * studioComposition.test.ts precedent).
 *
 * EVIDENCE CLASS (labeled): REAL — a REAL localhost HTTP live session
 * (the W10 `RealLocalHttpLiveSourceAdapter`: a real node:http server
 * socket + real client per session), drained by the REAL
 * `LiveTransformRunService` composition INTO the EXISTING
 * `TransformRunService` (a REAL deterministic-filter child process on
 * real pipes; the in-memory blob/artifact stores are the packages'
 * labeled FIXTURE adapters over real ports). The pinned
 * `LiveSessionEvidence` is projected through the studio's pure
 * display mapping and asserted VERBATIM. FIXTURE — the seed content
 * (frames, manifest) and the in-memory stores.
 *
 * This is the studio's live-evidence display proven at the seam the
 * W10 lanes actually own: the exact grade string, frame statistics,
 * close reason, and typed refusals — never "production", never
 * fabricated success, refusals displayed as refusals.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FixedClock,
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  jsonEventStreamTrimComponent,
  LiveIngressError,
  LiveTransformRunService,
  RealLocalHttpLiveSourceAdapter,
  Sha256TransformHash,
  TransformRunService,
  type LiveSourceDescriptor,
  type TransformPipelineManifest,
} from "@sporta/transforms/contract";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import { liveRefusalLine, liveSourceFromEvidence, liveSourceRows } from "../src/sporta/studio/liveSourceViews.js";
import { projectSamplePreview } from "../src/sporta/studio/samplePreview.js";

const FIXED_TIME = "2026-10-14T12:00:00.000Z";
const DATA_KIND = "sporta/json-event-stream";
const STREAM_PORT = { name: "events", dataKind: DATA_KIND, required: true, cardinality: "stream" as const };

/** Deterministic NDJSON event frames (the first-slice event shape). */
function eventFrames(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      eventId: `evt-${index + 1}`,
      entityId: index % 2 === 0 ? "team-A" : "team-B",
      atMs: 1000 + index * 1000,
      confidence: 0.3 + index / 10,
      provenance: {
        sourceKind: "observation",
        sourceRef: `source:${index + 1}`,
        capturedAt: FIXED_TIME,
      },
    }),
  );
}

const TEST_POLICY: PolicySet = {
  rights: { holders: ["holder:studio-workbench"], usages: ["render", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** The trim pipeline (fixture CONTENT; the trim component digest is REAL). */
function trimManifest(): TransformPipelineManifest {
  const hash = new Sha256TransformHash();
  const trim = jsonEventStreamTrimComponent(hash);
  return {
    pipelineId: "pipe:studio-workbench-live",
    version: "1.0.0",
    manifestDigest: hash.text(JSON.stringify({ pipeline: "pipe:studio-workbench-live" })),
    publisher: "publisher:studio-workbench",
    purpose: "w11b live-evidence test: trim a live feed to the highlights window",
    limitations: ["test seed content"],
    inputs: [STREAM_PORT],
    outputs: [STREAM_PORT],
    nodes: [
      {
        nodeId: "node:trim",
        kind: "deterministic-filter",
        componentRef: { kind: "deterministic-filter", digest: trim.digest, name: trim.name },
        inputs: [STREAM_PORT],
        outputs: [STREAM_PORT],
        parameterSchema: {
          startMs: { type: "number", required: true, minimum: 0 },
          endMs: { type: "number", required: true, minimum: 0 },
        },
        requiredPermissions: [],
        sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
        resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
        errorBehavior: { mode: "fail-closed", contract: "out-of-window or malformed input fails closed" },
        provenanceRules: ["kept events carry input provenance unchanged"],
      },
    ],
    edges: [],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [],
    licensing: { license: "MIT", provenance: "studio workbench test" },
    policy: TEST_POLICY,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 500, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  };
}

const LIVE_DESCRIPTOR: LiveSourceDescriptor = {
  sourceId: "live:studio-workbench-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};

const FEED_PROVENANCE: ProvenanceDescriptor = {
  sourceKind: "authorized-source",
  sourceRef: "art:studio-workbench-live",
  capturedAt: FIXED_TIME,
  confidence: 0.95,
};

function makeLiveService(): LiveTransformRunService {
  const hash = new Sha256TransformHash();
  const componentStore = new DeterministicComponentStore([jsonEventStreamTrimComponent(hash)], hash);
  const runs = new TransformRunService({
    clock: new FixedClock(FIXED_TIME),
    hash,
    artifacts: new ArtifactGraphService({ now: () => FIXED_TIME }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: new DeterministicFilterNodeAdapter({ store: componentStore }),
    components: componentStore,
  });
  return new LiveTransformRunService({ runs });
}

test("W11B-3 REAL live evidence: a real-local-live session's pinned evidence flows through the studio display VERBATIM", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: eventFrames(5) });
  try {
    const live = makeLiveService();
    const run = await live.runLivePipeline({
      run: {
        manifest: trimManifest(),
        workGraph: { workGraphId: "wg:studio-workbench-live", runRef: "run:studio-workbench-live" },
        parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
        releaseDigest: `sha256:${"f".repeat(64)}`,
      },
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
      feed: {
        artifactRef: "art:studio-workbench-live",
        rightsSnapshot: "rights:studio-workbench-operator",
        provenance: FEED_PROVENANCE,
      },
    });

    // The REAL run really ran the deterministic lane over the drained frames.
    assert.equal(run.steps.length, 1);
    assert.equal(run.steps[0]?.status, "succeeded");
    assert.ok(run.steps[0]?.timingMs > 0, "real child-process timing");
    assert.match(run.outputs[0]?.semanticEvidence ?? "", /3 kept byte-exact, 2 dropped/);

    // The pinned session evidence is the honest W10 record.
    assert.equal(run.liveSessions.length, 1);
    const evidence = run.liveSessions[0];
    assert.ok(evidence !== undefined);
    assert.equal(evidence.descriptor.grade, "real-local-live", "the exact grade string is pinned");
    assert.equal(evidence.descriptor.sourceId, "live:studio-workbench-1");
    assert.equal(evidence.framesConsumed, 5);
    assert.equal(evidence.closeReason, "completed");
    assert.ok(evidence.closedAt !== null);
    assert.equal(evidence.refusal, null);

    // The studio display mapping carries it VERBATIM.
    const view = liveSourceFromEvidence(evidence);
    const rows = liveSourceRows(view);
    const value = (label: string) => rows.find((row) => row.label === label)?.value;
    assert.equal(value("Session"), "live:studio-workbench-1");
    assert.equal(value("Grade"), "real-local-live");
    assert.equal(value("Frames consumed"), "5");
    assert.equal(value("Close reason"), "completed");
    assert.equal(value("Opened"), evidence.openedAt);
    assert.equal(value("Closed"), evidence.closedAt);

    // Grade-label law: the word "production" appears nowhere in the display.
    assert.ok(!JSON.stringify(rows).includes("production"));

    // The SAME run feeds the preview display (point of use): the
    // measured carry-forward evidence + grade, verbatim.
    const preview = projectSamplePreview(run, "live session: 5 frames drained (real-local-live)");
    assert.equal(preview.evidenceGrade, "measured");
    assert.match(preview.outputSummary, /1 output revision/);
    assert.match(preview.semanticEvidence, /3 kept byte-exact, 2 dropped/);

    console.log("W11B-3 LIVE EVIDENCE REAL EVIDENCE:");
    console.log(
      `- session: REAL localhost HTTP live source (${String(evidence.descriptor.sourceId)}), ${String(evidence.framesConsumed)} frames, close reason ${evidence.closeReason}`,
    );
    console.log(`- run: REAL deterministic-filter child process (${run.steps[0]?.timingMs ?? 0}ms)`);
    console.log(`- display grade: ${view.descriptor.grade} (verbatim, closed vocabulary)`);
  } finally {
    await adapter.dispose();
  }
});

test("W11B-3 live refusal lane: an invalid descriptor refuses TYPED and the refusal displays verbatim (no run, no fabricated session)", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: eventFrames(5) });
  try {
    const live = makeLiveService();
    // queueBound must be a positive integer (the W10 back-pressure law):
    // this descriptor refuses fail-closed BEFORE any IO.
    const invalid: LiveSourceDescriptor = { ...LIVE_DESCRIPTOR, queueBound: 0 };
    await assert.rejects(
      () =>
        live.runLivePipeline({
          run: {
            manifest: trimManifest(),
            workGraph: { workGraphId: "wg:studio-workbench-live", runRef: "run:studio-workbench-live" },
            parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
            releaseDigest: `sha256:${"f".repeat(64)}`,
          },
          liveSource: { port: adapter, descriptor: invalid },
          feed: {
            artifactRef: "art:studio-workbench-live",
            rightsSnapshot: "rights:studio-workbench-operator",
            provenance: FEED_PROVENANCE,
          },
        }),
      (cause: unknown) => {
        assert.ok(cause instanceof LiveIngressError, "the typed live-ingress error");
        const ingress = cause as LiveIngressError;
        assert.ok(ingress.refusal !== null);
        assert.equal(ingress.refusal.kind, "invalid-descriptor");
        assert.equal(ingress.refusal.framesConsumed, 0);
        // The refusal DISPLAYS as a refusal, verbatim, with the partial-evidence count.
        const line = liveRefusalLine({
          kind: ingress.refusal.kind,
          detail: ingress.refusal.detail,
          framesConsumed: ingress.refusal.framesConsumed,
        });
        assert.match(line, /^invalid-descriptor — /);
        assert.match(line, /frames consumed before refusal: 0\)$/);
        assert.match(ingress.refusal.detail, /positive integer/);
        return true;
      },
    );
  } finally {
    await adapter.dispose();
  }
});
