/**
 * Wave 5 (w5a) perception pipeline — stage 6: event reconstruction.
 *
 * EVIDENCE CLASS: fixture. The football fixtures and event rules
 * below are fixture-grade synthetic data, honestly labeled. The pure
 * function runs for REAL — the exact event records, timestamps and
 * confidences asserted below are its real deterministic outputs on
 * the calibrated fixture tracks. NO real media, NO ML model (see
 * SPEC).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EventReconstructionError,
  acquireSources,
  calibrateTracks,
  normalizeObservations,
  perceiveObservations,
  reconstructEvents,
  sha256WorldHash,
  trackEntities,
} from "../src/contract.js";
import type {
  AcquisitionManifest,
  BallStateRule,
  CameraCalibration,
  EntityStateRule,
  PossessionChangeRule,
  RawObservation,
  TimingCalibration,
  ZoneEntryRule,
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

const timing: TimingCalibration = { offsetsMs: { "camera:main": 100 }, confidenceCeiling: 0.99 };
const camera: CameraCalibration = {
  transforms: {
    "camera:main": { x: { scale: 2, translation: 1 }, y: { scale: 2, translation: 1 } },
  },
  confidenceCeiling: 0.98,
};

/** The full football fixture chain up through calibration. */
function calibratedFootball() {
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
  return calibrateTracks(trackEntities(facts, { maxGapMs: 2000, gapConfidenceCeiling: 0.7 }), {
    timing,
    camera,
  });
}

const zoneRule: ZoneEntryRule = {
  kind: "zone-entry",
  ruleId: "rule:zone-box",
  zoneId: "zone:box",
  bounds: { minX: 20, maxX: 30, minY: 20, maxY: 30 },
  watchedEntities: ["entity:p1"],
};

const possessionRule: PossessionChangeRule = {
  kind: "possession-change",
  ruleId: "rule:possession",
  ballEntityId: "entity:ball",
};

test("zone-entry fires only on observed outside->inside crossings", () => {
  const events = reconstructEvents(calibratedFootball(), [zoneRule], "football");
  assert.equal(events.length, 1); // (11,11) -> (21,21); the later inside->inside pair is not a crossing
  const event = events[0];
  assert.ok(event !== undefined);
  assert.equal(event.kind, "zone-entry");
  assert.equal(event.ruleId, "rule:zone-box");
  assert.equal(event.domain, "football");
  assert.equal(event.entityId, "entity:p1");
  assert.equal(event.capturedAt, capturedAt(1.1)); // the triggering state's calibrated timestamp
  assert.equal(event.confidence, 0.9); // min over the two source states
  assert.deepEqual(event.detail, { zoneId: "zone:box" });
  // per-event provenance refs to the two source observations and facts
  assert.equal(event.sourceObservationIds.length, 2);
  assert.equal(event.sourceFactIds.length, 2);
  assert.deepEqual(event.acquisitionIds, ["acq:w5a-football"]);
  assert.match(event.eventId, /^event:zone-entry\|/);
});

test("a first state already inside a zone emits nothing (the entry was not observed)", () => {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const normalized = normalizeObservations(
    acquisition,
    [playerRaw(0, 10, 10), playerRaw(1, 12, 12)], // both inside after calibration
    { hash: sha256WorldHash },
  );
  const tracks = calibrateTracks(
    trackEntities(perceiveObservations(normalized, [playerRule]), { maxGapMs: 2000 }),
    { camera },
  );
  assert.deepEqual(reconstructEvents(tracks, [zoneRule], "football"), []);
  // an inside -> outside EXIT is not a zone-entry either
  const exiting = normalizeObservations(acquisition, [playerRaw(0, 10, 10), playerRaw(1, 5, 5)], {
    hash: sha256WorldHash,
  });
  const exitTracks = calibrateTracks(
    trackEntities(perceiveObservations(exiting, [playerRule]), { maxGapMs: 2000 }),
    { camera },
  );
  assert.deepEqual(reconstructEvents(exitTracks, [zoneRule], "football"), []);
  // unwatched entities never fire
  const unwatched: ZoneEntryRule = { ...zoneRule, watchedEntities: ["entity:other"] };
  assert.deepEqual(reconstructEvents(calibratedFootball(), [unwatched], "football"), []);
});

