/**
 * W12-01/04 — the TL Wave 0 freeze test: the additive run-ledger
 * enumeration read (`TransformRunService.listRuns()`).
 *
 * EVIDENCE CLASS: MIXED (same as the run-service suite it freezes
 * against) — the deterministic lane is REAL (a real child process per
 * step); the ledger itself is the fixture-grade in-memory store (the
 * W9A honesty label, carried verbatim). The enumeration asserts REAL
 * record contents over that ledger.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TransformRunService } from "../src/contract.js";
import {
  eventStreamBytes,
  feedProvenance,
  hash,
  makeExecutor,
  makeManifest,
  makeStore,
  makeTrimNode,
} from "./helpers.js";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "@sporta/artifacts/contract";
import { FixedClock, FixtureTransformModelAdapter, Sha256TransformHash } from "../src/contract.js";

const FIXED_TIME = "2026-10-13T12:00:00.000Z";

function makeRunService() {
  const store = makeStore();
  const service = new TransformRunService({
    clock: new FixedClock(FIXED_TIME),
    hash: new Sha256TransformHash(),
    artifacts: new ArtifactGraphService({ now: () => FIXED_TIME }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: makeExecutor(store),
    components: store,
  });
  return { service, store };
}

const runInput = (runRef: string, salt: string) => ({
  workGraph: { workGraphId: "wg:w12-freeze", runRef },
  parameters: { "node:trim": { startMs: 0, endMs: 200 } },
  inputs: [{
    artifactRef: `art:w12-feed-${salt}`,
    rightsSnapshot: "rights:w12-operator",
    bytes: eventStreamBytes(),
    provenance: feedProvenance,
  }],
  releaseDigest: `sha256:${salt.padEnd(64, "0")}`,
});

test("W12-01 listRuns: empty ledger enumerates empty (no fabricated runs)", () => {
  const { service } = makeRunService();
  assert.deepEqual(service.listRuns(), []);
});

test("W12-01 listRuns: the ledger enumerates in insertion order, manifests verbatim", async () => {
  const { service } = makeRunService();
  const first = await service.runPipeline({
    manifest: makeManifest([makeTrimNode()]),
    ...runInput("run:w12-1", "1"),
  });
  const second = await service.runPipeline({
    manifest: makeManifest([makeTrimNode()]),
    ...runInput("run:w12-2", "2"),
  });

  const runs = service.listRuns();
  assert.equal(runs.length, 2, "exactly the two REAL runs");
  assert.equal(runs[0]?.runManifestId, first.runManifestId, "insertion order: first first");
  assert.equal(runs[1]?.runManifestId, second.runManifestId, "insertion order: second second");
  // Verbatim records: the enumerated manifests ARE the read-back manifests.
  assert.deepEqual(runs[0], first);
  assert.deepEqual(runs[1], second);
  // REAL deterministic step evidence carries through the enumeration read.
  assert.equal(runs[0]?.steps[0]?.status, "succeeded");
  assert.ok((runs[0]?.steps[0]?.timingMs ?? 0) > 0, "real child-process timing measured");
});

test("W12-01 listRuns: readRun and listRuns agree (one ledger, no second authority)", async () => {
  const { service } = makeRunService();
  const manifest = await service.runPipeline({
    manifest: makeManifest([makeTrimNode()]),
    ...runInput("run:w12-3", "3"),
  });
  const viaPoint = service.readRun(manifest.runManifestId);
  assert.ok(viaPoint !== null);
  const viaList = service.listRuns().find(
    (candidate) => candidate.runManifestId === manifest.runManifestId,
  );
  assert.ok(viaList !== undefined, "the point read is enumerable");
  assert.deepEqual(viaList, viaPoint, "same record through both reads");
});
