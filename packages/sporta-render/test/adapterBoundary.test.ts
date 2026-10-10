import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  playByPlayRenderModel,
  playByPlayTranscript,
  serializeTacticalSvg,
  tacticalRenderModel,
} from "../src/contract.js";
import { deepFreeze, fixtureSnapshot, ingestionShapedSnapshot, jsonClone } from "./fixtures.js";

/**
 * The renderer adapter boundary invariant battery.
 *
 * EVIDENCE LABEL: FIXTURE inputs (labeled in fixtures.ts); the adapter
 * projections, freezing and serialization run FOR REAL under
 * node:test (REAL: deterministic execution, real outputs — measured
 * by the assertions below). The serializer source scan performs a
 * REAL filesystem read at test time.
 */

/** Recursively collects every object key path (arrays collapsed). */
function keyPaths(value: unknown, prefix: string, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) keyPaths(item, prefix, out);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      out.add(path);
      keyPaths((value as Record<string, unknown>)[key], path, out);
    }
  }
}

function pathsOf(value: unknown): Set<string> {
  const out = new Set<string>();
  keyPaths(value, "", out);
  return out;
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

test("both adapters consume the SAME snapshot and carry an identical shared header", () => {
  const snapshot = fixtureSnapshot();
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.equal(tactical.source.swmId, pbp.source.swmId);
  assert.equal(tactical.source.snapshotHash, pbp.source.snapshotHash);
  assert.equal(tactical.source.domain, pbp.source.domain);
  assert.deepEqual(tactical.provenance, pbp.provenance);
  assert.deepEqual(tactical.rightsScope, pbp.rightsScope);
  assert.deepEqual(tactical.evidence, pbp.evidence);
  // and the header is verbatim from the snapshot (zero invention)
  assert.deepEqual(tactical.provenance, snapshot.provenance);
  assert.deepEqual(tactical.rightsScope, {
    holders: snapshot.policy.rights.holders,
    usages: snapshot.policy.rights.usages,
    prohibitions: snapshot.policy.rights.prohibitions,
  });
  assert.deepEqual(tactical.evidence, [
    { observationId: "obs:fixture-1", confidence: 0.88 },
    { observationId: "obs:fixture-2", confidence: 0.91 },
    { observationId: "entity:ball", confidence: 0.5 },
    { observationId: "evt:e2", confidence: 0.77 },
  ]);
});

test("A13: two materially different realities — structurally disjoint projections of the same snapshot", () => {
  const snapshot = fixtureSnapshot();
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  const tacticalPaths = pathsOf(tactical);
  const pbpPaths = pathsOf(pbp);

  // Reality-specific paths = everything beyond the shared header.
  const tacticalBody = new Set([...tacticalPaths].filter((p) => !HEADER_PATHS.has(p)));
  const pbpBody = new Set([...pbpPaths].filter((p) => !HEADER_PATHS.has(p)));
  assert.ok(tacticalBody.size > 0, "tactical body must be non-empty");
  assert.ok(pbpBody.size > 0, "play-by-play body must be non-empty");
  for (const path of tacticalBody) {
    assert.ok(!pbpBody.has(path), `bodies must be disjoint, shared path: ${path}`);
  }

  // The tactical reality is spatial/structural: board + timeline.
  assert.deepEqual([...tacticalBody].filter((p) => p.startsWith("board.")).sort(), [
    "board.coordinateSystem",
    "board.entities",
    "board.entities.confidence",
    "board.entities.coordinateSystem",
    "board.entities.entityId",
    "board.entities.x",
    "board.entities.y",
    "board.height",
    "board.width",
  ]);
  // The play-by-play reality is textual/sequential: records of phrases.
  assert.deepEqual([...pbpBody].filter((p) => p.startsWith("records.")).sort(), [
    "records.capturedAt",
    "records.capturedAtSource",
    "records.confidence",
    "records.eventId",
    "records.phrases",
    "records.phrases.anchoredEventId",
    "records.phrases.derivedFields",
    "records.phrases.templateId",
    "records.phrases.text",
    "records.sequence",
  ]);

  // Characteristic-field law: neither body carries the other's fields.
  for (const path of tacticalPaths) {
    assert.ok(
      !/(^|\.)(records|phrases|text|templateId|anchoredEventId|derivedFields)$/.test(path),
      `tactical must not carry narrative field: ${path}`,
    );
  }
  for (const path of pbpPaths) {
    assert.ok(
      !/(^|\.)(board|width|height|entities|coordinateSystem|x|y|timeline|anchor|anchorSource|events)$/.test(
        path,
      ),
      `play-by-play must not carry spatial field: ${path}`,
    );
  }

  // And the two models are, of course, not equal projections.
  assert.notEqual(JSON.stringify(tactical), JSON.stringify(pbp));
});

test("adapters are pure: a deep-frozen snapshot passes through unchanged (no mutation, no throw)", () => {
  const snapshot = deepFreeze(fixtureSnapshot());
  const before = jsonClone(snapshot);
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  serializeTacticalSvg(tactical);
  playByPlayTranscript(pbp);
  assert.deepEqual(snapshot, before);
  // strict-mode mutation of the frozen input would have thrown
  assert.throws(() => {
    (snapshot as { domain: string }).domain = "mutated";
  }, TypeError);
});

test("adapters are deterministic: identical snapshot, byte-identical models", () => {
  const snapshot = fixtureSnapshot();
  const tactical1 = JSON.stringify(tacticalRenderModel(snapshot));
  const tactical2 = JSON.stringify(tacticalRenderModel(fixtureSnapshot()));
  assert.equal(tactical1, tactical2);
  const pbp1 = JSON.stringify(playByPlayRenderModel(snapshot));
  const pbp2 = JSON.stringify(playByPlayRenderModel(fixtureSnapshot()));
  assert.equal(pbp1, pbp2);
});

test("zero invented facts: every id in the models is the snapshot's own", () => {
  const snapshot = ingestionShapedSnapshot();
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.deepEqual(
    tactical.board.entities.map((e) => e.entityId),
    [...snapshot.entities],
  );
  assert.deepEqual(
    tactical.timeline.events.map((e) => e.eventId),
    [...snapshot.events],
  );
  assert.deepEqual(
    pbp.records.map((r) => r.eventId),
    [...snapshot.events],
  );
  assert.deepEqual(
    pbp.records.flatMap((r) => r.phrases.map((p) => p.anchoredEventId)),
    snapshot.events.flatMap((id) => [id, id]),
  );
  for (const entity of tactical.board.entities) {
    assert.ok(Number.isFinite(entity.x));
    assert.ok(Number.isFinite(entity.y));
    assert.equal(entity.coordinateSystem, "derived-layout");
  }
  assert.equal(tactical.timeline.anchor, snapshot.provenance.capturedAt);
  for (const event of tactical.timeline.events) {
    assert.equal(event.capturedAt, snapshot.provenance.capturedAt);
    assert.equal(event.capturedAtSource, "snapshot-provenance");
  }
});

test("order as-given: adapters never re-sort or deduplicate the record's own arrays", () => {
  const snapshot = fixtureSnapshot({
    entities: ["entity:z", "entity:a", "entity:z"],
    events: ["evt:second", "evt:first", "evt:second"],
  });
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.deepEqual(
    tactical.board.entities.map((e) => e.entityId),
    ["entity:z", "entity:a", "entity:z"],
  );
  assert.deepEqual(
    tactical.timeline.events.map((e) => [e.eventId, e.sequence]),
    [
      ["evt:second", 0],
      ["evt:first", 1],
      ["evt:second", 2],
    ],
  );
  assert.deepEqual(
    pbp.records.map((r) => r.sequence),
    [0, 1, 2],
  );
});

test("empty entities/events are honest empties, never errors", () => {
  const snapshot = fixtureSnapshot({ entities: [], events: [] });
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.deepEqual(tactical.board.entities, []);
  assert.deepEqual(tactical.timeline.events, []);
  assert.deepEqual(pbp.records, []);
  assert.equal(tactical.timeline.anchor, snapshot.provenance.capturedAt);
  // and the serializer still emits a full, deterministic document
  const svg = serializeTacticalSvg(tactical);
  assert.ok(svg.startsWith("<svg "));
  assert.ok(svg.endsWith("</svg>\n"));
});

test("render models are deeply frozen (read-only carry-forward law)", () => {
  const snapshot = fixtureSnapshot();
  const tactical = tacticalRenderModel(snapshot);
  const pbp = playByPlayRenderModel(snapshot);
  assert.ok(Object.isFrozen(tactical));
  assert.ok(Object.isFrozen(tactical.board));
  assert.ok(Object.isFrozen(tactical.board.entities));
  assert.ok(Object.isFrozen(tactical.board.entities[0]));
  assert.ok(Object.isFrozen(tactical.timeline.events));
  assert.ok(Object.isFrozen(pbp.records));
  assert.ok(Object.isFrozen(pbp.records[0]?.phrases));
  assert.throws(() => {
    (tactical.board as { width: number }).width = 1;
  }, TypeError);
  assert.throws(() => {
    (pbp.records[0] as { eventId: string }).eventId = "evt:invented";
  }, TypeError);
});

test("renderer adapter boundary: the serializer source consumes render models ONLY (machine-checked)", () => {
  // REAL filesystem read at test time (the boundary is source-level law).
  const serializerPath = join(import.meta.dirname, "../src/adapters/tacticalSvg.ts");
  const source = readFileSync(serializerPath, "utf8");
  assert.ok(
    !source.includes("@sporta/contracts"),
    "serializer must not import the contracts surface",
  );
  assert.ok(
    !source.includes("SportsWorldModelRecord"),
    "serializer must not reference the SWM record type — render models only",
  );
  // The serializer runs from the model alone (no snapshot in scope).
  const model = tacticalRenderModel(fixtureSnapshot());
  const svg = serializeTacticalSvg(model);
  assert.ok(svg.includes("<svg "));
});