test("possession changes fire between consecutive differing possessions (absence carried honestly)", () => {
  const events = reconstructEvents(calibratedFootball(), [possessionRule], "football");
  // entity:p1 -> entity:p2, then entity:p2 -> (absent)
  assert.equal(events.length, 2);
  const [first, second] = events;
  assert.ok(first !== undefined && second !== undefined);
  assert.deepEqual(first.detail, { fromPossession: "entity:p1", toPossession: "entity:p2" });
  assert.deepEqual(second.detail, { fromPossession: "entity:p2" }); // to absent: no key
  assert.equal(first.confidence, 0.8);
  assert.ok(
    events.every((event) => event.kind === "possession-change" && event.entityId === "entity:ball"),
  );
  // equal possessions and both-absent possessions emit nothing
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const equalPossessions = calibrateTracks(
    trackEntities(
      perceiveObservations(
        normalizeObservations(acquisition, [ballRaw(0, "entity:p1"), ballRaw(1, "entity:p1")], {
          hash: sha256WorldHash,
        }),
        [ballRule],
      ),
      { maxGapMs: 2000 },
    ),
    {},
  );
  assert.deepEqual(reconstructEvents(equalPossessions, [possessionRule], "football"), []);
  const absentPossessions = calibrateTracks(
    trackEntities(
      perceiveObservations(
        normalizeObservations(acquisition, [ballRaw(0), ballRaw(1)], { hash: sha256WorldHash }),
        [ballRule],
      ),
      { maxGapMs: 2000 },
    ),
    {},
  );
  assert.deepEqual(reconstructEvents(absentPossessions, [possessionRule], "football"), []);
  // possession rules read only ball-state tracks: an entity-state track for the
  // declared ball entity is honestly nothing
  const notABall = trackEntities(
    perceiveObservations(
      normalizeObservations(
        acquisition,
        [
          {
            rawId: "raw:not-a-ball",
            mediaRef: "camera:main",
            capturedAt: capturedAt(0),
            confidence: 0.9,
            payload: { playerId: "entity:ball", x: 1, y: 1, possession: "entity:p1" },
          },
          {
            rawId: "raw:not-a-ball-2",
            mediaRef: "camera:main",
            capturedAt: capturedAt(1),
            confidence: 0.9,
            payload: { playerId: "entity:ball", x: 1, y: 1, possession: "entity:p2" },
          },
        ],
        { hash: sha256WorldHash },
      ),
      [playerRule],
    ),
    { maxGapMs: 2000 },
  );
  assert.deepEqual(reconstructEvents(notABall, [possessionRule], "football"), []);
});

test("event rules are validated (fail-closed) and batches stay deterministic", () => {
  const tracks = calibratedFootball();
  const invertedBounds: ZoneEntryRule = {
    ...zoneRule,
    bounds: { minX: 30, maxX: 20, minY: 20, maxY: 30 },
  };
  assert.throws(
    () => reconstructEvents(tracks, [invertedBounds], "football"),
    (error: unknown) => error instanceof EventReconstructionError,
  );
  assert.throws(
    () => reconstructEvents(tracks, [{ ...zoneRule, watchedEntities: [] }], "football"),
    (error: unknown) => error instanceof EventReconstructionError,
  );
  assert.throws(
    () => reconstructEvents(tracks, [zoneRule, { ...zoneRule }], "football"),
    (error: unknown) => error instanceof EventReconstructionError,
  );
  assert.throws(
    () => reconstructEvents(tracks, [zoneRule], ""),
    (error: unknown) => error instanceof EventReconstructionError,
  );
  // deterministic + sorted by eventId
  const events = reconstructEvents(tracks, [zoneRule, possessionRule], "football");
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.eventId),
    events.map((e) => e.eventId).sort(),
  );
  assert.deepEqual(reconstructEvents(tracks, [zoneRule, possessionRule], "football"), events);
  // an empty rules batch is total
  assert.deepEqual(reconstructEvents(tracks, [], "football"), []);
});
