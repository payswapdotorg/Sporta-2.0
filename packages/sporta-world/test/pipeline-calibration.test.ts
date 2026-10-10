/**
 * Wave 5 (w5a) perception pipeline — stage 5: calibration.
 *
 * EVIDENCE CLASS: fixture. The football fixtures and calibration
 * parameters below are fixture-grade synthetic data, honestly
 * labeled. The pure function runs for REAL — the exact corrected
 * timestamps, positions and confidences asserted below are its real
 * deterministic outputs of the declared transforms. NO real camera
 * model, NO ML model (see SPEC).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CalibrationError,
  acquireSources,
  calibrateTracks,
  normalizeObservations,
  perceiveObservations,
  sha256WorldHash,
  trackEntities,
} from "../src/contract.js";
import type {
  AcquisitionManifest,
  BallStateRule,
  CameraCalibration,
  EntityStateRule,
  RawObservation,
  TimingCalibration,
} from "../src/contract.js";

const T0 = "2026-04-01T00:00:00.000Z";
const capturedAt = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

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
  policy: {
    rights: { holders: ["holder:broadcaster"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

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

/** The full football fixture chain up through tracking. */
function footballTracks() {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const normalized = normalizeObservations(
    acquisition,
    [
      playerRaw(0, 5, 5),
      playerRaw(1, 10, 10),
      playerRaw(10, 10, 10),
      ballRaw(0, "entity:p1"),
      ballRaw(1, "entity:p2"),
      ballRaw(2),
    ],
    { hash: sha256WorldHash },
  );
  const facts = perceiveObservations(normalized, [playerRule, ballRule]);
  return trackEntities(facts, { maxGapMs: 2000, gapConfidenceCeiling: 0.7 });
}

const timing: TimingCalibration = { offsetsMs: { "camera:main": 100 }, confidenceCeiling: 0.99 };
const camera: CameraCalibration = {
  transforms: {
    "camera:main": { x: { scale: 2, translation: 1 }, y: { scale: 2, translation: 1 } },
  },
  confidenceCeiling: 0.98,
};

test("calibration applies declared timing/camera corrections exactly (typed in, typed out)", () => {
  const tracks = footballTracks();
  const calibrated = calibrateTracks(tracks, { timing, camera });
  assert.equal(calibrated.length, 2);
  const player = calibrated.find((track) => track.entityId === "entity:p1");
  assert.ok(player !== undefined);
  // corrected timestamps: +100ms per the declared offset, re-serialized ISO-8601
  assert.deepEqual(
    player.states.map((state) => state.capturedAt),
    [capturedAt(0.1), capturedAt(1.1), capturedAt(10.1)],
  );
  // corrected positions: (5,5) -> (11,11); (10,10) -> (21,21)
  assert.deepEqual(
    player.states.map((state) => state.position),
    [
      { x: 11, y: 11 },
      { x: 21, y: 21 },
      { x: 21, y: 21 },
    ],
  );
  // confidences narrowed by the active ceilings (0.9 stays 0.9 — never raised)
  assert.ok(player.states.every((state) => state.confidence === 0.9));
  assert.equal(player.confidence, 0.7); // the tracking gap ceiling carries
  // the detected gap carries with its bounding states' corrected endpoints
  assert.deepEqual(player.gaps[0], {
    fromCapturedAt: capturedAt(1.1),
    toCapturedAt: capturedAt(10.1),
    gapMs: 9000, // same media on both endpoints -> duration unchanged
  });
  const ball = calibrated.find((track) => track.entityId === "entity:ball");
  assert.ok(ball !== undefined);
  assert.ok(ball.states.every((state) => state.confidence === 0.8));
  assert.deepEqual(ball.states[0]?.position, { x: 7, y: 7 }); // (3,3) -> (7,7)
  // deterministic: a re-run produces the identical batch
  assert.deepEqual(calibrateTracks(tracks, { timing, camera }), calibrated);
});

