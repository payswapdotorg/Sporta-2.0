/**
 * Wave 5 (w5a) — W5A-2: the end-to-end composition (acquisition
 * manifest -> stages -> normalized + reconstructed observations -> the
 * EXISTING ingestObservations boundary -> SportsWorldModelRecord).
 *
 * EVIDENCE CLASS: fixture. The football plan below is fixture-grade
 * synthetic data (one synthetic broadcast feed: one camera, one
 * player, one ball, one zone), honestly labeled. The pure pipeline
 * functions and the real WorldModelService seam run for REAL — the
 * snapshot hashes, uncertainty values and event records asserted below
 * are the real deterministic outputs of this exact run. NO real media,
 * no perception provider, NO ML model (see SPEC).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AcquisitionProvenanceError,
  CalibrationError,
  FixedClock,
  PipelineCompositionError,
  TrackingError,
  WorldModelService,
  WorldPolicyConflictError,
  computeSnapshotHash,
  planPipelineObservations,
  runPipeline,
  sha256WorldHash,
} from "../src/contract.js";
import type {
  AcquisitionManifest,
  BallStateRule,
  EntityStateRule,
  PipelinePlan,
  PolicySet,
  RawObservation,
} from "../src/contract.js";

const T0 = "2026-04-01T00:00:00.000Z";
const capturedAt = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

const policy: PolicySet = {
  rights: { holders: ["holder:broadcaster"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

function footballManifest(overrides: Partial<AcquisitionManifest> = {}): AcquisitionManifest {
  return {
    manifestId: "acq:w5a-football",
    domain: "football",
    provenanceSeed: {
      sourceKind: "authorized-source",
      sourceRef: "broadcaster:efl",
      capturedAt: T0,
      confidence: 0.95,
    },
    mediaRefs: [{ mediaId: "camera:main", kind: "video", capturedAt: T0 }],
    policy,
    ...overrides,
  };
}

function playerRaw(seconds: number, x: number, y: number): RawObservation {
  return {
    rawId: `raw:p1-${seconds}`,
    mediaRef: "camera:main",
    capturedAt: capturedAt(seconds),
    confidence: 0.9,
    payload: { playerId: "entity:p1", x, y },
    entityRefs: ["entity:p1"],
  };
}

function ballRaw(seconds: number, possession?: string): RawObservation {
  const payload: Record<string, unknown> = { ballId: "entity:ball", x: 3, y: 3 };
  if (possession !== undefined) payload.possession = possession;
  return {
    rawId: `raw:ball-${seconds}`,
    mediaRef: "camera:main",
    capturedAt: capturedAt(seconds),
    confidence: 0.85,
    payload,
    entityRefs: ["entity:ball"],
  };
}

const playerRule: EntityStateRule = {
  kind: "entity-state",
  ruleId: "rule:player",
  entityIdField: "playerId",
  xField: "x",
  yField: "y",
};

const ballRule: BallStateRule = {
  kind: "ball-state",
  ruleId: "rule:ball",
  entityIdField: "ballId",
  xField: "x",
  yField: "y",
  possessionField: "possession",
  confidenceFactor: 0.8,
};

function footballPlan(overrides: Partial<PipelinePlan> = {}): PipelinePlan {
  return {
    manifest: footballManifest(),
    raws: [
      playerRaw(0, 5, 5), // calibrated (11,11) — outside the zone
      playerRaw(1, 10, 10), // calibrated (21,21) — INSIDE: zone entry
      playerRaw(10, 10, 10), // 9s gap after t1
      ballRaw(0, "entity:p1"),
      ballRaw(1, "entity:p2"), // possession change
      ballRaw(2), // possession change to absent
    ],
    perceptionRules: [playerRule, ballRule],
    tracking: { maxGapMs: 2000, gapConfidenceCeiling: 0.7 },
    calibration: {
      timing: { offsetsMs: { "camera:main": 100 }, confidenceCeiling: 0.99 },
      camera: {
        transforms: {
          "camera:main": { x: { scale: 2, translation: 1 }, y: { scale: 2, translation: 1 } },
        },
        confidenceCeiling: 0.98,
      },
    },
    eventRules: [
      {
        kind: "zone-entry",
        ruleId: "rule:zone-box",
        zoneId: "zone:box",
        bounds: { minX: 20, maxX: 30, minY: 20, maxY: 30 },
        watchedEntities: ["entity:p1"],
      },
      { kind: "possession-change", ruleId: "rule:possession", ballEntityId: "entity:ball" },
    ],
    ...overrides,
  };
}

function fixtureWorld(): WorldModelService {
  return new WorldModelService(new FixedClock("2026-05-01T00:00:00.000Z"), sha256WorldHash);
}

const seams = { hash: sha256WorldHash };

test("planPipelineObservations evaluates the whole chain purely (every stage's records)", () => {
  const result = planPipelineObservations(footballPlan(), seams);
  assert.equal(result.acquisition.length, 1);
  assert.equal(result.normalized.length, 6);
  assert.equal(result.facts.length, 6);
  assert.equal(result.tracks.length, 2);
  assert.equal(result.calibratedTracks.length, 2);
  assert.equal(result.events.length, 3); // 1 zone-entry + 2 possession changes
  assert.equal(result.plannedObservations.length, 9); // 6 normalized + 3 event observations
  // the planned observations ARE the seam's vocabulary, provenance-carried
  for (const observation of result.plannedObservations) {
    assert.equal(observation.domain, "football");
    assert.equal(observation.provenance.sourceRef, "broadcaster:efl");
    assert.deepEqual(observation.policy, policy);
  }
  // one observation per event, deterministically identified
  const eventObservations = result.plannedObservations.filter(
    (observation) => (observation.eventRefs ?? []).length > 0,
  );
  assert.equal(eventObservations.length, 3);
  for (const observation of eventObservations) {
    const eventId = observation.eventRefs?.[0];
    assert.ok(eventId !== undefined);
    assert.equal(observation.observationId, `obs:${eventId}`);
    assert.ok(observation.entityRefs !== undefined && observation.entityRefs.length === 1);
    assert.match(observation.payloadHash, /^[0-9a-f]{64}$/);
  }
  // deterministic: re-planning the same plan yields the identical result
  assert.deepEqual(planPipelineObservations(footballPlan(), seams), result);
});

test("runPipeline lands an evidence-backed SWM snapshot end-to-end (W5A-2)", async () => {
  const world = fixtureWorld();
  const snapshot = await runPipeline(world, footballPlan(), seams);
  assert.equal(snapshot.swmId, "swm:football");
  assert.equal(snapshot.domain, "football");
  assert.deepEqual(snapshot.entities, ["entity:ball", "entity:p1"]);
  assert.equal(snapshot.events.length, 3);
  assert.deepEqual(snapshot.events, [...snapshot.events].sort());
  // uncertainty: 6 normalized + 3 event observations, exact carried confidences
  // (players 0.9, ball observations 0.85, zone event 0.9, possession events 0.8)
  assert.deepEqual(
    [...snapshot.uncertainty].map((entry) => entry.confidence).sort((a, b) => a - b),
    [0.8, 0.8, 0.85, 0.85, 0.85, 0.9, 0.9, 0.9, 0.9],
  );
  // the declared manifest policy becomes the snapshot's established policy
  assert.deepEqual(snapshot.policy, policy);
  // the ledger keeps per-observation provenance: everything cites the authorized source
  const ledger = world.readObservations("swm:football");
  assert.equal(ledger.length, 9);
  assert.ok(ledger.every((entry) => entry.provenance.sourceKind === "authorized-source"));
  assert.ok(ledger.every((entry) => entry.provenance.sourceRef === "broadcaster:efl"));
  // the snapshot hash is the seam's own hash over ALL ledger payload hashes
  assert.equal(
    snapshot.snapshotHash,
    computeSnapshotHash(
      ledger.map((entry) => entry.payloadHash),
      sha256WorldHash,
    ),
  );
  // every reconstructed event's source observations are present in the snapshot
  const subjects = new Set(snapshot.uncertainty.map((entry) => entry.subject));
  const result = planPipelineObservations(footballPlan(), seams);
  for (const event of result.events) {
    for (const observationId of event.sourceObservationIds) {
      assert.ok(subjects.has(observationId), `missing source observation ${observationId}`);
    }
  }
  assert.equal(ledger.filter((entry) => entry.eventRefs.length > 0).length, 3);
});

test("runPipeline is idempotent end-to-end (same snapshot, no duplicates)", async () => {
  const world = fixtureWorld();
  const first = await runPipeline(world, footballPlan(), seams);
  const retry = await runPipeline(world, footballPlan(), seams);
  assert.deepEqual(retry, first);
  assert.equal(world.readObservations("swm:football").length, 9);
});

test("a failure at ANY stage produces ZERO ingestion side effects (all-or-nothing)", async () => {
  // EARLY stage: unauthorized source kind
  const unauthorizedWorld = fixtureWorld();
  await assert.rejects(
    () =>
      runPipeline(
        unauthorizedWorld,
        footballPlan({
          manifest: footballManifest({
            provenanceSeed: { sourceKind: "arena-session", sourceRef: "arena:1", capturedAt: T0 },
          }),
        }),
        seams,
      ),
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  assert.equal(await unauthorizedWorld.readSnapshot("swm:football"), null);
  assert.equal(unauthorizedWorld.readObservations("swm:football").length, 0);
  // LATE stage: calibration cannot affirm the cited media
  const lateWorld = fixtureWorld();
  await assert.rejects(
    () =>
      runPipeline(lateWorld, footballPlan({ calibration: { timing: { offsetsMs: {} } } }), seams),
    (error: unknown) => error instanceof CalibrationError,
  );
  assert.equal(await lateWorld.readSnapshot("swm:football"), null);
  assert.equal(lateWorld.readObservations("swm:football").length, 0);
});

test("the composition refuses empty raws / missing plans (mirroring the seam's empty-batch law)", () => {
  assert.throws(
    () => planPipelineObservations(footballPlan({ raws: [] }), seams),
    (error: unknown) => error instanceof PipelineCompositionError,
  );
  const noManifest = JSON.parse(JSON.stringify({ ...footballPlan(), manifest: undefined }));
  assert.throws(
    () => planPipelineObservations(noManifest, seams),
    (error: unknown) => error instanceof PipelineCompositionError,
  );
  const nullPlan = JSON.parse("null");
  assert.throws(
    () => planPipelineObservations(nullPlan, seams),
    (error: unknown) => error instanceof PipelineCompositionError,
  );
});

test("absent optional stages contribute nothing (tracking params still validated)", async () => {
  const world = fixtureWorld();
  const minimal: PipelinePlan = {
    manifest: footballManifest(),
    raws: [playerRaw(0, 5, 5)],
    tracking: { maxGapMs: 2000 },
  };
  const snapshot = await runPipeline(world, minimal, seams);
  assert.equal(snapshot.swmId, "swm:football");
  assert.deepEqual(snapshot.entities, ["entity:p1"]);
  assert.deepEqual(snapshot.events, []);
  assert.equal(world.readObservations("swm:football").length, 1);
  // the continuity budget is validated even when perception is absent
  assert.throws(
    () => planPipelineObservations({ ...minimal, tracking: { maxGapMs: 0 } }, seams),
    (error: unknown) => error instanceof TrackingError,
  );
});

test("a later pipeline run with a weaker policy is refused at the seam (rights never weaken silently)", async () => {
  const world = fixtureWorld();
  await runPipeline(world, footballPlan(), seams);
  const weaker: PolicySet = {
    rights: { holders: ["holder:broadcaster"], usages: ["render", "derive"], prohibitions: [] },
    privacy: { visibility: "public", exportableFields: [] },
    retention: { disposition: "retain" },
  };
  await assert.rejects(
    () =>
      runPipeline(world, footballPlan({ manifest: footballManifest({ policy: weaker }) }), seams),
    (error: unknown) => error instanceof WorldPolicyConflictError,
  );
  const snapshot = await world.readSnapshot("swm:football");
  assert.deepEqual(snapshot?.policy, policy);
});

test("confidence is never raised through the whole chain (carry or lower at every stage)", async () => {
  const world = fixtureWorld();
  const plan = footballPlan();
  const snapshot = await runPipeline(world, plan, seams);
  const bySubject = new Map(snapshot.uncertainty.map((entry) => [entry.subject, entry.confidence]));
  const result = planPipelineObservations(plan, seams);
  // every planned observation's carried confidence is <= the raw confidence it derives from
  const rawConfidence = new Map<string, number>();
  for (const raw of plan.raws) {
    const entry = result.normalized.find(
      (candidate) =>
        candidate.observation.capturedAt === raw.capturedAt && candidate.rawPayload === raw.payload,
    );
    assert.ok(entry !== undefined);
    rawConfidence.set(entry.observationId, raw.confidence);
  }
  for (const observation of result.plannedObservations) {
    const observationId = observation.observationId ?? "";
    const carried = bySubject.get(observationId);
    assert.ok(carried !== undefined, `missing uncertainty for ${observationId}`);
    const origin = rawConfidence.get(observationId);
    if (origin !== undefined)
      assert.ok(carried <= origin); // normalized observation
    else assert.ok(carried <= 0.9); // event observation: min over its source states
  }
});
