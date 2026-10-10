/**
 * Wave 5 (w5a) perception pipeline — stage 4: tracking.
 *
 * EVIDENCE CLASS: fixture. The football fixtures below are
 * fixture-grade synthetic data (a synthetic broadcast feed: one
 * camera, one player, one ball), honestly labeled. The pure function
 * runs for REAL — the exact timestamps, gap durations and confidences
 * asserted below are its real deterministic outputs. NO real media,
 * NO ML model (see SPEC).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TrackingError,
  acquireSources,
  normalizeObservations,
  perceiveObservations,
  sha256WorldHash,
  trackEntities,
} from "../src/contract.js";
import type {
  AcquisitionManifest,
  BallStateRule,
  EntityStateRule,
  RawObservation,
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

/** The full football fixture chain up through perception. */
function footballFacts() {
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
  return perceiveObservations(normalized, [playerRule, ballRule]);
}

const trackingParams = { maxGapMs: 2000, gapConfidenceCeiling: 0.7 };

test("tracking associates identity by declared keys and records gaps (never interpolates)", () => {
  const tracks = trackEntities(footballFacts(), trackingParams);
  assert.equal(tracks.length, 2); // one player track, one ball track
  assert.deepEqual(
    tracks.map((track) => track.trackId),
    ["track:ball-state:entity:ball", "track:entity-state:entity:p1"],
  );
  const player = tracks.find((track) => track.entityId === "entity:p1");
  assert.ok(player !== undefined);
  assert.equal(player.states.length, 3); // no state invented between observations
  assert.deepEqual(
    player.states.map((state) => state.capturedAt),
    [capturedAt(0), capturedAt(1), capturedAt(10)],
  );
  assert.equal(player.gaps.length, 1); // t1 -> t10 is 9000ms > 2000ms
  assert.deepEqual(player.gaps[0], {
    fromCapturedAt: capturedAt(1),
    toCapturedAt: capturedAt(10),
    gapMs: 9000,
  });
  // confidence: min over states (0.9) narrowed by the gap ceiling (0.7)
  assert.equal(player.confidence, 0.7);
  assert.deepEqual(player.acquisitionIds, ["acq:w5a-football"]);
  const ball = tracks.find((track) => track.entityId === "entity:ball");
  assert.ok(ball !== undefined);
  assert.equal(ball.states.length, 3);
  assert.equal(ball.gaps.length, 0); // 1s spacing is within budget
  assert.equal(ball.confidence, 0.8); // no gaps -> no gap ceiling applied
  // every state cites its source fact + observation
  for (const state of ball.states) {
    assert.ok(state.factId.startsWith("fact|"));
    assert.match(state.observationId, /^obs:[0-9a-f]{64}$/);
  }
});

test("tracking breaks timestamp ties by factId (deterministic order)", () => {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const normalized = normalizeObservations(
    acquisition,
    [
      {
        rawId: "raw:dual",
        mediaRef: "camera:main",
        capturedAt: capturedAt(0),
        confidence: 0.9,
        payload: { playerId: "entity:p1", x: 1, y: 2, robotId: "entity:p1", px: 9, py: 9 },
      },
    ],
    { hash: sha256WorldHash },
  );
  const aliasRule: EntityStateRule = {
    kind: "entity-state",
    ruleId: "rule:alias",
    entityIdField: "robotId",
    xField: "px",
    yField: "py",
  };
  const facts = perceiveObservations(normalized, [playerRule, aliasRule]);
  assert.equal(facts.length, 2);
  const [track] = trackEntities(facts, { maxGapMs: 2000 });
  assert.ok(track !== undefined);
  assert.deepEqual(
    track.states.map((state) => state.factId),
    facts.map((fact) => fact.factId).sort(),
  );
});

test("tracking validates its declared params (fail-closed, even with no facts)", () => {
  for (const maxGapMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => trackEntities([], { maxGapMs }),
      (error: unknown) => error instanceof TrackingError,
    );
  }
  assert.throws(
    () => trackEntities([], { maxGapMs: 1000, gapConfidenceCeiling: 1.5 }),
    (error: unknown) => error instanceof TrackingError,
  );
  // a valid empty run is total
  assert.deepEqual(trackEntities([], { maxGapMs: 1000 }), []);
});
