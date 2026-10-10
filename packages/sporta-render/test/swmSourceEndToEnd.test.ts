import assert from "node:assert/strict";
import { test } from "node:test";
import { FixedClock, WorldModelService, sha256WorldHash } from "@sporta/world/contract";
import type { ObservationInput } from "@sporta/world/contract";
import {
  playByPlayRenderModel,
  playByPlayTranscript,
  serializeTacticalSvg,
  swmRenderableUnder,
  tacticalRenderModel,
} from "../src/contract.js";

/**
 * EVIDENCE CLASSES (the repo evidence law — honestly labeled):
 *
 * - REAL: the deterministic functions run for real — the REAL
 *   `WorldModelService` ingestion seam (sporta-world, the frozen B5
 *   boundary), REAL sha-256 snapshot hashing (node:crypto via
 *   `sha256WorldHash`), the real fixed clock, and the REAL
 *   sporta-render adapters + serializers executing on the RETURNED
 *   snapshot (real wall-time, real deterministic outputs on real
 *   inputs). This is the honest A13-prefix lane: authorized-source
 *   observations -> REAL ingestion -> REAL SWM snapshot -> two
 *   materially different realities.
 *
 * - FIXTURE-GRADE: the OBSERVATIONS are fixture-grade authorized
 *   media (hand-built camera/telemetry literals with
 *   authorized-source/observation provenance). No real broadcast
 *   feed exists in this sandbox; the upstream perception stages
 *   (w5a) are out of scope here.
 *
 * RESOLUTION NOTE (WO-C1 transitional-symlink law): @sporta/world
 * resolves through a gitignored node_modules symlink during worker
 * development; the TL's real install + registration replaces it.
 */

const ingestClock = new FixedClock("2026-06-01T00:00:00.000Z");

