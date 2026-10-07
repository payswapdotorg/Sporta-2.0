import assert from "node:assert/strict";
import { test } from "node:test";
import { ArenaClientService } from "../src/app/arenaClient.js";
import { InMemoryArenaTransport } from "../src/adapters/fakeTransport.js";
import { IllegalEscalationTransitionError } from "../src/domain/errors.js";
import { ScriptedTransport, SpyTransport } from "./fixtures.js";
import { fixtureEscalateInput, fixtureGapInput } from "./fixtures.js";

test("fixture loop: gap -> escalate -> Arena advances -> readResult mirrors -> validate accepted", async () => {
  const transport = new InMemoryArenaTransport({
    now: () => "2026-01-01T00:00:00.000Z",
  });
  const client = new ArenaClientService({ transport });

  const gap = await client.recordGap(fixtureGapInput());
  assert.equal(gap.status, "open");

  const escalation = await client.escalate(
    fixtureEscalateInput({ idempotencyKey: "esc-loop-key" }),
  );
  assert.equal(escalation.lifecycle, "created");

  // nothing submitted yet: no result, mirror stays at created
  assert.equal(await client.readResult(escalation.escalationId), null);

  // the simulated Arena runs the full lifecycle
  const reached = await transport.advance(escalation.escalationId, 100);
  assert.equal(reached, "closed");

  const result = await client.readResult(escalation.escalationId);
  assert.ok(result !== null && result !== undefined);
  assert.equal(result.escalationId, escalation.escalationId);
  assert.equal(result.learningArtifactRefs.length, 1);

  const verdict = await client.validateResult(result);
  assert.equal(verdict.accepted, true);

  // the client's own record copy now mirrors the Arena lifecycle (still same id)
  const retried = await client.escalate(
    fixtureEscalateInput({ idempotencyKey: "esc-loop-key" }),
  );
  assert.equal(retried.escalationId, escalation.escalationId);
  assert.equal(retried.lifecycle, "closed");

  // the gap in the client's own store progressed open -> escalated
  const gapNow = await client.recordGap(fixtureGapInput());
  assert.equal(gapNow.status, "escalated");
});

test("readResult returns null for an escalation this client never created", async () => {
  const transport = new InMemoryArenaTransport();
  const client = new ArenaClientService({ transport });
  assert.equal(await client.readResult("esc:not-mine"), null);
});

test("readResult returns null when the transport has no status for the escalation", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  await client.recordGap(fixtureGapInput());
  const record = await client.escalate(fixtureEscalateInput());
  assert.equal(await client.readResult(record.escalationId), null);
});

test("readResult refuses an unreachable lifecycle jump with a typed error", async () => {
  const scripted = new ScriptedTransport();
  const client = new ArenaClientService({ transport: scripted });
  await client.recordGap(fixtureGapInput());
  const record = await client.escalate(fixtureEscalateInput());

  // legal multi-step mirror: created -> accepted_result is reachable
  scripted.lifecycle = "accepted_result";
  await client.readResult(record.escalationId);
  const mirrored = await client.escalate(fixtureEscalateInput());
  assert.equal(mirrored.lifecycle, "accepted_result");

  // accepted_result -> submitted is unreachable: typed refusal
  scripted.lifecycle = "submitted";
  await assert.rejects(
    () => client.readResult(record.escalationId),
    IllegalEscalationTransitionError,
  );
});
