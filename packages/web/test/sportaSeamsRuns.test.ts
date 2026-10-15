/**
 * W12A-1 — the runs REAL host battery (packages/web, node:test + tsx —
 * the project law; the sportaScreens.test.ts precedent).
 *
 * Drives `createRunsRealHost` over the REAL `TransformRunService` (the
 * W11C `makeRuns` precedent — a REAL deterministic-filter child process
 * on real pipes, real carry-forward re-verification; a REAL typed
 * model-refusal step; a REAL declared-fallback step). The host is a
 * pure projection over the service's W12-01 freeze enumeration read
 * (`listRuns()`) and the existing point read (`readRun(id)`).
 *
 * EVIDENCE CLASS (labeled):
 *   REAL — the host satisfies `RunsScreenPort` with `backing: "real"`;
 *   every manifest field projects verbatim through the frozen
 *   `RunRecordShape` mirror; the ledger honesty label surfaces via
 *   `host.gradeNote` (W12-07 law — never re-badged).
 *   FIXTURE — the in-memory stores (artifact graph, blob store, the
 *   fixture model adapter's typed refusal); the run CONTENT seed (the
 *   5-event JSONL stream). The run SERVICE is REAL (the deterministic
 *   lane spawns a real child process; the carry-forward re-verification
 *   is in-process).
 *
 * Acceptance: W12-05 (REAL run through the REAL host), W12-06
 * (refused/failed runs stay visible with typed states verbatim), W12-07
 * (the ledger honesty label surfaces — never re-badged).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ArtifactGraphService,
  InMemoryArtifactBlobStore,
} from "@sporta/artifacts/contract";
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  Sha256TransformHash,
  TransformRunService,
  jsonEventStreamTrimComponent,
} from "@sporta/transforms/contract";
import type {
  TransformNode,
  TransformPipelineManifest,
  TransformRunManifest,
} from "@sporta/transforms/contract";
import { createRunsRealHost } from "../src/sporta/runs/runsRealHost.js";
import { RUNS_LEDGER_GRADE_NOTE } from "../src/sporta/runs/runsRealHost.js";
import type { RunsRealHost } from "../src/sporta/runs/runsRealHost.js";
import type { RunsScreenPort } from "../src/sporta/runs/runsScreenPorts.js";
import {
  runAuditLines,
  runRow,
  runStateClass,
  runStateLabel,
} from "../src/sporta/runs/runsScreenViews.js";
import { createRunsFixtureHost } from "../src/sporta/runs/runsFixtureHost.js";

const FIXED_NOW = "2026-10-13T12:00:00.000Z";
const PINNED = "sha256:" + "ab".repeat(32);
const STREAM = {
  name: "events",
  dataKind: "sporta/json-event-stream",
  required: true,
  cardinality: "stream" as const,
};

// ---------------------------------------------------------------------------
// The REAL run service (the W11C makeRuns precedent).
// ---------------------------------------------------------------------------

const trimComponent = jsonEventStreamTrimComponent(new Sha256TransformHash());

function trimNode(): TransformNode {
  return {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: trimComponent.digest,
      name: trimComponent.name,
    },
    inputs: [STREAM],
    outputs: [STREAM],
    parameterSchema: {
      startMs: { type: "number", required: true, minimum: 0 },
      endMs: { type: "number", required: true, minimum: 0 },
    },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: {
      timeoutMs: 15_000,
      maxOutputBytes: 1_000_000,
      cpuClass: "light",
      memoryMiB: 256,
    },
    errorBehavior: {
      mode: "fail-closed",
      contract: "out-of-window or malformed input fails closed",
    },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
}

function modelNode(mode: "declared-fallback" | "fail-closed"): TransformNode {
  return {
    nodeId: "node:model",
    kind: "model",
    componentRef: {
      kind: "model",
      digest: `sha256:${"6".repeat(64)}`,
      name: "fixture-event-summer",
    },
    inputs: [STREAM],
    outputs: [
      {
        name: "summary",
        dataKind: "sporta/json-summary",
        required: true,
        cardinality: "single" as const,
      },
    ],
    parameterSchema: {},
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: {
      timeoutMs: 5_000,
      maxOutputBytes: 100_000,
      cpuClass: "light",
      memoryMiB: 256,
    },
    errorBehavior:
      mode === "declared-fallback"
        ? { mode: "declared-fallback", contract: "refusals fall back to identity pass-through" }
        : { mode: "fail-closed", contract: "refusals fail the step closed — never a silent pass-through" },
    provenanceRules: ["model output labeled with its evidence grade"],
  };
}

function testManifest(nodes: readonly TransformNode[]): TransformPipelineManifest {
  return {
    pipelineId: "pipe:w12a-runs",
    version: "1.0.0",
    manifestDigest: PINNED,
    publisher: "publisher:w12a-test",
    purpose: "w12a runs battery",
    limitations: ["test only"],
    inputs: [STREAM],
    outputs: [STREAM],
    nodes,
    edges: [],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [],
    licensing: { license: "MIT", provenance: "test" },
    policy: {
      rights: {
        holders: ["holder:test"],
        usages: ["render", "derive"],
        prohibitions: [],
      },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: {
      typicalLatencyMs: 500,
      declaredThroughput: "single stream",
      evidenceGrade: "fixture",
    },
  };
}

function eventStreamBytes(): Uint8Array {
  const events = [0, 1, 2, 3, 4].map((index) => ({
    eventId: `evt-${index + 1}`,
    entityId: index % 2 === 0 ? "team-A" : "team-B",
    atMs: 1000 + index * 1000,
    confidence: 0.3 + index / 10,
    provenance: {
      sourceKind: "observation",
      sourceRef: `source:${index + 1}`,
      capturedAt: "2026-10-13T00:00:00.000Z",
    },
  }));
  return new TextEncoder().encode(
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  );
}

function makeRuns(): TransformRunService {
  const hash = new Sha256TransformHash();
  const store = new DeterministicComponentStore([trimComponent], hash);
  return new TransformRunService({
    clock: { now: () => FIXED_NOW },
    hash,
    artifacts: new ArtifactGraphService({ now: () => FIXED_NOW }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: new DeterministicFilterNodeAdapter({ store }),
    components: store,
  });
}

async function runSucceeded(
  runs: TransformRunService,
  runRef: string,
): Promise<TransformRunManifest> {
  return runs.runPipeline({
    manifest: testManifest([trimNode()]),
    workGraph: { workGraphId: "wg:w12a-runs", runRef },
    parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
    inputs: [
      {
        artifactRef: "art:w12a-feed",
        rightsSnapshot: "rights:w12a-operator",
        bytes: eventStreamBytes(),
        provenance: {
          sourceKind: "authorized-source",
          sourceRef: "source:feed-1",
          capturedAt: "2026-10-13T00:00:00.000Z",
          confidence: 0.95,
        },
      },
    ],
    // Distinct releaseDigest per run so the ledger's runManifestId
    // hash (which includes releaseDigest) deduplicates correctly —
    // otherwise two runs with the same (pipelineId, version, config,
    // inputs, startedAt) would collide and the Map would dedupe them.
    releaseDigest: `sha256:${"a".repeat(63)}1`,
  });
}

async function runTypedFailure(
  runs: TransformRunService,
  runRef: string,
): Promise<TransformRunManifest> {
  return runs.runPipeline({
    manifest: testManifest([modelNode("fail-closed")]),
    workGraph: { workGraphId: "wg:w12a-runs", runRef },
    parameters: { "node:model": { forceRefusal: "provider-unavailable" } },
    inputs: [
      {
        artifactRef: "art:w12a-feed",
        rightsSnapshot: "rights:w12a-operator",
        bytes: eventStreamBytes(),
        provenance: {
          sourceKind: "authorized-source",
          sourceRef: "source:feed-1",
          capturedAt: "2026-10-13T00:00:00.000Z",
          confidence: 0.95,
        },
      },
    ],
    releaseDigest: `sha256:${"a".repeat(63)}2`,
  });
}

async function runFallbackUsed(
  runs: TransformRunService,
  runRef: string,
): Promise<TransformRunManifest> {
  return runs.runPipeline({
    manifest: testManifest([modelNode("declared-fallback")]),
    workGraph: { workGraphId: "wg:w12a-runs", runRef },
    parameters: { "node:model": { forceRefusal: "provider-unavailable" } },
    inputs: [
      {
        artifactRef: "art:w12a-feed",
        rightsSnapshot: "rights:w12a-operator",
        bytes: eventStreamBytes(),
        provenance: {
          sourceKind: "authorized-source",
          sourceRef: "source:feed-1",
          capturedAt: "2026-10-13T00:00:00.000Z",
          confidence: 0.95,
        },
      },
    ],
    releaseDigest: `sha256:${"a".repeat(63)}3`,
  });
}

// ---------------------------------------------------------------------------
// W12-05 — REAL run through the REAL host: list + point reads agree;
// manifests verbatim; typed errors propagate.
// ---------------------------------------------------------------------------

test("W12A-1 runs REAL host: backing real + the ledger honesty grade note surfaces (W12-07)", () => {
  const runs = makeRuns();
  const host: RunsRealHost = createRunsRealHost({ service: runs });
  // STRUCTURAL COMPAT (compile-time): the REAL host satisfies the
  // frozen port — the state-owner law without cross-lane imports.
  const port: RunsScreenPort = host;
  void port;
  assert.equal(host.backing, "real", "the REAL host reports backing 'real'");
  assert.equal(
    host.gradeNote,
    RUNS_LEDGER_GRADE_NOTE,
    "the ledger honesty label surfaces verbatim (W12-07)",
  );
  assert.match(
    host.gradeNote,
    /BACKING: REAL \(ledger: fixture-grade in-memory\)/,
    "the grade note carries the exact honest label — never re-badged",
  );
  assert.doesNotMatch(
    host.gradeNote,
    /production|real-local-live/,
    "the grade note is never inflated beyond the ledger's actual grade",
  );
});

test("W12A-1 runs REAL host: a REAL deterministic run projects through the host (W12-05)", async () => {
  const runs = makeRuns();
  const manifest = await runSucceeded(runs, "run:w12a-1");
  const host = createRunsRealHost({ service: runs });

  const listed = await host.listRuns();
  assert.equal(
    listed.length,
    1,
    "the REAL host lists the one REAL run the service has assembled",
  );
  const projected = listed[0];
  assert.ok(projected !== undefined);

  // listRuns() and readRun(id) AGREE — the host is a pure projection.
  const read = await host.readRun(manifest.runManifestId);
  assert.deepEqual(
    projected,
    read,
    "listRuns and readRun project the same manifest verbatim (the host owns no state)",
  );

  // Every manifest field carries verbatim through the frozen mirror.
  assert.equal(read.runManifestId, manifest.runManifestId);
  assert.equal(read.workGraph.workGraphId, "wg:w12a-runs");
  assert.equal(read.workGraph.runRef, "run:w12a-1");
  assert.equal(read.release.pipelineId, "pipe:w12a-runs");
  assert.equal(read.release.version, "1.0.0");
  assert.equal(read.release.releaseDigest, manifest.release.releaseDigest, "releaseDigest carries verbatim");
  assert.equal(read.configHash, manifest.configHash, "configHash verbatim");
  assert.equal(read.retention, manifest.retention, "retention verbatim");
  assert.equal(read.startedAt, FIXED_NOW, "startedAt verbatim");
  assert.equal(read.finishedAt, FIXED_NOW, "finishedAt verbatim");

  // The REAL deterministic step carries verbatim.
  assert.equal(read.steps.length, 1);
  const step = read.steps[0];
  assert.ok(step !== undefined);
  assert.equal(step.nodeId, "node:trim");
  assert.equal(step.status, "succeeded");
  assert.ok(step.timingMs > 0, "the REAL child-process timing carries verbatim");
  assert.equal(step.cost, null, "the deterministic lane carries no cost");
  assert.ok(step.provenance !== null, "the deterministic step's provenance carries verbatim");

  // The outputs carry verbatim — one committed revision with semantic evidence.
  assert.equal(read.outputs.length, 1);
  assert.equal(read.outputs[0]?.artifactRevisionId, manifest.outputs[0]?.artifactRevisionId);
  // The output's semanticEvidence is the run service's carry-forward
  // verification detail + the child trim summary (the exact verbatim
  // string the deterministic lane produced).
  assert.match(
    read.outputs[0]?.semanticEvidence ?? "",
    /carry-forward verified/,
    "the deterministic lane's carry-forward verification carries verbatim",
  );
  assert.match(
    read.outputs[0]?.semanticEvidence ?? "",
    /child trim summary: kept \d+, dropped \d+/,
    "the child trim summary carries verbatim",
  );

  // The semanticFidelity grade renders as the record's own grade (UI-15).
  assert.equal(read.semanticFidelity.grade, "measured");
  assert.match(
    read.semanticFidelity.note,
    /deterministic lane carry-forward re-verified in-process/,
    "the semanticFidelity note is the manifest's own — never inflated",
  );

  // The view-models project the REAL record correctly (the screen
  // extension at the HOST level — the W11C view battery already
  // proved the views; this asserts the host feeds them identically).
  const row = runRow(read);
  assert.equal(row.stateClass, "succeeded");
  assert.equal(row.stateLabel, "Finished — succeeded");
  assert.equal(row.outputsCount, 1);
  assert.equal(row.liveSessionsCount, 0, "the base manifest carries no live sessions (omitted; additive)");
  const audit = runAuditLines(read);
  assert.ok(audit.some((line) => line.label === "Work graph" && line.value.includes("wg:w12a-runs")));
  assert.ok(audit.some((line) => line.label === "Semantic fidelity" && line.value.startsWith("measured")));
});

test("W12A-1 runs REAL host: readRun refuses typed for an unknown run (W12-05 refusal law)", async () => {
  const runs = makeRuns();
  const host = createRunsRealHost({ service: runs, workspace: "ws:w12a-test" });
  await assert.rejects(
    () => host.readRun("runm:unknown"),
    /real host: no run runm:unknown in workspace ws:w12a-test \(typed refusal/,
    "the typed refusal carries the verbatim reason + the workspace label",
  );
  // The list is still empty — the refusal is honest, never a fabricated record.
  const listed = await host.listRuns();
  assert.equal(listed.length, 0);
});

// ---------------------------------------------------------------------------
// W12-06 — honest-states law: refused/failed runs stay visible with
// their typed states verbatim (never softened, never re-badged).
// ---------------------------------------------------------------------------

test("W12A-1 runs REAL host: a REAL typed model refusal projects the typed-failure state verbatim (W12-06)", async () => {
  const runs = makeRuns();
  const manifest = await runTypedFailure(runs, "run:w12a-2");
  const host = createRunsRealHost({ service: runs });

  // The run stays VISIBLE in the list — the typed failure is not
  // hidden; the screen shows it with its honest state.
  const listed = await host.listRuns();
  assert.equal(listed.length, 1);
  const projected = listed[0];
  assert.ok(projected !== undefined);
  assert.equal(projected.runManifestId, manifest.runManifestId);

  // The step status carries VERBATIM — never softened to "succeeded",
  // never re-badged as "fallback-used".
  assert.equal(projected.steps.length, 1);
  assert.equal(projected.steps[0]?.status, "typed-failure", "the REAL run service records the typed refusal step verbatim");
  assert.match(projected.steps[0]?.detail ?? "", /refusal/);
  assert.equal(projected.steps[0]?.provenance, null, "a typed-failure step carries no provenance (the law, not a missing field)");

  // The view-model projects the typed state verbatim.
  assert.equal(runStateClass(projected), "typed-failure");
  assert.equal(runStateLabel(runStateClass(projected)), "Finished — typed failure");

  // readRun agrees with listRuns.
  const read = await host.readRun(manifest.runManifestId);
  assert.equal(read.steps[0]?.status, "typed-failure");
});

test("W12A-1 runs REAL host: a REAL declared-fallback model refusal projects fallback-used verbatim (W12-06)", async () => {
  const runs = makeRuns();
  const manifest = await runFallbackUsed(runs, "run:w12a-3");
  const host = createRunsRealHost({ service: runs });

  const listed = await host.listRuns();
  assert.equal(listed.length, 1);
  const projected = listed[0];
  assert.ok(projected !== undefined);

  // The DECLARED fallback mode is honored — never relabeled as
  // "succeeded" or "typed-failure".
  assert.equal(projected.steps.length, 1);
  assert.equal(projected.steps[0]?.status, "fallback-used", "the declared fallback mode is honored verbatim");
  assert.match(projected.steps[0]?.detail ?? "", /fallback used after model refusal/);

  // The view-model projects the fallback state verbatim.
  assert.equal(runStateClass(projected), "fallback-used");
  assert.equal(runStateLabel(runStateClass(projected)), "Finished — fallback used");

  // readRun agrees.
  const read = await host.readRun(manifest.runManifestId);
  assert.equal(read.steps[0]?.status, "fallback-used");
});

test("W12A-1 runs REAL host: multiple REAL runs project through the host in ledger order", async () => {
  const runs = makeRuns();
  // Commit three REAL runs in order: succeeded, typed-failure, fallback-used.
  const m1 = await runSucceeded(runs, "run:w12a-multi-1");
  const m2 = await runTypedFailure(runs, "run:w12a-multi-2");
  const m3 = await runFallbackUsed(runs, "run:w12a-multi-3");
  const host = createRunsRealHost({ service: runs });

  const listed = await host.listRuns();
  assert.equal(listed.length, 3, "all three REAL runs surface honestly — none hidden");
  // Ledger insertion order: succeeded → typed-failure → fallback-used.
  assert.equal(listed[0]?.runManifestId, m1.runManifestId);
  assert.equal(listed[1]?.runManifestId, m2.runManifestId);
  assert.equal(listed[2]?.runManifestId, m3.runManifestId);

  // Each run's state class carries VERBATIM (the honest-states law).
  assert.equal(runStateClass(listed[0]!), "succeeded");
  assert.equal(runStateClass(listed[1]!), "typed-failure");
  assert.equal(runStateClass(listed[2]!), "fallback-used");

  // readRun agrees for each.
  for (const expected of [m1, m2, m3]) {
    const read = await host.readRun(expected.runManifestId);
    assert.equal(read.runManifestId, expected.runManifestId);
    assert.equal(read.steps.length, expected.steps.length);
    assert.equal(read.steps[0]?.status, expected.steps[0]?.status);
  }
});

// ---------------------------------------------------------------------------
// W12-07 — the ledger honesty label carries to the screen surface
// (BACKING: REAL (ledger: fixture-grade in-memory)) — never re-badged.
// ---------------------------------------------------------------------------

test("W12A-1 runs REAL host: the ledger honesty label is the documented exact string (W12-07)", () => {
  const runs = makeRuns();
  const host = createRunsRealHost({ service: runs });
  // The exact string — the screen's badge law from the ADR.
  assert.equal(
    host.gradeNote,
    "BACKING: REAL (ledger: fixture-grade in-memory)",
    "the W12-07 law: the exact honesty label surfaces to the screen",
  );
  // The host's backing is "real" — the host IS real (it projects over
  // the REAL service). The gradeNote is the deeper honesty: the LEDGER
  // is fixture-grade in-memory (W9A label carried, not re-badged).
  assert.equal(host.backing, "real");
  assert.match(host.gradeNote, /REAL/);
  assert.match(host.gradeNote, /fixture-grade in-memory/);
  assert.doesNotMatch(host.gradeNote, /production/);
});

test("W12A-1 runs REAL host: the labeled fixture host stays for the browser demo (sibling, not replacement)", async () => {
  // The W11C fixture host is NOT deleted — the browser demo mount
  // keeps it with backing "fixture" + honest fixture labels. The REAL
  // host is a composition-grade sibling over the REAL service.
  const fixtureHost = createRunsFixtureHost();
  assert.equal(fixtureHost.backing, "fixture");
  assert.equal(
    (fixtureHost as RunsScreenPort).backing,
    "fixture",
    "the fixture host still satisfies the frozen port (sibling)",
  );
  const runs = makeRuns();
  const realHost = createRunsRealHost({ service: runs });
  assert.equal(realHost.backing, "real");
  // The two hosts coexist — the fixture host has demo records; the
  // real host has none yet (the service has no runs).
  const fixtureListed = await fixtureHost.listRuns();
  const realListed = await realHost.listRuns();
  assert.equal(fixtureListed.length, 3, "the fixture host carries 3 demo records");
  assert.equal(realListed.length, 0, "the real host has no runs until the service assembles one");
});
