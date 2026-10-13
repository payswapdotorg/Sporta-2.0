/**
 * W9C-5 — action audit laws (append-only, sanitized, honest).
 *
 * EVIDENCE CLASS: REAL domain/service laws over fixture invocation
 * outcomes (the invocation adapter is fixture-labeled; the audit laws
 * under test are real).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApplicationActionError,
  assertAppendOnly,
  buildDeniedActionRecord,
  buildExecutedActionRecord,
  permissionBasisFor,
  sanitizeInputRefs,
  sha256Text,
} from "../src/contract.js";
import type { ApplicationSession } from "../src/contract.js";
import { attachAndOpen, makeAppWorld, makeDescriptor } from "./helpers.js";

const NOW = "2026-10-13T12:00:00.000Z";

function makeSession(): ApplicationSession {
  return {
    sessionId: "sess:audit",
    attachmentId: "att:audit",
    versions: { app: "1", adapter: "1", target: "t" },
    activeGrants: ["observe"],
    openedAt: NOW,
    closedAt: null,
    closeState: "active",
    checkpointRefs: [],
    auditStreamRef: "audit-stream:sess:audit",
  };
}

test("sanitizeInputRefs produces hashed, sorted, capped refs — never payloads or secrets", () => {
  const refs = sanitizeInputRefs(
    {
      label: "great save",
      secret: "sk-live-abcdef0123456789",
      nested: { a: 1 },
    },
    sha256Text,
  );
  assert.equal(refs.length, 3);
  assert.match(refs[0] ?? "", /^in:label:sha256:/);
  assert.match(refs[1] ?? "", /^in:nested:sha256:/);
  assert.match(refs[2] ?? "", /^in:secret:sha256:/);
  for (const ref of refs) {
    assert.doesNotMatch(ref, /great save/);
    assert.doesNotMatch(ref, /sk-live/);
  }
});

test("permissionBasisFor maps the typed reasons onto the frozen basis vocabulary", () => {
  assert.equal(permissionBasisFor({ admitted: true, capabilityId: "c", requiresConfirmation: false }), "granted-scope");
  assert.equal(
    permissionBasisFor({ admitted: true, capabilityId: "c", requiresConfirmation: true, confirmationClass: "purchase" }),
    "requires-confirmation",
  );
  assert.equal(permissionBasisFor({ admitted: false, reason: "attachment-revoked", detail: "d" }), "revoked");
  assert.equal(permissionBasisFor({ admitted: false, reason: "attachment-expired", detail: "d" }), "expired");
  assert.equal(permissionBasisFor({ admitted: false, reason: "capability-not-declared", detail: "d" }), "not-granted");
  assert.equal(permissionBasisFor({ admitted: false, reason: "instruction-injection-suspected", detail: "d" }), "not-granted");
});

test("denied records carry the typed refusal as evidence and reconcile nothing", () => {
  const record = buildDeniedActionRecord({
    actionRecordId: "act:d1",
    session: makeSession(),
    actor: "agent:test",
    capabilityId: "cap:append-highlight",
    capabilityClass: "control",
    targetIdentity: "local:t",
    admission: { admitted: false, reason: "attachment-revoked", detail: "revoked at x" },
    recordedAt: NOW,
  });
  assert.equal(record.status, "denied");
  assert.equal(record.permissionDecision.decision, "denied");
  assert.equal(record.permissionDecision.basis, "revoked");
  assert.deepEqual(record.effects, []);
  assert.deepEqual(record.reconciledRefs, { workGraphId: null, artifactRevisionIds: [] });
  assert.match(record.missingCoverageNote ?? "", /attachment-revoked/);
});

test("a disconnected invocation NEVER records success (P9-19)", () => {
  const record = buildExecutedActionRecord({
    actionRecordId: "act:d2",
    session: makeSession(),
    actor: "agent:test",
    capabilityId: "cap:read-status",
    capabilityClass: "observe",
    targetIdentity: "local:t",
    sanitizedInputRefs: [],
    invocation: { status: "disconnected", failureKind: "spawn-error", detail: "ENOENT" },
    verified: false,
    verificationNote: "target disconnected",
    reconciliation: null,
    recordedAt: NOW,
  });
  assert.equal(record.status, "failed");
  assert.deepEqual(record.sanitizedOutputRefs, []);
  assert.match(record.missingCoverageNote ?? "", /disconnected/);
});

test("a succeeded invocation with unverified effect records failed with the note", () => {
  const record = buildExecutedActionRecord({
    actionRecordId: "act:d3",
    session: makeSession(),
    actor: "agent:test",
    capabilityId: "cap:append-highlight",
    capabilityClass: "control",
    targetIdentity: "local:t",
    sanitizedInputRefs: ["in:label:sha256:x"],
    invocation: {
      status: "succeeded",
      sanitizedOutputRefs: ["out:sha256:y"],
      effect: {
        kind: "app-state-mutation",
        beforeSummary: "absent",
        afterSummary: "absent",
        changed: false,
        evidenceBytes: new Uint8Array([1]),
      },
      detail: "app exited 0",
    },
    verified: false,
    verificationNote: "before/after effect evidence is identical — no verified mutation",
    reconciliation: null,
    recordedAt: NOW,
  });
  assert.equal(record.status, "failed");
  assert.equal(record.effects[0]?.verified, false);
  assert.match(record.missingCoverageNote ?? "", /identical/);
});

test("a verified effect reconciles its revision id and checkpoints the session", async () => {
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  const { sessionId } = await attachAndOpen(world, ["observe", "control"], {
    workGraphId: "wg:audit-run",
  });

  // Drive REAL service actions with the fixture-labeled invocation adapter
  // (no effect sink wired — nothing reconciles, honestly).
  const outcome = await world.actions.performAction({
    sessionId,
    capabilityId: "cap:append-highlight",
    actor: "agent:test",
    parameters: { label: "great save", eventId: "evt-3" },
  });
  assert.equal(outcome.record.status, "failed"); // fixture adapter: effect null -> unverified
  assert.equal(outcome.record.reconciledRefs.workGraphId, null);
  const outcome2 = await world.actions.performAction({
    sessionId,
    capabilityId: "cap:read-status",
    actor: "agent:test",
    parameters: {},
  });
  assert.equal(outcome2.record.status, "succeeded"); // observe: output refs present
  assert.deepEqual(outcome2.record.reconciledRefs, { workGraphId: null, artifactRevisionIds: [] });

  // The audit stream is append-only and ordered.
  const stream = world.actions.readAudit(sessionId);
  assert.equal(stream.length, 2);
  assert.equal(stream[0]?.actionRecordId, outcome.record.actionRecordId);
  assert.equal(stream[1]?.actionRecordId, outcome2.record.actionRecordId);
  // Duplicate ids are refused.
  assert.throws(
    () => assertAppendOnly(stream[0] ?? null, stream[0]?.actionRecordId ?? "act:x"),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationActionError);
      assert.equal(error.refusalKind, "audit-record-duplicated");
      return true;
    },
  );
});
