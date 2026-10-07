import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArenaEscalationRecord } from "@sporta/contracts/contract";
import { ArenaClientService } from "../src/app/arenaClient.js";
import {
  EscalationConflictError,
  EscalationPolicyError,
  IllegalGapTransitionError,
  UnknownGapError,
} from "../src/domain/errors.js";
import {
  fixtureEscalateInput,
  fixtureGapInput,
  fixturePolicySet,
  SpyTransport,
} from "./fixtures.js";

test("escalate is idempotent per idempotencyKey: retry returns the existing record, no duplicate submission", async () => {
  const spy = new SpyTransport();
  const client = new ArenaClientService({ transport: spy });
  await client.recordGap(fixtureGapInput());
  const input = fixtureEscalateInput();
  const first = await client.escalate(input);
  const second = await client.escalate(input);
  assert.deepEqual(first, second);
  assert.equal(spy.submissions.length, 1);
  assert.equal(first.lifecycle, "created");
  assert.match(first.escalationId, /^esc:[0-9a-f]{24}$/);
});

test("escalate: same idempotencyKey with different payload is a typed conflict", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  await client.recordGap(fixtureGapInput());
  await client.escalate(fixtureEscalateInput());
  await assert.rejects(
    () => client.escalate(fixtureEscalateInput({ urgency: "critical" })),
    EscalationConflictError,
  );
});

test("escalate derives the workGraphId from the stored gap and a deterministic escalationId", async () => {
  const makeClient = () => new ArenaClientService({ transport: new SpyTransport() });
  const clientA = makeClient();
  const clientB = makeClient();
  const clientC = makeClient();
  for (const client of [clientA, clientB, clientC]) {
    await client.recordGap(fixtureGapInput());
  }
  const recordA = await clientA.escalate(fixtureEscalateInput());
  const recordB = await clientB.escalate(fixtureEscalateInput());
  const recordC = await clientC.escalate(fixtureEscalateInput({ idempotencyKey: "esc-key-other" }));
  assert.equal(recordA.workGraphId, "wg:fixture");
  assert.equal(recordA.escalationId, recordB.escalationId);
  assert.notEqual(recordA.escalationId, recordC.escalationId);
});

test("escalate refuses empty permittedActions with a typed policy error", async () => {
  const spy = new SpyTransport();
  const client = new ArenaClientService({ transport: spy });
  await client.recordGap(fixtureGapInput());
  await assert.rejects(
    () => client.escalate(fixtureEscalateInput({ permittedActions: [] })),
    EscalationPolicyError,
  );
  assert.equal(spy.submissions.length, 0);
});

test("escalate refuses an unknown gapId with a typed error", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  await client.recordGap(fixtureGapInput());
  await assert.rejects(
    () => client.escalate(fixtureEscalateInput({ gapId: "gap:missing" })),
    UnknownGapError,
  );
});

test("escalate refuses re-escalation of an already escalated gap (typed illegal transition)", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  await client.recordGap(fixtureGapInput());
  await client.escalate(fixtureEscalateInput({ idempotencyKey: "key-one" }));
  await assert.rejects(
    () => client.escalate(fixtureEscalateInput({ idempotencyKey: "key-two" })),
    IllegalGapTransitionError,
  );
});

test("boundary: the escalation record equals exactly the canonical contract shape — no leaked fields", async () => {
  const spy = new SpyTransport();
  const client = new ArenaClientService({ transport: spy });
  await client.recordGap(fixtureGapInput());
  const record = await client.escalate(fixtureEscalateInput());
  const expected: ArenaEscalationRecord = {
    escalationId: record.escalationId,
    idempotencyKey: "esc-key-fixture",
    gapId: "gap:fixture",
    tenantRef: "tenant:fixture",
    workGraphId: "wg:fixture",
    urgency: "high",
    sessionMode: "unblock",
    permittedActions: ["observe", "correct"],
    learningPermissions: { scopes: ["capability"], requireConsent: true },
    lifecycle: "created",
    policy: fixturePolicySet(),
  };
  assert.deepEqual(record, expected);
  // deepEqual with an exact object fails on any extra leaked field
  assert.equal("contextRefs" in record, false);
  assert.equal("budget" in record, false);
});

test("boundary: the record carries the budget only when supplied", async () => {
  const client = new ArenaClientService({ transport: new SpyTransport() });
  await client.recordGap(fixtureGapInput());
  const withBudget = await client.escalate(
    fixtureEscalateInput({ budget: { currency: "USD", limit: 25 } }),
  );
  assert.deepEqual(withBudget.budget, { currency: "USD", limit: 25 });
});

test("context minimization: the submission stores only the given contextRefs, nothing more", async () => {
  const spy = new SpyTransport();
  const client = new ArenaClientService({ transport: spy });
  await client.recordGap(fixtureGapInput());
  const record = await client.escalate(fixtureEscalateInput());
  const submission = spy.submissions[0];
  assert.ok(submission !== undefined);
  assert.deepEqual(submission.contextRefs, ["wg:fixture", "run:fixture"]);
  assert.deepEqual(submission.escalation, record);
  // unrelated tenant context never leaks: the gap's own refs are NOT auto-included
  assert.equal(submission.contextRefs.includes("ev:fixture"), false);
});

test("boundary: the client never writes anything besides its own store (transport only)", async () => {
  const spy = new SpyTransport();
  const client = new ArenaClientService({ transport: spy });
  await client.recordGap(fixtureGapInput());
  await client.escalate(fixtureEscalateInput());
  // the only outside interaction of the whole flow is one transport submit
  assert.equal(spy.submissions.length, 1);
  assert.equal(spy.statusCallCount, 0);
});
