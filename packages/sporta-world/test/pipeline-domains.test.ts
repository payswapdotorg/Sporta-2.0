/**
 * W5A-3 — the domain-extension law invariant (ADR wave-5 Decision 4):
 * a SECOND synthetic domain is ADDITIVE DATA behind the SAME stage
 * seams.
 *
 * EVIDENCE CLASS: fixture. The second domain is a NON-SPORT synthetic
 * domain ("warehouse-robotics": site telemetry for robots, a lidar
 * feed and a pallet — honest fixture data, labeled as such). The
 * primary fixture domain of the w5a pipeline tests is football; this
 * file proves that a domain which is neither football nor any sport
 * flows through the SAME composition function (`runPipeline`), the
 * SAME stage functions and the SAME types, with only new DATA (domain
 * tag, field maps, zones, per-media calibration), landing an
 * independent `swm:<domain>` snapshot — no WorkGraph or Organizations
 * redesign exists or is needed anywhere in this lane. The pure
 * functions run for REAL; no real media and NO ML model (see SPEC).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AcquisitionProvenanceError,
  FixedClock,
  WorldModelService,
  acquireSources,
  planPipelineObservations,
  runPipeline,
  sha256WorldHash,
} from "../src/contract.js";
import type {
  AcquisitionManifest,
  PerceptionRule,
  PipelinePlan,
  PolicySet,
  RawObservation,
} from "../src/contract.js";

const T0 = "2026-04-01T00:00:00.000Z";
const capturedAt = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

const footballPolicy: PolicySet = {
  rights: { holders: ["holder:broadcaster"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const footballManifest: AcquisitionManifest = {
  manifestId: "acq:w5a-football",
  domain: "football",
  provenanceSeed: {
    sourceKind: "authorized-source",
    sourceRef: "broadcaster:efl",
    capturedAt: T0,
    confidence: 0.95,
  },
  mediaRefs: [{ mediaId: "camera:main", kind: "video", capturedAt: T0 }],
  policy: footballPolicy,
};

const minimalFootballPlan: PipelinePlan = {
  manifest: footballManifest,
  raws: [
    {
      rawId: "raw:p1-0",
      mediaRef: "camera:main",
      capturedAt: capturedAt(0),
      confidence: 0.9,
      payload: { playerId: "entity:p1", x: 5, y: 5 },
      entityRefs: ["entity:p1"],
    },
  ],
  tracking: { maxGapMs: 2000 },
};

const roboticsPolicy: PolicySet = {
  rights: { holders: ["holder:site-7"], usages: ["render", "analyze"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const roboticsManifest: AcquisitionManifest = {
  manifestId: "acq:warehouse-7",
  domain: "warehouse-robotics",
  provenanceSeed: {
    sourceKind: "observation",
    sourceRef: "site:warehouse-7",
    capturedAt: T0,
    confidence: 0.9,
  },
  mediaRefs: [
    { mediaId: "telemetry:robots", kind: "telemetry", capturedAt: T0 },
    { mediaId: "lidar:zone-a", kind: "lidar", capturedAt: T0 },
  ],
  policy: roboticsPolicy,
};

function robotRaw(seconds: number, px: number, py: number): RawObservation {
  return {
    rawId: `raw:robot-${seconds}`,
    mediaRef: "telemetry:robots",
    capturedAt: capturedAt(seconds),
    confidence: 0.95,
    payload: { robotId: "entity:robot-1", px, py },
    entityRefs: ["entity:robot-1"],
  };
}

function palletRaw(seconds: number, carrier?: string): RawObservation {
  const payload: Record<string, unknown> = { palletId: "entity:pallet-7", x: 2, y: 2 };
  if (carrier !== undefined) payload.carrierRobot = carrier;
  return {
    rawId: `raw:pallet-${seconds}`,
    mediaRef: "lidar:zone-a",
    capturedAt: capturedAt(seconds),
    confidence: 0.8,
    payload,
    entityRefs: ["entity:pallet-7"],
  };
}

/** Same rule TYPES as football, entirely different field vocabulary — data, not code. */
const roboticsPerceptionRules: readonly PerceptionRule[] = [
  {
    kind: "entity-state",
    ruleId: "rule:robot",
    entityIdField: "robotId",
    xField: "px",
    yField: "py",
  },
  {
    kind: "ball-state",
    ruleId: "rule:pallet",
    entityIdField: "palletId",
    xField: "x",
    yField: "y",
    possessionField: "carrierRobot",
  },
];

