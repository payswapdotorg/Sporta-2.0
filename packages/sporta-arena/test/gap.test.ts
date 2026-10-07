import assert from "node:assert/strict";
import { test } from "node:test";
import { ArenaClientService } from "../src/app/arenaClient.js";
import { GapConflictError } from "../src/domain/errors.js";
import { fixtureEscalateInput, fixtureGapInput, SpyTransport } from "./fixtures.js";

test("recordGap is idempotent per gapId: identical retry returns the same record", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  const input = fixtureGapInput();
  const first = await client.recordGap(input);
  const second = await client.recordGap(input);
  assert.deepEqual(first, second);
  assert.equal(first.gapId, "gap:fixture");
  assert.equal(first.status, "open");
  assert.deepEqual(first.contextRefs, ["run:fixture"]);
});

test("recordGap: same gapId with different content is a typed conflict", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  await client.recordGap(fixtureGapInput());
  await assert.rejects(
    () => client.recordGap(fixtureGapInput({ capabilityNeed: "different-need" })),
    GapConflictError,
  );
});

test("recordGap without gapId assigns distinct auto ids (non-idempotent by design)", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  const auto = fixtureGapInput();
  delete auto.gapId;
  const first = await client.recordGap(auto);
  const second = await client.recordGap(auto);
  assert.notEqual(first.gapId, second.gapId);
  assert.match(first.gapId, /^gap:auto:1$/);
  assert.match(second.gapId, /^gap:auto:2$/);
});

test("recordGap retry after escalation returns the current (progressed) record", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  const gap = await client.recordGap(fixtureGapInput());
  await client.escalate(fixtureEscalateInput({ gapId: gap.gapId }));
  const retried = await client.recordGap(fixtureGapInput());
  assert.equal(retried.gapId, gap.gapId);
  assert.equal(retried.status, "escalated");
});
