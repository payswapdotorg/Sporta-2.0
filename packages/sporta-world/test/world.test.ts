import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FixedClock,
  InvalidObservationError,
  MixedDomainError,
  ProvenanceRefusalError,
  WorldModelService,
  WorldPolicyConflictError,
  computeSnapshotHash,
  sha256WorldHash,
} from "../src/contract.js";
import type { ObservationInput, PolicySet, ProvenanceDescriptor } from "../src/contract.js";

const capturedAt = "2026-04-01T00:00:00.000Z";

const policy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

function observation(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    domain: "football",
    payloadHash: "ab" + "00".repeat(31),
    capturedAt,
    confidence: 0.88,
    provenance: {
      sourceKind: "observation",
      sourceRef: "camera:1",
      capturedAt,
    },
    ...overrides,
  };
}

function fixtureWorld(): WorldModelService {
  return new WorldModelService(new FixedClock("2026-05-01T00:00:00.000Z"), sha256WorldHash);
}

test("ingestObservations is idempotent per observationId (same snapshot, no duplicates)", async () => {
  const world = fixtureWorld();
  const first = await world.ingestObservations([
    observation({ observationId: "obs:w1", entityRefs: ["entity:p1"] }),
  ]);
  const retry = await world.ingestObservations([
    observation({ observationId: "obs:w1", entityRefs: ["entity:p1"] }),
  ]);
  assert.deepEqual(retry, first);
  assert.equal(first.swmId, "swm:football");
  assert.equal(world.readObservations("swm:football").length, 1);
  // the ledger entry keeps its ORIGINAL ingest timestamp
  assert.equal(world.readObservations("swm:football")[0]?.ingestedAt, "2026-05-01T00:00:00.000Z");
});

test("non-authorized provenance kinds are REFUSED (typed) and nothing is ingested", async () => {
  const world = fixtureWorld();
  const arenaProvenance: ProvenanceDescriptor = {
    sourceKind: "arena-session",
    sourceRef: "arena:1",
    capturedAt,
  };
  await assert.rejects(
    () =>
      world.ingestObservations([
        observation({
          observationId: "obs:ok",
          provenance: { sourceKind: "observation", sourceRef: "camera:1", capturedAt },
        }),
        observation({ observationId: "obs:arena", provenance: arenaProvenance }),
      ]),
    (error: unknown) => {
      assert.ok(error instanceof ProvenanceRefusalError);
      assert.match(error.detail, /arena-session/);
      return true;
    },
  );
  // all-or-nothing: the valid observation was NOT ingested either
  assert.equal(world.readObservations("swm:football").length, 0);
  assert.equal(await world.readSnapshot("swm:football"), null);

  await assert.rejects(
    () =>
      world.ingestObservations([
        observation({
          observationId: "obs:agent",
          provenance: { sourceKind: "agent-run", sourceRef: "run:1", capturedAt },
        }),
      ]),
    (error: unknown) => error instanceof ProvenanceRefusalError,
  );
  await assert.rejects(
    () =>
      world.ingestObservations([
        observation({
          observationId: "obs:lab",
          provenance: { sourceKind: "measurement", sourceRef: "sim:1", capturedAt },
        }),
      ]),
    (error: unknown) => error instanceof ProvenanceRefusalError,
  );
  assert.equal(await world.readSnapshot("swm:football"), null);
});

test("mixed domains and invalid confidence are refused (typed)", async () => {
  const world = fixtureWorld();
  await assert.rejects(
    () =>
      world.ingestObservations([
        observation({ observationId: "obs:a" }),
        observation({ observationId: "obs:b", domain: "basketball" }),
      ]),
    (error: unknown) => error instanceof MixedDomainError,
  );
  await assert.rejects(
    () => world.ingestObservations([observation({ observationId: "obs:c", confidence: 1.5 })]),
    (error: unknown) => error instanceof InvalidObservationError,
  );
});

