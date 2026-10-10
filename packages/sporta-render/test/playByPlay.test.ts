import assert from "node:assert/strict";
import { test } from "node:test";
import { RenderInputError, playByPlayRenderModel, playByPlayTranscript } from "../src/contract.js";
import { fixtureSnapshot, ingestionShapedSnapshot } from "./fixtures.js";

/**
 * The play-by-play reality battery (adapter + rule-based phrasing
 * engine).
 *
 * EVIDENCE LABEL: FIXTURE inputs (labeled in fixtures.ts); the pure
 * projections and the rule-based phrase templates run FOR REAL under
 * node:test (REAL: deterministic execution, real outputs; NO ML is
 * involved anywhere — the engine is a fixed ordered rule set).
 */

test("play-by-play: one record per event, in the record's own order", () => {
  const snapshot = fixtureSnapshot();
  const model = playByPlayRenderModel(snapshot);
  assert.equal(model.kind, "play-by-play");
  assert.deepEqual(
    model.records.map((r) => [r.eventId, r.sequence]),
    [
      ["evt:e1", 0],
      ["evt:e2", 1],
      ["evt:e3", 2],
    ],
  );
  for (const record of model.records) {
    assert.equal(record.capturedAt, snapshot.provenance.capturedAt);
    assert.equal(record.capturedAtSource, "snapshot-provenance");
  }
});

test("play-by-play: every phrase is traceable to the event id it derives from", () => {
  const snapshot = fixtureSnapshot();
  const model = playByPlayRenderModel(snapshot);
  for (const record of model.records) {
    assert.ok(record.phrases.length >= 2);
    for (const phrase of record.phrases) {
      assert.equal(phrase.anchoredEventId, record.eventId);
      assert.ok(phrase.text.includes(record.eventId));
      assert.ok(phrase.text.length > 0);
      assert.ok(phrase.derivedFields.length > 0);
    }
  }
});

test("play-by-play: the ordered rule set produces exactly the applicable phrases", () => {
  const model = playByPlayRenderModel(fixtureSnapshot());
  const e1 = model.records.find((r) => r.eventId === "evt:e1");
  const e2 = model.records.find((r) => r.eventId === "evt:e2");
  assert.deepEqual(
    e1?.phrases.map((p) => p.templateId),
    ["event-sequence", "event-anchor"],
  );
  assert.deepEqual(
    e2?.phrases.map((p) => p.templateId),
    ["event-sequence", "event-anchor", "event-confidence"],
  );
  assert.equal(e2?.confidence, 0.77);
  assert.ok(e1 !== undefined && !("confidence" in e1));
});

test("play-by-play: phrase texts carry only record-derived facts", () => {
  const snapshot = fixtureSnapshot();
  const model = playByPlayRenderModel(snapshot);
  const [first] = model.records;
  assert.equal(first?.eventId, "evt:e1");
  const sequencePhrase = first?.phrases[0]?.text;
  assert.equal(sequencePhrase, "Event evt:e1 recorded at sequence 1 of 3 in domain football.");
  const anchorPhrase = first?.phrases[1]?.text;
  assert.equal(
    anchorPhrase,
    "Event evt:e1 is anchored to the snapshot capture time 2026-10-10T12:00:00.000Z (snapshot provenance; per-event timestamps are not carried by the world model).",
  );
  const confidencePhrase = model.records[1]?.phrases[2]?.text;
  assert.equal(confidencePhrase, "Event evt:e2 carries recorded confidence 0.77.");
  assert.deepEqual(first?.phrases[0]?.derivedFields, ["events", "domain"]);
  assert.deepEqual(first?.phrases[1]?.derivedFields, ["provenance.capturedAt"]);
  assert.deepEqual(model.records[1]?.phrases[2]?.derivedFields, ["uncertainty"]);
});

test("play-by-play: the honesty note about per-event timestamps is stated in the text itself", () => {
  const model = playByPlayRenderModel(fixtureSnapshot());
  for (const record of model.records) {
    const anchor = record.phrases.find((p) => p.templateId === "event-anchor");
    assert.ok(anchor !== undefined);
    assert.ok(anchor.text.includes("per-event timestamps are not carried by the world model"));
  }
});

test("play-by-play: ingestion-shaped uncertainty produces no confidence phrases", () => {
  const model = playByPlayRenderModel(ingestionShapedSnapshot());
  for (const record of model.records) {
    assert.ok(!record.phrases.some((p) => p.templateId === "event-confidence"));
    assert.ok(!("confidence" in record));
  }
});

test("play-by-play: deterministic — identical snapshot, byte-identical model and transcript", () => {
  const one = playByPlayRenderModel(fixtureSnapshot());
  const two = playByPlayRenderModel(fixtureSnapshot());
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  assert.equal(playByPlayTranscript(one), playByPlayTranscript(two));
});

test("play-by-play: the transcript is one line per record, phrases joined by a single space", () => {
  const model = playByPlayRenderModel(fixtureSnapshot());
  const transcript = playByPlayTranscript(model);
  const lines = transcript.split("\n");
  assert.equal(lines.length, model.records.length);
  const [first] = model.records;
  assert.equal(lines[0], first?.phrases.map((p) => p.text).join(" "));
});

test("play-by-play: domain-agnostic phrasing — only the domain token changes across domains", () => {
  const football = playByPlayRenderModel(fixtureSnapshot({ domain: "football" }));
  const marathon = playByPlayRenderModel(fixtureSnapshot({ domain: "city-marathon" }));
  const footballText = football.records.map((r) => r.phrases[0]?.text).join("\n");
  const marathonText = marathon.records.map((r) => r.phrases[0]?.text).join("\n");
  assert.equal(footballText.replaceAll("football", "city-marathon"), marathonText);
  assert.deepEqual(
    football.records.flatMap((r) => r.phrases.map((p) => p.templateId)),
    marathon.records.flatMap((r) => r.phrases.map((p) => p.templateId)),
  );
});

test("play-by-play: empty events produce an empty, honest narrative", () => {
  const model = playByPlayRenderModel(fixtureSnapshot({ events: [] }));
  assert.deepEqual(model.records, []);
  assert.equal(playByPlayTranscript(model), "");
});

test("play-by-play: a confidence outside [0, 1] is a typed refusal", () => {
  const bad = fixtureSnapshot({
    uncertainty: [{ subject: "obs:bad", confidence: 2 }],
  });
  assert.throws(() => playByPlayRenderModel(bad), RenderInputError);
});

test("play-by-play: output is frozen (read-only carry-forward law)", () => {
  const model = playByPlayRenderModel(fixtureSnapshot());
  assert.throws(() => {
    (model.records[0] as { eventId: string }).eventId = "evt:invented";
  }, TypeError);
});
