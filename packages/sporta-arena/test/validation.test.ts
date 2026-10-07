import assert from "node:assert/strict";
import { test } from "node:test";
import type { ArenaResultRecord } from "@sporta/contracts/contract";
import { ArenaClientService } from "../src/app/arenaClient.js";
import { ScriptedTransport } from "./fixtures.js";
import { fixtureEscalateInput, fixtureGapInput } from "./fixtures.js";

async function setupClient(): Promise<{
  client: ArenaClientService;
  escalationId: string;
}> {
  const transport = new ScriptedTransport();
  const client = new ArenaClientService({ transport });
  await client.recordGap(fixtureGapInput());
  const record = await client.escalate(fixtureEscalateInput());
  return { client, escalationId: record.escalationId };
}

function wellFormedResult(escalationId: string): ArenaResultRecord {
  return {
    resultId: "res:fixture",
    escalationId,
    resultType: "unblock",
    payloadHash: "a".repeat(64),
    validated: false,
    learningArtifactRefs: [],
    provenance: {
      sourceKind: "arena-session",
      sourceRef: escalationId,
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

test("validateResult accepts a well-formed arena-session result for a matching session mode", async () => {
  const { client, escalationId } = await setupClient();
  const verdict = await client.validateResult(wellFormedResult(escalationId));
  assert.equal(verdict.accepted, true);
  assert.deepEqual(
    verdict.checks.map((check) => check.check),
    [
      "payload-hash-present",
      "provenance-source-kind",
      "escalation-known",
      "result-type-session-mode",
    ],
  );
  assert.equal(
    verdict.checks.every((check) => check.passed),
    true,
  );
});

test("validateResult fails on a missing payload hash", async () => {
  const { client, escalationId } = await setupClient();
  const result = wellFormedResult(escalationId);
  const verdict = await client.validateResult({ ...result, payloadHash: "" });
  assert.equal(verdict.accepted, false);
  assert.equal(
    verdict.checks.find((check) => check.check === "payload-hash-present")?.passed,
    false,
  );
});

test("validateResult fails on a malformed payload hash", async () => {
  const { client, escalationId } = await setupClient();
  const result = wellFormedResult(escalationId);
  const verdict = await client.validateResult({ ...result, payloadHash: "not-a-hash" });
  assert.equal(verdict.accepted, false);
});

test("validateResult fails on wrong provenance source kind", async () => {
  const { client, escalationId } = await setupClient();
  const result = wellFormedResult(escalationId);
  const verdict = await client.validateResult({
    ...result,
    provenance: { ...result.provenance, sourceKind: "agent-run" },
  });
  assert.equal(verdict.accepted, false);
  assert.equal(
    verdict.checks.find((check) => check.check === "provenance-source-kind")?.passed,
    false,
  );
});

test("validateResult fails on a result type mismatched with the escalation session mode", async () => {
  const { client, escalationId } = await setupClient();
  // session mode "unblock" expects unblock/solution/correction — not knowledge-patch
  const result = wellFormedResult(escalationId);
  const verdict = await client.validateResult({ ...result, resultType: "knowledge-patch" });
  assert.equal(verdict.accepted, false);
  assert.equal(
    verdict.checks.find((check) => check.check === "result-type-session-mode")?.passed,
    false,
  );
});

test("validateResult fails on an unknown escalation", async () => {
  const { client } = await setupClient();
  const verdict = await client.validateResult(wellFormedResult("esc:unknown"));
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.checks.find((check) => check.check === "escalation-known")?.passed, false);
});

test("validateResult is a verdict only: it never mutates records", async () => {
  const { client, escalationId } = await setupClient();
  const before = await client.escalate(fixtureEscalateInput());
  await client.validateResult(wellFormedResult(escalationId));
  const after = await client.escalate(fixtureEscalateInput());
  assert.deepEqual(before, after);
});