test("snapshot carries uncertainty, provenance, entities/events and policy", async () => {
  const world = fixtureWorld();
  const secondProvenance: ProvenanceDescriptor = {
    sourceKind: "authorized-source",
    sourceRef: "camera:2",
    capturedAt,
    confidence: 0.9,
  };
  const snapshot = await world.ingestObservations([
    observation({
      observationId: "obs:u1",
      confidence: 0.88,
      entityRefs: ["entity:p2", "entity:p1"],
      eventRefs: ["event:e2", "event:e1"],
      policy,
    }),
    observation({
      observationId: "obs:u2",
      payloadHash: "cd" + "00".repeat(31),
      confidence: 0.72,
      provenance: secondProvenance,
    }),
  ]);
  assert.equal(snapshot.swmId, "swm:football");
  assert.equal(
    snapshot.snapshotHash,
    computeSnapshotHash(["ab" + "00".repeat(31), "cd" + "00".repeat(31)], sha256WorldHash),
  );
  assert.deepEqual(snapshot.entities, ["entity:p1", "entity:p2"]);
  assert.deepEqual(snapshot.events, ["event:e1", "event:e2"]);
  assert.deepEqual(snapshot.uncertainty, [
    { subject: "obs:u1", confidence: 0.88 },
    { subject: "obs:u2", confidence: 0.72 },
  ]);
  // record-level provenance = freshest ingested observation
  assert.equal(snapshot.provenance.sourceKind, "authorized-source");
  assert.equal(snapshot.provenance.sourceRef, "camera:2");
  assert.deepEqual(snapshot.policy, policy);
  // per-observation provenance is preserved in the ledger
  const ledger = world.readObservations("swm:football");
  assert.deepEqual(
    ledger.map((entry) => entry.provenance.sourceRef),
    ["camera:1", "camera:2"],
  );
});

test("second ingest extends the snapshot; entity refs union across batches", async () => {
  const world = fixtureWorld();
  await world.ingestObservations([
    observation({ observationId: "obs:s1", entityRefs: ["entity:p1"] }),
  ]);
  const updated = await world.ingestObservations([
    observation({
      observationId: "obs:s2",
      payloadHash: "cd" + "00".repeat(31),
      entityRefs: ["entity:p9"],
    }),
  ]);
  assert.equal(world.readObservations("swm:football").length, 2);
  assert.deepEqual(updated.entities, ["entity:p1", "entity:p9"]);
  assert.equal(
    updated.snapshotHash,
    computeSnapshotHash(["ab" + "00".repeat(31), "cd" + "00".repeat(31)], sha256WorldHash),
  );
});

test("readSnapshot returns null for an unknown id", async () => {
  const world = fixtureWorld();
  assert.equal(await world.readSnapshot("swm:unknown"), null);
});

test("a conflicting explicit policy on a later batch is refused (rights never weaken silently)", async () => {
  const world = fixtureWorld();
  const weaker: PolicySet = {
    rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
    privacy: { visibility: "public", exportableFields: [] },
    retention: { disposition: "retain" },
  };
  await world.ingestObservations([observation({ observationId: "obs:pc1", policy })]);
  await assert.rejects(
    () => world.ingestObservations([observation({ observationId: "obs:pc2", policy: weaker })]),
    (error: unknown) => error instanceof WorldPolicyConflictError,
  );
  // the original policy stays established
  const snapshot = await world.readSnapshot("swm:football");
  assert.deepEqual(snapshot?.policy, policy);
});

test("absent observationId is derived deterministically (natural retry stays idempotent)", async () => {
  const world = fixtureWorld();
  const first = await world.ingestObservations([observation()]);
  const retry = await world.ingestObservations([observation()]);
  assert.deepEqual(retry, first);
  assert.equal(world.readObservations("swm:football").length, 1);
  assert.match(
    world.readObservations("swm:football")[0]?.observationId ?? "",
    /^obs:[0-9a-f]{64}$/,
  );
});

test("computeSnapshotHash is order-independent over the payload hashes", () => {
  const hashOf = (payloadHashes: string[]) => computeSnapshotHash(payloadHashes, sha256WorldHash);
  const left = hashOf(["bb" + "00".repeat(31), "aa" + "00".repeat(31)]);
  const right = hashOf(["aa" + "00".repeat(31), "bb" + "00".repeat(31)]);
  assert.equal(left, right);
  // duplicates are NOT deduplicated: two observations of one payload are two facts
  assert.notEqual(
    hashOf(["aa" + "00".repeat(31)]),
    hashOf(["aa" + "00".repeat(31), "aa" + "00".repeat(31)]),
  );
});
