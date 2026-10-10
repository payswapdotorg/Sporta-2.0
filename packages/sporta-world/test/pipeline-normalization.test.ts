/**
 * Wave 5 (w5a) perception pipeline — stage 2: normalization.
 *
 * EVIDENCE CLASS: fixture. The raw observations below are fixture-
 * grade synthetic data (a synthetic broadcast feed), honestly
 * labeled. The pure functions run for REAL — the payload hashes and
 * observation ids asserted below are the real deterministic outputs
 * (real sha-256 via the injected adapter seam). NO real media (see
 * SPEC, "Evidence grading").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NormalizationError,
  acquireSources,
  canonicalJson,
  deriveObservationId,
  normalizeObservations,
  sha256WorldHash,
} from "../src/contract.js";
import type {
  AcquisitionManifest,
  AcquisitionRecord,
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

function acquired(overrides: Partial<AcquisitionManifest> = {}): AcquisitionRecord {
  const records = acquireSources([footballManifest(overrides)]);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  return record;
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

const seams = { hash: sha256WorldHash };

test("normalization emits the exact seam vocabulary with minted provenance and canonical hashes", () => {
  const acquisition = acquired();
  const [entry] = normalizeObservations(acquisition, [playerRaw(0, 5, 5)], seams);
  assert.ok(entry !== undefined);
  const observation = entry.observation;
  assert.equal(observation.domain, "football");
  assert.equal(observation.capturedAt, capturedAt(0));
  assert.equal(observation.confidence, 0.9);
  assert.deepEqual(observation.provenance, {
    sourceKind: "authorized-source",
    sourceRef: "broadcaster:efl",
    capturedAt: capturedAt(0),
    confidence: 0.9,
  });
  assert.deepEqual(observation.entityRefs, ["entity:p1"]);
  assert.deepEqual(observation.policy, policy);
  assert.equal(
    observation.payloadHash,
    sha256WorldHash(canonicalJson({ playerId: "entity:p1", x: 5, y: 5 })),
  );
  // the observation id is EXACTLY what the seam's own derivation produces
  assert.equal(
    entry.observationId,
    deriveObservationId({ ...observation, observationId: undefined }, sha256WorldHash),
  );
  assert.match(entry.observationId, /^obs:[0-9a-f]{64}$/);
});

test("canonical payload hashing is key-order independent (same fact, same id)", () => {
  const acquisition = acquired();
  const left = normalizeObservations(
    acquisition,
    [{ ...playerRaw(0, 5, 5), payload: { x: 5, y: 5, playerId: "entity:p1" } }],
    seams,
  );
  const right = normalizeObservations(
    acquisition,
    [{ ...playerRaw(0, 5, 5), payload: { playerId: "entity:p1", x: 5, y: 5 } }],
    seams,
  );
  assert.equal(left[0]?.observationId, right[0]?.observationId);
  assert.equal(left[0]?.observation.payloadHash, right[0]?.observation.payloadHash);
});

test("normalization applies the source ceiling — carry or lower, never raise", () => {
  const acquisition = acquired();
  // 0.9 raw vs 0.95 ceiling -> 0.9 (carried)
  assert.equal(
    normalizeObservations(acquisition, [playerRaw(0, 5, 5)], seams)[0]?.observation.confidence,
    0.9,
  );
  // 0.99 raw vs 0.95 ceiling -> 0.95 (lowered)
  assert.equal(
    normalizeObservations(acquisition, [{ ...playerRaw(0, 5, 5), confidence: 0.99 }], seams)[0]
      ?.observation.confidence,
    0.95,
  );
  // 0.5 raw vs 0.95 ceiling -> 0.5 (carried)
  assert.equal(
    normalizeObservations(acquisition, [{ ...playerRaw(0, 5, 5), confidence: 0.5 }], seams)[0]
      ?.observation.confidence,
    0.5,
  );
});

test("normalization refuses raws that cannot be affirmed (typed, fail-closed)", () => {
  const acquisition = acquired();
  // observation citing media the acquisition does not declare
  assert.throws(
    () =>
      normalizeObservations(
        acquisition,
        [{ ...playerRaw(0, 5, 5), mediaRef: "camera:other" }],
        seams,
      ),
    (error: unknown) => {
      assert.ok(error instanceof NormalizationError);
      assert.ok(error.detail.includes("camera:other"));
      return true;
    },
  );
  // unparseable timestamp
  assert.throws(
    () =>
      normalizeObservations(
        acquisition,
        [{ ...playerRaw(0, 5, 5), capturedAt: "not-a-timestamp" }],
        seams,
      ),
    (error: unknown) => error instanceof NormalizationError,
  );
  // confidence outside [0, 1]
  assert.throws(
    () => normalizeObservations(acquisition, [{ ...playerRaw(0, 5, 5), confidence: 1.5 }], seams),
    (error: unknown) => error instanceof NormalizationError,
  );
  // duplicate rawId in one batch
  assert.throws(
    () => normalizeObservations(acquisition, [playerRaw(0, 5, 5), playerRaw(0, 6, 6)], seams),
    (error: unknown) => error instanceof NormalizationError,
  );
  // non-plain-object payload (an array)
  const arrayPayload = JSON.parse(
    JSON.stringify({ ...playerRaw(0, 5, 5), payload: [1, 2] }),
  ) as RawObservation;
  assert.throws(
    () => normalizeObservations(acquisition, [arrayPayload], seams),
    (error: unknown) => error instanceof NormalizationError,
  );
  // an empty batch is total
  assert.deepEqual(normalizeObservations(acquisition, [], seams), []);
});