test("calibration corrects z only when a z transform is declared; carried otherwise", () => {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const normalized = normalizeObservations(
    acquisition,
    [
      {
        rawId: "raw:z",
        mediaRef: "camera:main",
        capturedAt: capturedAt(0),
        confidence: 0.9,
        payload: { playerId: "entity:p1", x: 1, y: 2, z: 3 },
      },
    ],
    { hash: sha256WorldHash },
  );
  const zRule: EntityStateRule = { ...playerRule, ruleId: "rule:z", zField: "z" };
  const tracks = trackEntities(perceiveObservations(normalized, [zRule]), { maxGapMs: 2000 });
  // z transform declared: z corrected, x/y carried
  const withZ = calibrateTracks(tracks, {
    camera: { transforms: { "camera:main": { z: { scale: 2, translation: 1 } } } },
  });
  assert.deepEqual(withZ[0]?.states[0]?.position, { x: 1, y: 2, z: 7 });
  // no z transform declared: z carried
  const withoutZ = calibrateTracks(tracks, {
    camera: { transforms: { "camera:main": { x: { scale: 2 } } } },
  });
  assert.deepEqual(withoutZ[0]?.states[0]?.position, { x: 2, y: 2, z: 3 });
});

test("absent calibration params carry every dimension unchanged", () => {
  const tracks = footballTracks();
  const carried = calibrateTracks(tracks, {});
  const player = carried.find((track) => track.entityId === "entity:p1");
  const source = tracks.find((track) => track.entityId === "entity:p1");
  assert.ok(player !== undefined && source !== undefined);
  assert.deepEqual(
    player.states.map((state) => state.capturedAt),
    source.states.map((state) => state.capturedAt),
  );
  assert.deepEqual(
    player.states.map((state) => state.position),
    source.states.map((state) => state.position),
  );
  assert.equal(player.confidence, source.confidence);
  assert.deepEqual(player.gaps, source.gaps);
});

test("calibration refuses what it cannot affirm (undeclared media, malformed params)", () => {
  const tracks = footballTracks();
  // timing active but the cited media has no declared offset
  assert.throws(
    () => calibrateTracks(tracks, { timing: { offsetsMs: {} } }),
    (error: unknown) => {
      assert.ok(error instanceof CalibrationError);
      assert.ok(error.detail.includes("camera:main"));
      return true;
    },
  );
  // camera active but the cited media has no declared transform
  assert.throws(
    () => calibrateTracks(tracks, { camera: { transforms: {} } }),
    (error: unknown) => error instanceof CalibrationError,
  );
  // zero scale
  assert.throws(
    () =>
      calibrateTracks(tracks, { camera: { transforms: { "camera:main": { x: { scale: 0 } } } } }),
    (error: unknown) => error instanceof CalibrationError,
  );
  // non-finite offset
  assert.throws(
    () => calibrateTracks(tracks, { timing: { offsetsMs: { "camera:main": Number.NaN } } }),
    (error: unknown) => error instanceof CalibrationError,
  );
  // out-of-range confidence ceiling
  assert.throws(
    () =>
      calibrateTracks(tracks, {
        timing: { offsetsMs: { "camera:main": 0 }, confidenceCeiling: 1.5 },
      }),
    (error: unknown) => error instanceof CalibrationError,
  );
  // a declared IDENTITY media transform is legal (all axes carried)
  assert.equal(
    calibrateTracks(tracks, { camera: { transforms: { "camera:main": {} } } }).length,
    2,
  );
  // with no tracks nothing is cited: an empty offsets object is well-formed and total
  assert.deepEqual(calibrateTracks([], { timing: { offsetsMs: {} } }), []);
  // malformed PARAMETER VALUES are refused even with no tracks
  assert.throws(
    () => calibrateTracks([], { timing: { offsetsMs: { "camera:main": Number.NaN } } }),
    (error: unknown) => error instanceof CalibrationError,
  );
  assert.deepEqual(calibrateTracks([], {}), []);
});
