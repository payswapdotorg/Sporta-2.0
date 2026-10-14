/**
 * W10-A freeze tests — the live-ingress contract surface (P10-01).
 *
 * Freeze law: the names exist, the vocabulary is closed, and the descriptor
 * validation fails closed on every invalid field. Implementation (the real
 * local HTTP adapter, run-manifest integration) is worker A's lane behind
 * these frozen names.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLiveSourceDescriptor,
  type LiveSourceDescriptor,
} from "../src/contract.js";

const valid: LiveSourceDescriptor = {
  sourceId: "live:match-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};

test("W10 freeze: live-ingress names are exported and the valid descriptor passes", () => {
  const result = validateLiveSourceDescriptor(valid);
  assert.equal(result.ok, true);
});

test("W10 freeze: empty sourceId refuses typed (fail-closed)", () => {
  const result = validateLiveSourceDescriptor({ ...valid, sourceId: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.refusal.kind, "invalid-descriptor");
    assert.match(result.refusal.detail, /sourceId/);
    assert.equal(result.refusal.framesConsumed, 0);
  }
});

test("W10 freeze: the grade vocabulary is closed — 'production' is refused", () => {
  const result = validateLiveSourceDescriptor({
    ...valid,
    grade: "production" as unknown as LiveSourceDescriptor["grade"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.refusal.kind, "invalid-descriptor");
    assert.match(result.refusal.detail, /closed vocabulary/);
  }
});

test("W10 freeze: empty contentKind refuses typed", () => {
  const result = validateLiveSourceDescriptor({ ...valid, contentKind: "" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.refusal!.detail, /contentKind/);
});

test("W10 freeze: non-positive cadenceMs refuses typed", () => {
  for (const cadenceMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateLiveSourceDescriptor({ ...valid, cadenceMs });
    assert.equal(result.ok, false, `cadenceMs=${cadenceMs} must refuse`);
    if (!result.ok) assert.match(result.refusal.detail, /cadenceMs/);
  }
});

test("W10 freeze: non-integer or non-positive queueBound refuses typed (back-pressure law)", () => {
  for (const queueBound of [0, -1, 4.5]) {
    const result = validateLiveSourceDescriptor({ ...valid, queueBound });
    assert.equal(result.ok, false, `queueBound=${queueBound} must refuse`);
    if (!result.ok) assert.match(result.refusal.detail, /queueBound/);
  }
});
