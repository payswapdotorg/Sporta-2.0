/**
 * W9A-3 — the model lane FIXTURE adapter tests.
 *
 * EVIDENCE CLASS: FIXTURE — the adapter under test is the labeled
 * fixture lane (deterministic, no provider, no credentials). These
 * tests pin the adapter's HONESTY contract: evidence grade "fixture",
 * cost null, typed refusals, deterministic output.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { FixtureTransformModelAdapter } from "../src/contract.js";
import { eventStreamBytes } from "./helpers.js";

const modelLane = new FixtureTransformModelAdapter();

test("the fixture model lane labels itself fixture-grade with null cost", async () => {
  const result = await modelLane.invokeModel({
    modelRef: { name: "fixture-event-summer", digest: `sha256:${"6".repeat(64)}` },
    prompt: new TextDecoder().decode(eventStreamBytes()),
    parameters: {},
  });
  assert.equal(result.evidenceGrade, "fixture", "the grade is the adapter's honesty contract");
  assert.equal(result.providerId, "fixture:model-lane");
  assert.equal(result.cost, null, "no real provider ran, so no cost is fabricated");
  assert.equal(result.refusal, null);
  assert.ok(result.output !== null);
  assert.ok(result.timingMs >= 0);
  assert.match(result.detail, /fixture-grade/);
});

test("the fixture model output is a deterministic function of the prompt", async () => {
  const prompt = new TextDecoder().decode(eventStreamBytes());
  const first = await modelLane.invokeModel({
    modelRef: { name: "fixture-event-summer", digest: `sha256:${"6".repeat(64)}` },
    prompt,
    parameters: {},
  });
  const second = await modelLane.invokeModel({
    modelRef: { name: "fixture-event-summer", digest: `sha256:${"6".repeat(64)}` },
    prompt,
    parameters: {},
  });
  assert.equal(first.output, second.output, "same prompt, same output — deterministic");
  const summary = JSON.parse(first.output ?? "{}") as {
    eventCount: number;
    entityCounts: Record<string, number>;
    fixture: boolean;
  };
  assert.equal(summary.eventCount, 5);
  assert.deepEqual(summary.entityCounts, { "team-A": 3, "team-B": 2 });
  assert.equal(summary.fixture, true, "the output itself is labeled fixture");
});

test("a malformed prompt is a typed refusal (unsupported-operation), never garbage output", async () => {
  const result = await modelLane.invokeModel({
    modelRef: { name: "fixture-event-summer", digest: `sha256:${"6".repeat(64)}` },
    prompt: "this is not ndjson",
    parameters: {},
  });
  assert.equal(result.output, null);
  assert.equal(result.refusal?.kind, "unsupported-operation");
  assert.match(result.refusal?.detail ?? "", /NDJSON event-stream prompt/);
});

test("a forced refusal is a typed refusal carrying the forced kind", async () => {
  const result = await modelLane.invokeModel({
    modelRef: { name: "fixture-event-summer", digest: `sha256:${"6".repeat(64)}` },
    prompt: new TextDecoder().decode(eventStreamBytes()),
    parameters: { forceRefusal: "quota-exhausted" },
  });
  assert.equal(result.output, null);
  assert.equal(result.refusal?.kind, "quota-exhausted");
  assert.equal(result.evidenceGrade, "fixture");
});
