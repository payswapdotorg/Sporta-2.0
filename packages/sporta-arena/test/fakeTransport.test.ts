import assert from "node:assert/strict";
import { test } from "node:test";
import type { EscalationLifecycle } from "../src/domain/escalation.js";
import { InMemoryArenaTransport } from "../src/adapters/fakeTransport.js";
import { fixtureEscalationRecord } from "./fixtures.js";

const FULL_CHAIN: readonly EscalationLifecycle[] = [
  "created",
  "triaged",
  "matching",
  "offered",
  "accepted",
  "session_ready",
  "in_progress",
  "submitted",
  "validating",
  "accepted_result",
  "closed",
];

test("fake transport advances the full lifecycle created -> closed", async () => {
  const transport = new InMemoryArenaTransport({
    now: () => "2026-01-01T00:00:00.000Z",
  });
  const escalation = fixtureEscalationRecord();
  await transport.submit({ escalation, contextRefs: ["wg:fixture"] });
  const walked: EscalationLifecycle[] = [];
  for (let step = 0; step < 20; step += 1) {
    const current = await transport.advance(escalation.escalationId);
    if (walked.at(-1) === current) break;
    walked.push(current);
  }
  assert.deepEqual(walked, FULL_CHAIN.slice(1));
});

test("fake transport produces the result at submitted with learning artifact refs", async () => {
  const transport = new InMemoryArenaTransport({
    now: () => "2026-01-01T00:00:00.000Z",
  });
  const escalation = fixtureEscalationRecord();
  await transport.submit({ escalation, contextRefs: ["wg:fixture"] });

  const beforeSubmission = await transport.status(escalation.escalationId);
  assert.equal(beforeSubmission?.result, null);

  const reached = await transport.advance(escalation.escalationId, 7); // -> submitted
  assert.equal(reached, "submitted");
  const status = await transport.status(escalation.escalationId);
  const result = status?.result;
  assert.ok(result !== null && result !== undefined);
  assert.equal(result.resultId, `res:${escalation.escalationId}`);
  assert.equal(result.provenance.sourceKind, "arena-session");
  assert.equal(result.provenance.capturedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.validated, false); // Arena does not claim Sporta-side validation
  assert.equal(result.learningArtifactRefs.length, 1);
  assert.match(result.payloadHash, /^[0-9a-f]{64}$/);
  assert.equal(result.resultType, "unblock"); // compatible with sessionMode "unblock"
});

test("fake transport outcome option drives the rejected branch", async () => {
  const transport = new InMemoryArenaTransport({ outcome: "rejected" });
  const escalation = fixtureEscalationRecord();
  await transport.submit({ escalation, contextRefs: [] });
  const walked: EscalationLifecycle[] = [];
  for (let step = 0; step < 20; step += 1) {
    const current = await transport.advance(escalation.escalationId);
    if (walked.at(-1) === current) break;
    walked.push(current);
  }
  assert.deepEqual(walked, [
    ...FULL_CHAIN.slice(1, 9), // triaged .. validating
    "rejected",
    "closed",
  ]);
});

test("fake transport submit is idempotent per escalation", async () => {
  const transport = new InMemoryArenaTransport();
  const escalation = fixtureEscalationRecord();
  await transport.submit({ escalation, contextRefs: ["wg:fixture"] });
  await transport.submit({ escalation, contextRefs: ["wg:fixture"] });
  assert.equal(transport.submissions().length, 1);
});

test("fake transport status is null for an unknown escalation", async () => {
  const transport = new InMemoryArenaTransport();
  assert.equal(await transport.status("esc:never-submitted"), null);
  await assert.rejects(() => transport.advance("esc:never-submitted"), /unknown escalation/);
});