const roboticsPlan: PipelinePlan = {
  manifest: roboticsManifest,
  raws: [
    robotRaw(0, 1, 1), // outside the storage zone
    robotRaw(1, 6, 6), // INSIDE the storage zone
    palletRaw(0, "entity:robot-1"),
    palletRaw(1, "entity:robot-2"),
  ],
  perceptionRules: roboticsPerceptionRules,
  tracking: { maxGapMs: 5000 },
  calibration: {
    timing: { offsetsMs: { "telemetry:robots": 0, "lidar:zone-a": -50 } },
    camera: {
      transforms: { "telemetry:robots": {}, "lidar:zone-a": { y: { translation: 2 } } },
    },
  },
  eventRules: [
    {
      kind: "zone-entry",
      ruleId: "rule:storage-zone",
      zoneId: "zone:storage-a",
      bounds: { minX: 5, maxX: 9, minY: 5, maxY: 9 },
      watchedEntities: ["entity:robot-1"],
    },
    { kind: "possession-change", ruleId: "rule:pallet-carrier", ballEntityId: "entity:pallet-7" },
  ],
};

function fixtureWorld(): WorldModelService {
  return new WorldModelService(new FixedClock("2026-05-01T00:00:00.000Z"), sha256WorldHash);
}

const seams = { hash: sha256WorldHash };

test("a second synthetic NON-SPORT domain runs end-to-end through the SAME stage seams (additive data, zero redesign)", async () => {
  const world = fixtureWorld();
  const snapshot = await runPipeline(world, roboticsPlan, seams);
  assert.equal(snapshot.swmId, "swm:warehouse-robotics");
  assert.equal(snapshot.domain, "warehouse-robotics");
  assert.deepEqual(snapshot.entities, ["entity:pallet-7", "entity:robot-1"]);
  assert.equal(snapshot.events.length, 2); // storage-zone entry + pallet carrier change
  assert.deepEqual(snapshot.policy, roboticsPolicy);
  // every carried confidence derives from the raws (0.95/0.8 vs the 0.9 source ceiling)
  assert.deepEqual(
    [...snapshot.uncertainty].map((entry) => entry.confidence).sort((a, b) => a - b),
    [0.8, 0.8, 0.8, 0.9, 0.9, 0.9],
  );
  assert.equal(world.readObservations("swm:warehouse-robotics").length, 6);
  // the events carry the per-domain vocabulary and per-media calibration
  const result = planPipelineObservations(roboticsPlan, seams);
  const zone = result.events.find((event) => event.kind === "zone-entry");
  assert.ok(zone !== undefined);
  assert.deepEqual(zone.detail, { zoneId: "zone:storage-a" });
  assert.equal(zone.entityId, "entity:robot-1");
  const possession = result.events.find((event) => event.kind === "possession-change");
  assert.ok(possession !== undefined);
  assert.deepEqual(possession.detail, {
    fromPossession: "entity:robot-1",
    toPossession: "entity:robot-2",
  });
  // per-media timing: the pallet (lidar, -50ms) fires 50ms earlier than its raw timestamp
  assert.equal(possession.capturedAt, new Date(Date.parse(T0) + 1000 - 50).toISOString());
  // per-media camera: the pallet's y is translated +2 by the lidar transform
  const palletTrack = result.calibratedTracks.find((track) => track.entityId === "entity:pallet-7");
  assert.deepEqual(palletTrack?.states[0]?.position, { x: 2, y: 4 });
});

test("the two domains coexist as independent snapshots on the SAME world (no cross-domain mutation)", async () => {
  const world = fixtureWorld();
  const football = await runPipeline(world, minimalFootballPlan, seams);
  const robotics = await runPipeline(world, roboticsPlan, seams);
  assert.equal(football.swmId, "swm:football");
  assert.equal(robotics.swmId, "swm:warehouse-robotics");
  // disjoint entity sets, independent ledgers
  assert.deepEqual(
    football.entities.filter((entity) => robotics.entities.includes(entity)),
    [],
  );
  assert.equal(world.readObservations("swm:football").length, 1);
  assert.equal(world.readObservations("swm:warehouse-robotics").length, 6);
  // the football snapshot is untouched by the robotics run
  const footballNow = await world.readSnapshot("swm:football");
  assert.equal(footballNow?.snapshotHash, football.snapshotHash);
});

test("mixing domains across acquisition manifests is refused at the gate", () => {
  assert.throws(
    () => acquireSources([footballManifest, roboticsManifest]),
    (error: unknown) => {
      assert.ok(error instanceof AcquisitionProvenanceError);
      assert.ok(error.detail.includes("football|warehouse-robotics"));
      return true;
    },
  );
});