function observation(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    domain: "football",
    payloadHash: "ab".concat("00".repeat(31)),
    capturedAt: "2026-04-01T00:00:00.000Z",
    confidence: 0.88,
    provenance: {
      sourceKind: "observation",
      sourceRef: "camera:1",
      capturedAt: "2026-04-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function renderPermittingPolicy(): NonNullable<ObservationInput["policy"]> {
  return {
    rights: { holders: ["holder:broadcast"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

/** Recursive key-path collection (mirrors the boundary test's helper). */
function pathsOf(value: unknown, prefix = "", into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) pathsOf(item, prefix, into);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      into.add(path);
      pathsOf(child, path, into);
    }
  }
  return into;
}

/** The shared-by-law header paths both realities carry identically. */
const HEADER_PATHS = new Set([
  "kind",
  "source",
  "source.swmId",
  "source.snapshotHash",
  "source.domain",
  "provenance",
  "provenance.sourceKind",
  "provenance.sourceRef",
  "provenance.capturedAt",
  "provenance.confidence",
  "rightsScope",
  "rightsScope.holders",
  "rightsScope.usages",
  "rightsScope.prohibitions",
  "evidence",
  "evidence.observationId",
  "evidence.confidence",
]);

test("REAL: authorized observations -> REAL ingestion -> BOTH realities from the SAME returned snapshot", async () => {
  const world = new WorldModelService(ingestClock, sha256WorldHash);
  const snapshot = await world.ingestObservations([
    observation({
      observationId: "obs:e2r1",
      payloadHash: "ab".concat("00".repeat(31)),
      entityRefs: ["entity:p2", "entity:p1"],
      eventRefs: ["event:goal", "event:kickoff"],
    }),
    observation({
      observationId: "obs:e2r2",
      payloadHash: "cd".concat("00".repeat(31)),
      capturedAt: "2026-04-01T00:00:02.000Z",
      confidence: 0.9,
      eventRefs: ["event:save"],
      provenance: {
        sourceKind: "authorized-source",
        sourceRef: "camera:2",
        capturedAt: "2026-04-01T00:00:02.000Z",
        confidence: 0.9,
      },
      policy: renderPermittingPolicy(),
    }),
  ]);
  // REAL snapshot facts (produced by the real service + real sha-256)
  assert.equal(snapshot.swmId, "swm:football");
  assert.deepEqual(snapshot.entities, ["entity:p1", "entity:p2"]);
  assert.deepEqual(snapshot.events, ["event:goal", "event:kickoff", "event:save"]);
  assert.equal(snapshot.provenance.sourceRef, "camera:2");

  // BOTH realities consume the SAME returned snapshot through the adapters
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.equal(tactical.kind, "tactical");
  assert.equal(pbp.kind, "play-by-play");
  // the header carries the REAL record facts (zero invention)
  assert.deepEqual(tactical.source, {
    swmId: snapshot.swmId,
    snapshotHash: snapshot.snapshotHash,
    domain: snapshot.domain,
  });
  assert.deepEqual(tactical.provenance, snapshot.provenance);
  assert.deepEqual(tactical.rightsScope, {
    holders: snapshot.policy.rights.holders,
    usages: snapshot.policy.rights.usages,
    prohibitions: snapshot.policy.rights.prohibitions,
  });
  // the evidence is the record's own uncertainty (REAL observation ids)
  assert.deepEqual(tactical.evidence, [
    { observationId: "obs:e2r1", confidence: 0.88 },
    { observationId: "obs:e2r2", confidence: 0.9 },
  ]);
  // the payloads carry the REAL canonical ids (sorted-unique by the service)
  assert.deepEqual(tactical.board.entities.map((e) => e.entityId), snapshot.entities);
  assert.deepEqual(tactical.timeline.events.map((e) => e.eventId), snapshot.events);
  assert.deepEqual(pbp.records.map((r) => r.eventId), snapshot.events);
  // the timeline anchor is the freshest observation's capture (the only real clock)
  assert.equal(tactical.timeline.anchor, "2026-04-01T00:00:02.000Z");
  assert.equal(tactical.timeline.anchorSource, "snapshot-provenance");
  // entities/events carry NO invented confidence: the real service's
  // uncertainty subjects are OBSERVATION ids, which match no entity/event id
  for (const entity of tactical.board.entities) assert.equal(entity.confidence, undefined);
  for (const event of tactical.timeline.events) assert.equal(event.confidence, undefined);
  // every phrase is anchored to its record's event id
  for (const record of pbp.records) {
    for (const phrase of record.phrases) assert.equal(phrase.anchoredEventId, record.eventId);
  }
});

test("REAL: the A13 materiality invariant holds on the REAL snapshot (disjoint bodies)", async () => {
  const world = new WorldModelService(ingestClock, sha256WorldHash);
  const snapshot = await world.ingestObservations([
    observation({
      observationId: "obs:e2m1",
      eventRefs: ["event:a", "event:b"],
      policy: renderPermittingPolicy(),
    }),
  ]);
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  // identical shared header evidence; disjoint reality bodies
  assert.deepEqual(tactical.source, pbp.source);
  assert.deepEqual(tactical.provenance, pbp.provenance);
  assert.deepEqual(tactical.rightsScope, pbp.rightsScope);
  assert.deepEqual(tactical.evidence, pbp.evidence);
  const tacticalBody = [...pathsOf(tactical)].filter((p) => !HEADER_PATHS.has(p));
  const pbpBody = new Set([...pathsOf(pbp)].filter((p) => !HEADER_PATHS.has(p)));
  assert.ok(tacticalBody.length > 0 && pbpBody.size > 0);
  for (const path of tacticalBody) {
    assert.ok(!pbpBody.has(path), `bodies must be disjoint, shared path: ${path}`);
  }
  // the tactical body is geometry; the play-by-play body is narrative
  assert.ok(tacticalBody.some((p) => p.startsWith("board.")));
  assert.ok(tacticalBody.some((p) => p.startsWith("timeline.")));
  assert.ok([...pbpBody].every((p) => p === "records" || p.startsWith("records.")));
});

test("REAL: both serializers are deterministic over the REAL snapshot and traceable", async () => {
  const world = new WorldModelService(ingestClock, sha256WorldHash);
  const snapshot = await world.ingestObservations([
    observation({
      observationId: "obs:e2d1",
      entityRefs: ["entity:p1"],
      eventRefs: ["event:only"],
      policy: renderPermittingPolicy(),
    }),
  ]);
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  const svg = serializeTacticalSvg(tactical);
  assert.equal(svg, serializeTacticalSvg(tacticalRenderModel(snapshot)));
  const transcript = playByPlayTranscript(pbp);
  assert.equal(transcript, playByPlayTranscript(playByPlayRenderModel(snapshot)));
  // traceability: every real id appears in both serializations
  for (const entityId of snapshot.entities) assert.ok(svg.includes(entityId));
  for (const eventId of snapshot.events) {
    assert.ok(svg.includes(eventId));
    assert.ok(transcript.includes(eventId));
  }
  // the SVG carries the real snapshot hash + provenance in its evidence lines
  assert.ok(svg.includes(snapshot.snapshotHash));
  assert.ok(svg.includes("observation/camera:1"));
});

test("REAL: a second synthetic domain runs end-to-end (domain-extension law, no redesign)", async () => {
  // a NON-sport domain — the realities assume no sport, only record facts
  const world = new WorldModelService(ingestClock, sha256WorldHash);
  const snapshot = await world.ingestObservations([
    {
      domain: "robotics-arena",
      payloadHash: "ef".concat("00".repeat(31)),
      capturedAt: "2026-05-01T00:00:00.000Z",
      confidence: 0.75,
      provenance: {
        sourceKind: "observation",
        sourceRef: "telemetry:bot-7",
        capturedAt: "2026-05-01T00:00:00.000Z",
      },
      entityRefs: ["entity:bot-7", "entity:bot-3"],
      eventRefs: ["event:pick", "event:place", "event:move"],
      policy: renderPermittingPolicy(),
    },
  ]);
  assert.equal(snapshot.swmId, "swm:robotics-arena");
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.equal(tactical.source.domain, "robotics-arena");
  assert.equal(pbp.source.domain, "robotics-arena");
  assert.deepEqual(tactical.board.entities.map((e) => e.entityId), [
    "entity:bot-3",
    "entity:bot-7",
  ]);
  assert.deepEqual(pbp.records.map((r) => r.eventId), [
    "event:move",
    "event:pick",
    "event:place",
  ]);
  const svg = serializeTacticalSvg(tactical);
  const transcript = playByPlayTranscript(pbp);
  assert.ok(svg.includes("robotics-arena"));
  assert.ok(transcript.includes("robotics-arena") || transcript.includes("event:pick"));
});

test("REAL: the usage gate is fail-closed over a REAL restricted snapshot (rights propagate)", async () => {
  const world = new WorldModelService(ingestClock, sha256WorldHash);
  const restricted: NonNullable<ObservationInput["policy"]> = {
    rights: { holders: ["holder:internal"], usages: ["edit"], prohibitions: ["render"] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
  const snapshot = await world.ingestObservations([
    observation({ observationId: "obs:e2x1", policy: restricted }),
  ]);
  assert.deepEqual(snapshot.policy, restricted);
  // the caller's render usage context is refused (fail-closed, C6 law)
  assert.equal(swmRenderableUnder(snapshot.policy.rights, { usages: ["render"] }), false);
  // a bare/empty context is never renderable
  assert.equal(swmRenderableUnder(snapshot.policy.rights, undefined), false);
  assert.equal(swmRenderableUnder(snapshot.policy.rights, { usages: [] }), false);
  // the permitted class for the restricted snapshot is "edit": an
  // edit-only caller context IS renderable (the "render"
  // prohibition does not apply to a context that never declares it)
  assert.equal(swmRenderableUnder(snapshot.policy.rights, { usages: ["edit"] }), true);
  // and a caller declaring BOTH a permitted and a prohibited class is refused
  assert.equal(
    swmRenderableUnder(snapshot.policy.rights, { usages: ["edit", "render"] }),
    false,
  );
});

test("REAL: idempotent re-ingestion keeps both realities stable (same record -> same models)", async () => {
  const world = new WorldModelService(ingestClock, sha256WorldHash);
  const batch = [
    observation({
      observationId: "obs:e2i1",
      eventRefs: ["event:stable"],
      policy: renderPermittingPolicy(),
    }),
  ];
  const first = await world.ingestObservations(batch);
  const retry = await world.ingestObservations(batch);
  assert.deepEqual(retry, first);
  assert.deepEqual(tacticalRenderModel(retry), tacticalRenderModel(first));
  assert.deepEqual(playByPlayRenderModel(retry), playByPlayRenderModel(first));
});
