import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TACTICAL_BOARD_HEIGHT,
  TACTICAL_BOARD_WIDTH,
  TACTICAL_TIMELINE_STRIP_HEIGHT,
  serializeTacticalSvg,
  tacticalRenderModel,
} from "../src/contract.js";
import { fixtureSnapshot } from "./fixtures.js";

/**
 * The tactical SVG document serializer battery.
 *
 * EVIDENCE LABEL: FIXTURE inputs (labeled in fixtures.ts); the
 * serializer executes FOR REAL under node:test in plain node — no DOM,
 * no XML library, hand-written string building only (REAL: deterministic
 * execution, real string outputs).
 */

function svgFor(): string {
  return serializeTacticalSvg(tacticalRenderModel(fixtureSnapshot()));
}

test("svg: well-formed deterministic document shell", () => {
  const svg = svgFor();
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" '));
  assert.ok(svg.endsWith("</svg>\n"));
  const canvasHeight = TACTICAL_BOARD_HEIGHT + TACTICAL_TIMELINE_STRIP_HEIGHT;
  assert.ok(svg.includes(`viewBox="0 0 ${TACTICAL_BOARD_WIDTH} ${canvasHeight}"`));
  assert.ok(svg.includes(`width="${TACTICAL_BOARD_WIDTH}"`));
  assert.ok(svg.includes(`height="${canvasHeight}"`));
  assert.equal(TACTICAL_TIMELINE_STRIP_HEIGHT, 120);
});

test("svg: title and desc carry the snapshot reference, provenance and rights forward", () => {
  const svg = svgFor();
  const model = tacticalRenderModel(fixtureSnapshot());
  assert.ok(
    svg.includes(
      `<title>Tactical board — SWM ${model.source.swmId} (${model.source.domain}) @ ${model.source.snapshotHash}</title>`,
    ),
  );
  assert.ok(
    svg.includes(
      `<desc>source ${model.provenance.sourceKind}/${model.provenance.sourceRef} captured ${model.provenance.capturedAt};`,
    ),
  );
  assert.ok(svg.includes(`rights usages [${model.rightsScope.usages.join(", ")}]`));
  assert.ok(svg.includes(`prohibitions [${model.rightsScope.prohibitions.join(", ")}]`));
  assert.ok(svg.includes(`holders [${model.rightsScope.holders.join(", ")}]`));
});

test("svg: marker faithfulness — one circle per board entity and one per timeline event", () => {
  const model = tacticalRenderModel(fixtureSnapshot());
  const svg = serializeTacticalSvg(model);
  const circles = svg.match(/<circle /g)?.length ?? 0;
  assert.equal(circles, model.board.entities.length + model.timeline.events.length);
  for (const entity of model.board.entities) {
    assert.ok(svg.includes(`>${entity.entityId}</text>`));
  }
  for (const event of model.timeline.events) {
    assert.ok(svg.includes(`>${event.eventId}</text>`));
    assert.ok(svg.includes(`#${event.sequence + 1}</text>`));
  }
  assert.ok(svg.includes(`anchor ${model.timeline.anchor} (snapshot provenance)</text>`));
});

test("svg: determinism — identical models produce byte-identical documents", () => {
  const one = serializeTacticalSvg(tacticalRenderModel(fixtureSnapshot()));
  const two = serializeTacticalSvg(tacticalRenderModel(fixtureSnapshot()));
  assert.equal(one, two);
  assert.equal(one.length, two.length);
});

test("svg: all interpolated text is XML-escaped (& < > \" ')", () => {
  const snapshot = fixtureSnapshot({
    entities: ["ent<&>\"'x"],
    events: ["ev&t<ag>"],
  });
  const svg = serializeTacticalSvg(tacticalRenderModel(snapshot));
  assert.ok(svg.includes("ent&lt;&amp;&gt;&quot;&apos;x</text>"));
  assert.ok(svg.includes("ev&amp;t&lt;ag&gt;</text>"));
  assert.ok(!svg.includes("ent<&>\"'x"));
  assert.ok(!svg.includes("ev&t<ag>"));
});

test("svg: attached confidences render as annotations", () => {
  const svg = svgFor();
  assert.ok(svg.includes(">conf 0.5</text>")); // entity:ball
  assert.ok(svg.includes(">conf 0.77</text>")); // evt:e2
});

test("svg: no confidence annotation without an attached confidence", () => {
  const snapshot = fixtureSnapshot({
    uncertainty: [{ subject: "obs:only", confidence: 0.9 }],
  });
  const svg = serializeTacticalSvg(tacticalRenderModel(snapshot));
  assert.ok(!svg.includes(">conf "));
});

test("svg: coordinates stay inside the canvas and use the 2-decimal formatting rule", () => {
  const svg = svgFor();
  for (const match of svg.matchAll(/cx="([^"]+)"/g)) {
    const x = Number(match[1]);
    assert.ok(Number.isFinite(x) && x >= 0 && x <= TACTICAL_BOARD_WIDTH);
  }
  for (const match of svg.matchAll(/cy="([^"]+)"/g)) {
    const y = Number(match[1]);
    assert.ok(
      Number.isFinite(y) && y >= 0 && y <= TACTICAL_BOARD_HEIGHT + TACTICAL_TIMELINE_STRIP_HEIGHT,
    );
  }
  for (const match of svg.matchAll(/(?:cx|cy|x1|x2|y1|y2)="(\d+\.\d+)"/g)) {
    assert.ok(match[1]!.split(".")[1]!.length <= 2, `more than 2 decimals: ${match[1]}`);
  }
});

test("svg: an empty board still renders the frame, the timeline baseline and the anchor", () => {
  const snapshot = fixtureSnapshot({ entities: [], events: [] });
  const svg = serializeTacticalSvg(tacticalRenderModel(snapshot));
  assert.ok(svg.includes("<rect "));
  assert.ok(svg.includes("anchor 2026-10-10T12:00:00.000Z (snapshot provenance)</text>"));
  assert.equal(svg.match(/<circle /g)?.length ?? 0, 0);
});

test("svg: no DOM dependency — the serializer runs in plain node (proven by execution)", () => {
  // This test file itself runs under node:test with tsx (no browser,
  // no jsdom); reaching this point already proves plain-node execution.
  assert.equal(typeof serializeTacticalSvg, "function");
});
