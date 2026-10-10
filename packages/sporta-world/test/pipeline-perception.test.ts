/**
 * Wave 5 (w5a) perception pipeline — stage 3: perception.
 *
 * EVIDENCE CLASS: fixture. The payloads and rules below are
 * fixture-grade synthetic data, honestly labeled. The pure function
 * runs for REAL — the exact confidences, fact ids and orderings
 * asserted below are its real deterministic outputs. NO ML model is
 * loaded, executed or claimed anywhere: this stage is an honest typed
 * transform over declared field maps (see SPEC, "Honesty statement").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PerceptionError,
  acquireSources,
  normalizeObservations,
  perceiveObservations,
  sha256WorldHash,
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

const seams = { hash: sha256WorldHash };

test("perception extracts declared facts deterministically (sorted, deduped, confidence narrowed)", () => {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const normalized = normalizeObservations(
    acquisition,
    [playerRaw(0, 5, 5), playerRaw(1, 10, 10), ballRaw(0, "entity:p1"), ballRaw(1, "entity:p2")],
    seams,
  );
  const facts = perceiveObservations(normalized, [playerRule, ballRule]);
  assert.equal(facts.length, 4);
  // sorted by factId (independent of input order)
  const factIds = facts.map((fact) => fact.factId);
  assert.deepEqual(factIds, [...factIds].sort());
  for (const fact of facts) {
    assert.deepEqual(fact.acquisitionIds, ["acq:w5a-football"]);
    assert.match(fact.observationId, /^obs:[0-9a-f]{64}$/);
    if (fact.kind === "entity-state") {
      assert.equal(fact.entityId, "entity:p1");
      assert.equal(fact.confidence, 0.9); // carried
    } else {
      assert.equal(fact.entityId, "entity:ball");
      assert.equal(fact.confidence, 0.8); // min(0.85, rule factor 0.8) — lowered
    }
  }
  // possession carried where declared in the payload
  const ball0 = facts.find(
    (fact) => fact.kind === "ball-state" && fact.capturedAt === capturedAt(0),
  );
  assert.equal(ball0?.possession, "entity:p1");
  // deterministic: a re-run produces the identical batch
  assert.deepEqual(perceiveObservations(normalized, [playerRule, ballRule]), facts);
});

test("perception skips non-matching and partial payloads; mistyped fields are typed refusals", () => {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const normalize = (payload: Record<string, unknown>) =>
    normalizeObservations(acquisition, [{ ...playerRaw(0, 5, 5), payload }], seams);
  // no mapped field present -> the rule does not match at all
  assert.equal(perceiveObservations(normalize({ foo: 1 }), [playerRule]).length, 0);
  // partial (id present, coords missing) -> engaged but not applied
  assert.equal(perceiveObservations(normalize({ playerId: "entity:p1" }), [playerRule]).length, 0);
  // a mapped field present with the WRONG TYPE -> typed refusal naming rule and field
  assert.throws(
    () => perceiveObservations(normalize({ playerId: "entity:p1", x: "10", y: 2 }), [playerRule]),
    (error: unknown) => {
      assert.ok(error instanceof PerceptionError);
      assert.ok(error.detail.includes("rule:player"));
      assert.ok(error.detail.includes("x"));
      return true;
    },
  );
  // z declared and present -> carried on the position
  const zRule: EntityStateRule = { ...playerRule, ruleId: "rule:player-z", zField: "z" };
  const withZ = perceiveObservations(normalize({ playerId: "entity:p1", x: 1, y: 2, z: 3 }), [
    zRule,
  ]);
  assert.deepEqual(withZ[0]?.position, { x: 1, y: 2, z: 3 });
  // z declared but ABSENT from the payload -> the rule does not apply
  // (a rule applies only when ALL its mapped fields are present)
  const zMissing = perceiveObservations(normalize({ playerId: "entity:p1", x: 1, y: 2 }), [zRule]);
  assert.equal(zMissing.length, 0);
  // a rule that declares no zField yields the ground-plane position only
  const noZ = perceiveObservations(normalize({ playerId: "entity:p1", x: 1, y: 2 }), [playerRule]);
  assert.deepEqual(noZ[0]?.position, { x: 1, y: 2 });
  // ball possession is OPTIONAL data: absent possession still produces the fact
  const ballFacts = perceiveObservations(normalize({ ballId: "entity:ball", x: 1, y: 2 }), [
    ballRule,
  ]);
  assert.equal(ballFacts.length, 1);
  assert.equal(ballFacts[0]?.possession, undefined);
});

test("perception refuses mixed domains and malformed rule batches", () => {
  const [acquisition] = acquireSources([footballManifest]);
  assert.ok(acquisition !== undefined);
  const football = normalizeObservations(acquisition, [playerRaw(0, 5, 5)], seams);
  const basketballManifest: AcquisitionManifest = {
    ...footballManifest,
    manifestId: "acq:basket",
    domain: "basketball",
  };
  const [basketballAcquisition] = acquireSources([basketballManifest]);
  assert.ok(basketballAcquisition !== undefined);
  const basketball = normalizeObservations(
    basketballAcquisition,
    [{ ...playerRaw(0, 5, 5), rawId: "raw:b1" }],
    seams,
  );
  assert.throws(
    () => perceiveObservations([...football, ...basketball], [playerRule]),
    (error: unknown) => error instanceof PerceptionError,
  );
  // duplicate rule ids
  assert.throws(
    () => perceiveObservations(football, [playerRule, { ...playerRule }]),
    (error: unknown) => {
      assert.ok(error instanceof PerceptionError);
      assert.ok(error.detail.includes("duplicate"));
      return true;
    },
  );
  // invalid confidence factor
  assert.throws(
    () => perceiveObservations(football, [{ ...ballRule, confidenceFactor: 1.5 }]),
    (error: unknown) => error instanceof PerceptionError,
  );
  // an empty rules batch is total
  assert.deepEqual(perceiveObservations(football, []), []);
});
