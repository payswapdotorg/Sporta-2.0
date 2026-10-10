import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RenderInputError,
  TACTICAL_BOARD_HEIGHT,
  TACTICAL_BOARD_MARGIN,
  TACTICAL_BOARD_WIDTH,
  boardColumns,
  derivedBoardPosition,
  tacticalRenderModel,
} from "../src/contract.js";
import { fixtureSnapshot, ingestionShapedSnapshot } from "./fixtures.js";

/**
 * The tactical board reality battery (adapter + derived geometry).
 *
 * EVIDENCE LABEL: FIXTURE inputs (labeled in fixtures.ts); the pure
 * projections and geometry functions run FOR REAL under node:test
 * (REAL: deterministic execution, real outputs).
 */

test("board columns: near-square grid counts", () => {
  assert.equal(boardColumns(0), 0);
  assert.equal(boardColumns(1), 1);
  assert.equal(boardColumns(2), 2);
  assert.equal(boardColumns(4), 2);
  assert.equal(boardColumns(5), 3);
  assert.equal(boardColumns(9), 3);
  assert.equal(boardColumns(10), 4);
});

test("derived layout: a sole entity is centered on the board", () => {
  const position = derivedBoardPosition(0, 1);
  assert.deepEqual(position, { x: TACTICAL_BOARD_WIDTH / 2, y: TACTICAL_BOARD_HEIGHT / 2 });
});

test("derived layout: 4 entities form the margin-box corners (deterministic values)", () => {
  const expected = [
    { x: 40, y: 40 },
    { x: 960, y: 40 },
    { x: 40, y: 600 },
    { x: 960, y: 600 },
  ];
  for (let index = 0; index < 4; index += 1) {
    assert.deepEqual(derivedBoardPosition(index, 4), expected[index]);
  }
  assert.equal(TACTICAL_BOARD_MARGIN, 40);
  assert.equal(TACTICAL_BOARD_WIDTH, 1000);
  assert.equal(TACTICAL_BOARD_HEIGHT, 640);
});

test("derived layout: same (index, total) always yields the same position", () => {
  for (let total = 1; total <= 12; total += 1) {
    for (let index = 0; index < total; index += 1) {
      assert.deepEqual(derivedBoardPosition(index, total), derivedBoardPosition(index, total));
    }
  }
});

test("derived layout: all positions stay inside the margin box", () => {
  for (let total = 1; total <= 16; total += 1) {
    for (let index = 0; index < total; index += 1) {
      const { x, y } = derivedBoardPosition(index, total);
      assert.ok(x >= TACTICAL_BOARD_MARGIN && x <= TACTICAL_BOARD_WIDTH - TACTICAL_BOARD_MARGIN);
      assert.ok(y >= TACTICAL_BOARD_MARGIN && y <= TACTICAL_BOARD_HEIGHT - TACTICAL_BOARD_MARGIN);
    }
  }
});

test("derived layout: out-of-range indexes are typed range errors", () => {
  assert.throws(() => derivedBoardPosition(0, 0), RangeError);
  assert.throws(() => derivedBoardPosition(1, 1), RangeError);
  assert.throws(() => derivedBoardPosition(-1, 3), RangeError);
});

test("tactical adapter: board constants and entity records in snapshot order", () => {
  const snapshot = ingestionShapedSnapshot();
  const model = tacticalRenderModel(snapshot);
  assert.equal(model.kind, "tactical");
  assert.equal(model.board.width, TACTICAL_BOARD_WIDTH);
  assert.equal(model.board.height, TACTICAL_BOARD_HEIGHT);
  assert.equal(model.board.coordinateSystem, "derived-layout");
  assert.deepEqual(
    model.board.entities.map((e) => e.entityId),
    [...snapshot.entities],
  );
  const [first, second] = model.board.entities;
  assert.deepEqual([first?.x, first?.y], [40, 40]);
  assert.deepEqual([second?.x, second?.y], [960, 40]);
});

test("tactical adapter: confidence attaches ONLY when an uncertainty subject matches", () => {
  const snapshot = fixtureSnapshot();
  const model = tacticalRenderModel(snapshot);
  const ball = model.board.entities.find((e) => e.entityId === "entity:ball");
  const home = model.board.entities.find((e) => e.entityId === "entity:home-1");
  assert.equal(ball?.confidence, 0.5);
  assert.equal(home?.confidence, undefined);
  assert.ok(home !== undefined && !("confidence" in home));
  const evt2 = model.timeline.events.find((e) => e.eventId === "evt:e2");
  const evt1 = model.timeline.events.find((e) => e.eventId === "evt:e1");
  assert.equal(evt2?.confidence, 0.77);
  assert.ok(evt1 !== undefined && !("confidence" in evt1));
});

test("tactical adapter: ingestion-shaped uncertainty never fires the attach rule", () => {
  const model = tacticalRenderModel(ingestionShapedSnapshot());
  for (const entity of model.board.entities) {
    assert.ok(!("confidence" in entity));
  }
  for (const event of model.timeline.events) {
    assert.ok(!("confidence" in event));
  }
});

test("tactical adapter: timeline is the record's own order with sequence and anchor", () => {
  const snapshot = fixtureSnapshot();
  const model = tacticalRenderModel(snapshot);
  assert.equal(model.timeline.anchor, snapshot.provenance.capturedAt);
  assert.equal(model.timeline.anchorSource, "snapshot-provenance");
  assert.deepEqual(
    model.timeline.events.map((e) => [e.eventId, e.sequence]),
    [
      ["evt:e1", 0],
      ["evt:e2", 1],
      ["evt:e3", 2],
    ],
  );
});

test("tactical adapter: a confidence outside [0, 1] is a typed refusal", () => {
  const bad = fixtureSnapshot({
    uncertainty: [{ subject: "obs:bad", confidence: 1.5 }],
  });
  assert.throws(() => tacticalRenderModel(bad), RenderInputError);
  const badProvenance = fixtureSnapshot({
    provenance: { ...fixtureSnapshot().provenance, confidence: -0.1 },
  });
  assert.throws(() => tacticalRenderModel(badProvenance), RenderInputError);
  try {
    tacticalRenderModel(bad);
  } catch (error) {
    assert.ok(error instanceof RenderInputError);
    assert.equal((error as RenderInputError).detail, "invalid-input:confidence:obs:bad:1.5");
  }
});

test("tactical adapter: domain-agnostic — a second synthetic domain projects identically in shape", () => {
  const football = tacticalRenderModel(fixtureSnapshot());
  const factory = tacticalRenderModel(
    fixtureSnapshot({
      domain: "factory-line",
      entities: ["entity:arm-1"],
      events: ["evt:cycle-start"],
    }),
  );
  assert.equal(factory.kind, "tactical");
  assert.equal(factory.source.domain, "factory-line");
  assert.deepEqual(
    factory.board.entities.map((e) => e.x),
    [TACTICAL_BOARD_WIDTH / 2],
  );
  assert.equal(football.board.coordinateSystem, factory.board.coordinateSystem);
});
