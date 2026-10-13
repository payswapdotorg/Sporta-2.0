/**
 * W9A-4 / P9-02..P9-06 — the transform run service integration tests.
 *
 * EVIDENCE CLASS: MIXED — the deterministic lane is REAL (a real child
 * process runs per step), the artifact fabric / work graph services are
 * the existing in-memory fixture-grade adapters from @sporta/artifacts
 * and @sporta/work (real ports, fixture persistence), and the model
 * lane is the labeled FIXTURE adapter. Every pinning/secret/lineage
 * assertion observes real record contents.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "@sporta/artifacts/contract";
import { InMemoryWorkGraphStore, WorkGraphService } from "@sporta/work/contract";
import {
  FixedClock,
  FixtureTransformModelAdapter,
  Sha256TransformHash,
  TransformGraphValidationError,
  TransformRunService,
  stableStringify,
} from "../src/contract.js";
import {
  EVENT_STREAM_DATAKIND,
  eventStreamBytes,
  feedProvenance,
  hash,
  makeExecutor,
  makeManifest,
  makeModelNode,
  makeStore,
  makeTrimNode,
  trimComponent,
} from "./helpers.js";

const FIXED_TIME = "2026-10-13T12:00:00.000Z";

function makeRunService(overrides: { workGraphRefs?: WorkGraphService; workGraphArtifactNode?: string } = {}) {
  const artifacts = new ArtifactGraphService({ now: () => FIXED_TIME });
  const blobs = new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes));
  const store = makeStore();
  const service = new TransformRunService({
    clock: new FixedClock(FIXED_TIME),
    hash: new Sha256TransformHash(),
    artifacts,
    blobs,
    models: new FixtureTransformModelAdapter(),
    deterministic: makeExecutor(store),
    components: store,
    ...(overrides.workGraphRefs !== undefined
      ? { workGraphRefs: overrides.workGraphRefs, workGraphArtifactNode: overrides.workGraphArtifactNode }
      : {}),
  });
  return { service, artifacts, blobs };
}

const baseRunInput = {
  workGraph: { workGraphId: "wg:test-run", runRef: "run:test-1" },
  parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
  inputs: [
    {
      artifactRef: "art:feed-1",
      rightsSnapshot: "rights:snapshot-1",
      bytes: eventStreamBytes(),
      provenance: feedProvenance,
    },
  ],
};

test("REAL run: deterministic pipeline executes in a real child process and pins everything (P9-02/P9-03)", async () => {
  const { service } = await makeRunService();
  const manifest = makeManifest([makeTrimNode()]);
  const run = await service.runPipeline({ ...baseRunInput, manifest, releaseDigest: `sha256:${"f".repeat(64)}` });

  assert.equal(run.steps.length, 1);
  assert.equal(run.steps[0]?.status, "succeeded");
  assert.ok(run.steps[0]!.timingMs > 0, "real wall-clock timing");
  assert.ok(run.steps[0]!.resourceUse.memoryMiB > 0, "real child RSS evidence");
  assert.equal(run.steps[0]?.provenance, feedProvenance, "provenance carried forward unchanged");

  // P9-03 pinning: release digest, component digests, non-secret config hash.
  assert.equal(run.release.releaseDigest, `sha256:${"f".repeat(64)}`);
  assert.deepEqual(
    run.componentDigests,
    [{ nodeId: "node:trim", digest: trimComponent.digest }],
    "the run pins the exact component digest it executed",
  );
  const expectedConfigHash = hash.text(
    stableStringify({ parameters: baseRunInput.parameters, maxSteps: 1, releaseDigest: `sha256:${"f".repeat(64)}` }),
  );
  assert.equal(run.configHash, expectedConfigHash, "configHash is sha256 over the stable-stringified non-secret config");
  assert.deepEqual(run.inputs, [{ artifactRef: "art:feed-1", rightsSnapshot: "rights:snapshot-1" }]);
  assert.equal(run.semanticFidelity.grade, "measured");
  assert.match(run.semanticFidelity.note, /byte-exact/);
  assert.equal(run.startedAt, FIXED_TIME);
  assert.equal(run.finishedAt, FIXED_TIME);
  assert.ok(service.readRun(run.runManifestId) !== null, "the run ledger reads the assembled manifest back");
});

test("P9-04: kept events carry forward byte-exact; drops are explicit and counted", async () => {
  const { service } = await makeRunService();
  const run = await service.runPipeline({ ...baseRunInput, manifest: makeManifest([makeTrimNode()]) });
  assert.equal(run.outputs.length, 1);
  assert.match(run.outputs[0]?.semanticEvidence ?? "", /3 kept byte-exact, 2 dropped/);
  assert.match(run.outputs[0]?.semanticEvidence ?? "", /order\/timestamps\/uncertainty\/provenance preserved/);
});

test("P9-03: secrets never appear in the run record (env values cannot leak)", async () => {
  const secretToken = "sk-test-DO-NOT-LEAK-9f8e7d6c";
  process.env.SPORTA_TEST_SECRET_TOKEN = secretToken;
  try {
    const { service } = await makeRunService();
    const run = await service.runPipeline({
      ...baseRunInput,
      manifest: makeManifest([makeTrimNode()]),
    });
    const serialized = JSON.stringify(run);
    assert.ok(!serialized.includes(secretToken), "the secret token value must not appear in the run manifest");
    assert.ok(!serialized.includes("SPORTA_TEST_SECRET_TOKEN"), "the secret variable name must not appear either");
    assert.match(run.configHash, /^sha256:[0-9a-f]{64}$/, "the config hash is opaque");
  } finally {
    delete process.env.SPORTA_TEST_SECRET_TOKEN;
  }
});

test("P9-06: outputs are immutable content-addressed revisions; prior revisions remain readable", async () => {
  const { service, artifacts } = await makeRunService();
  const first = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([makeTrimNode()]),
  });
  const second = await service.runPipeline({
    ...baseRunInput,
    parameters: { "node:trim": { startMs: 0, endMs: 6000 } },
    manifest: makeManifest([makeTrimNode()]),
  });
  assert.notEqual(first.runManifestId, second.runManifestId, "different config, different run identity");
  const firstRevision = first.outputs[0]?.artifactRevisionId;
  const secondRevision = second.outputs[0]?.artifactRevisionId;
  assert.ok(firstRevision !== undefined && secondRevision !== undefined);
  assert.notEqual(firstRevision, secondRevision);
  // Prior revisions stay readable after the later run.
  const earlier = await artifacts.readRevision(firstRevision);
  const later = await artifacts.readRevision(secondRevision);
  assert.ok(earlier !== null, "the first run's revision is still readable");
  assert.ok(later !== null);
  assert.notEqual(earlier?.contentHash, later?.contentHash);
  // Both artifacts carry the run's policy and immutable editability.
  const artifact = artifacts.readArtifact(`art:transform:${first.runManifestId}:node:trim`);
  assert.ok(artifact !== null);
  assert.equal(artifact?.editability, "derived-only");
});

test("P9-06: a re-run of the same identity with changed content chains a new revision onto the lineage", async () => {
  const { service, artifacts } = await makeRunService();
  const first = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([makeTrimNode()]),
  });
  // Same run identity (same clock/params/refs) but the feed bytes changed.
  const changedBytes = new TextEncoder().encode(
    new TextDecoder()
      .decode(eventStreamBytes())
      .split("\n")
      .filter((line) => line.length > 0)
      .slice(0, 2)
      .map((line) => `${line}\n`)
      .join(""),
  );
  const second = await service.runPipeline({
    ...baseRunInput,
    inputs: [{ ...baseRunInput.inputs[0]!, bytes: changedBytes }],
    manifest: makeManifest([makeTrimNode()]),
  });
  assert.equal(second.runManifestId, first.runManifestId, "same pinned facts, same run identity");
  const lineage = await artifacts.lineage(`art:transform:${first.runManifestId}:node:trim`);
  assert.equal(lineage.length, 2, "the changed content produced a second revision on the same artifact");
  assert.equal(lineage[1]?.parentRevisionId, lineage[0]?.revisionId, "revision 2 chains onto revision 1");
  assert.ok(await artifacts.readRevision(lineage[0]?.revisionId ?? "") !== null, "revision 1 still readable");
});

test("P9-02 (model lane): a model node runs behind the provider-neutral port, labeled fixture", async () => {
  const { service } = await makeRunService();
  const edges = [
    { from: { nodeId: "node:trim", port: "events" }, to: { nodeId: "node:model", port: "events" } },
  ];
  const model = makeModelNode({
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" }],
  });
  const run = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([makeTrimNode(), model], edges),
    parameters: { "node:trim": { startMs: 0, endMs: 6000 }, "node:model": {} },
  });
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0]?.status, "succeeded");
  assert.equal(run.steps[1]?.status, "succeeded");
  assert.equal(run.steps[1]?.cost, null, "fixture lane: no fabricated cost");
  assert.equal(run.outputs.length, 2, "trim output + model summary revisions");
  assert.equal(run.semanticFidelity.grade, "fixture", "the model lane downgrades the run to fixture evidence");
  assert.match(run.semanticFidelity.note, /fixture model lane/);
});

test("P9-05: a model refusal with declared-fallback records fallback-used; identity pass-through is explicit", async () => {
  const { service } = await makeRunService();
  const model = makeModelNode({
    errorBehavior: { mode: "declared-fallback", contract: "refusals fall back to identity pass-through" },
  });
  const run = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([model]),
    parameters: { "node:model": { forceRefusal: "quota-exhausted" } },
  });
  assert.equal(run.steps[0]?.status, "fallback-used");
  assert.match(run.steps[0]?.detail ?? "", /quota-exhausted/);
  assert.match(run.steps[0]?.detail ?? "", /identity pass-through|refusals fall back/);
  assert.equal(run.outputs.length, 1, "the fallback output is committed and visible");
  assert.match(run.outputs[0]?.semanticEvidence ?? "", /fallback lane/);
});

test("P9-05: a model refusal without a fallback lane is a typed failure that stops the run", async () => {
  const { service } = await makeRunService();
  const model = makeModelNode({
    errorBehavior: { mode: "fail-closed", contract: "refusals fail closed" },
  });
  const run = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([model]),
    parameters: { "node:model": { forceRefusal: "credentials-missing" } },
  });
  assert.equal(run.steps[0]?.status, "typed-failure");
  assert.match(run.steps[0]?.detail ?? "", /credentials-missing/);
  assert.equal(run.outputs.length, 0, "no output committed for a failed node");
});

test("P9-05: partial outputs stay observable when a later step fails (budget overflow mid-run)", async () => {
  const { service, artifacts } = await makeRunService();
  const second = makeTrimNode({
    nodeId: "node:tiny",
    resources: { timeoutMs: 15_000, maxOutputBytes: 5, cpuClass: "light", memoryMiB: 256 },
  });
  const edges = [
    { from: { nodeId: "node:trim", port: "events" }, to: { nodeId: "node:tiny", port: "events" } },
  ];
  const run = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([makeTrimNode(), second], edges),
    parameters: {
      "node:trim": { startMs: 0, endMs: 6000 },
      "node:tiny": { startMs: 0, endMs: 6000 },
    },
  });
  assert.equal(run.steps[0]?.status, "succeeded");
  assert.equal(run.steps[1]?.status, "typed-failure");
  assert.match(run.steps[1]?.detail ?? "", /output budget overflow/);
  assert.equal(run.outputs.length, 1, "the FIRST step's output stays committed and readable");
  const revision = await artifacts.readRevision(run.outputs[0]?.artifactRevisionId ?? "");
  assert.ok(revision !== null);
});

test("P9-05: cancellation before the run records cancelled steps and commits nothing", async () => {
  const { service } = await makeRunService();
  const controller = new AbortController();
  controller.abort();
  const run = await service.runPipeline({
    ...baseRunInput,
    manifest: makeManifest([makeTrimNode()]),
    signal: controller.signal,
  });
  assert.equal(run.steps[0]?.status, "cancelled");
  assert.match(run.steps[0]?.detail ?? "", /aborted before this step/);
  assert.equal(run.outputs.length, 0);
  assert.equal(run.semanticFidelity.grade, "declared");
});

test("fail-closed at run time: a missing required parameter refuses to execute anything", async () => {
  const { service } = await makeRunService();
  await assert.rejects(
    service.runPipeline({
      ...baseRunInput,
      parameters: { "node:trim": { endMs: 2000 } },
      manifest: makeManifest([makeTrimNode()]),
    }),
    (error: unknown) => {
      assert.ok(error instanceof TransformGraphValidationError);
      assert.equal(error.validation.violations[0]?.kind, "missing-parameter");
      return true;
    },
  );
});

test("config-hash determinism: identical config re-derives the same hash and run identity; different config does not", async () => {
  const { service } = await makeRunService();
  const manifest = makeManifest([makeTrimNode()]);
  const first = await service.runPipeline({ ...baseRunInput, manifest });
  const retry = await service.runPipeline({ ...baseRunInput, manifest });
  assert.equal(retry.runManifestId, first.runManifestId, "retries are idempotent per pinned facts");
  assert.equal(retry.configHash, first.configHash);
  assert.deepEqual(retry.outputs.map((output) => output.artifactRevisionId), first.outputs.map((output) => output.artifactRevisionId), "same content, same revision ids");
});

test("P9-06 (WorkGraph): committed revisions reconcile onto the WorkGraph artifact node through the existing port", async () => {
  const workGraphService = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now: () => FIXED_TIME });
  const graph = await workGraphService.openIntent({
    intent: {
      goal: "run the trim pipeline over the recorded feed",
      constraints: [],
      artifactRequirements: ["trimmed event stream"],
      learningPolicy: { scopes: [], requireConsent: true },
      policy: {
        rights: { holders: ["holder:test"], usages: ["render"], prohibitions: [] },
        privacy: { visibility: "tenant", exportableFields: [] },
        retention: { disposition: "retain" },
      },
    },
  });
  const artifactNode = await workGraphService.appendNode({
    workGraphId: graph.workGraphId,
    kind: "artifact",
    actor: { actorKind: "agent-run", actorRef: "body:test" },
  });

  const { service } = await makeRunService({ workGraphRefs: workGraphService, workGraphArtifactNode: artifactNode.nodeId });
  const run = await service.runPipeline({
    ...baseRunInput,
    workGraph: { workGraphId: graph.workGraphId, runRef: "run:test-1" },
    manifest: makeManifest([makeTrimNode()]),
  });

  const updated = await workGraphService.readWorkGraph(graph.workGraphId);
  const node = updated?.nodes.find((candidate) => candidate.nodeId === artifactNode.nodeId);
  const revisionRefs = (node?.refs ?? []).filter((ref) => ref.kind === "artifact-revision");
  assert.equal(revisionRefs.length, 1, "the run's revision is appended to the WorkGraph artifact node");
  assert.equal(revisionRefs[0]?.refId, run.outputs[0]?.artifactRevisionId);
  assert.equal(run.workGraph.workGraphId, graph.workGraphId, "the run manifest pins the WorkGraph refs");
});
