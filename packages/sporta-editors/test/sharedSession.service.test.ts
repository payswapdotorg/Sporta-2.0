import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EditorRightsRefusalError,
  SharedSessionAdmissionError,
  SharedSessionClosedError,
  UnknownSharedSessionError,
  sha256EditorHash,
} from "../src/contract.js";
import type { PolicySet } from "@sporta/contracts/contract";
import {
  CHECKPOINT_POLICY,
  NO_EDIT_POLICY,
  fixture,
  openSession,
  seedRevision,
} from "./sharedSessionFixtures.js";

/**
 * W6A service laws, part 1 — open/join/heartbeat and the typed
 * refusals at the service boundary. The level-3 lifecycle runs over the
 * REAL broker and REAL pure-domain coordination on fixture stores.
 * EVIDENCE CLASS: FIXTURE (in-memory stores, fixture adapters, fixed
 * clock); every rights/coordination law is still the real domain code.
 * The save/close lifecycle laws live in
 * sharedSession.lifecycle.test.ts.
 */

test("open: resolve + checkpoint + admission — the opener is participant #1, the head is the checkpoint", async () => {
  const { service, artifacts } = fixture({ withHistoryRead: true });
  const revisionId = await seedRevision(artifacts, "rev:w6a-1", CHECKPOINT_POLICY);
  const record = await openSession(service, revisionId, "ss:w6a-1");
  assert.equal(record.sessionId, "ss:w6a-1");
  assert.equal(record.integrationLevel, 3);
  assert.equal(record.state, "open");
  assert.equal(record.underlyingEditorSessionId, "ss:w6a-1#es");
  assert.equal(record.artifactRef.checkpointRevisionId, revisionId);
  assert.deepEqual(record.admission.policy, CHECKPOINT_POLICY);
  assert.equal(record.participants.length, 1);
  assert.equal(record.participants[0]?.participantId, "user:opener");
  assert.deepEqual(record.participants[0]?.effectiveUsages, ["edit", "render"]);
  assert.equal(record.resolution.editorId, "kdenlive");
  // the underlying broker session really exists (checkpoint + rights owner)
  const coordination = await service.broadcastDelta({
    sessionId: "ss:w6a-1",
    participantId: "user:opener",
    baseRevisionId: revisionId,
    operations: ["set /clips"],
  });
  assert.equal(coordination.entry.sequence, 1);
});

test("open: idempotent per session id — a retry returns the SAME record", async () => {
  const { service, artifacts } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-2", CHECKPOINT_POLICY);
  const first = await openSession(service, revisionId, "ss:w6a-2");
  const retry = await openSession(service, revisionId, "ss:w6a-2");
  assert.deepEqual(retry, first);
});

test("open: refusals propagate typed and leave NO shared-session trace (the admission gate, then the broker's own gates)", async () => {
  const { service, artifacts, sharedStore } = fixture();
  // (a) a checkpoint revision whose rights do not carry "edit": the
  // level-3 admission gate refuses FIRST (fail-closed, no broker
  // session is even opened) — a participant never gains rights the
  // checkpoint revision does not carry.
  const noEditRevision = await seedRevision(artifacts, "rev:w6a-noedit", NO_EDIT_POLICY);
  await assert.rejects(
    () => openSession(service, noEditRevision, "ss:w6a-noedit"),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionAdmissionError);
      assert.ok(error.detail.includes("checkpoint=rev:w6a-noedit"));
      return true;
    },
  );
  assert.equal(await sharedStore.findSession("ss:w6a-noedit"), null);
  // (b) a checkpoint that permits edit but a SESSION policy that does
  // not: the broker's own W1 gate refuses typed (EditorRightsRefusalError
  // propagates through the shared open), still leaving no trace.
  const goodRevision = await seedRevision(artifacts, "rev:w6a-badpolicy", CHECKPOINT_POLICY);
  const noEditSessionPolicy: PolicySet = {
    rights: { holders: ["holder:w6a"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
  await assert.rejects(
    () => openSession(service, goodRevision, "ss:w6a-badpolicy", { policy: noEditSessionPolicy }),
    (error: unknown) => {
      assert.ok(error instanceof EditorRightsRefusalError);
      return true;
    },
  );
  assert.equal(await sharedStore.findSession("ss:w6a-badpolicy"), null);
  // (the broker's W1 law already refused before creating its session
  // record — its own store stayed untouched; here we assert the
  // shared-session plane kept no trace of either refusal)
  assert.equal(await sharedStore.findSession("ss:w6a-noedit"), null);
  assert.equal(await sharedStore.findCoordination("ss:w6a-badpolicy"), null);
});

test("join: the rights gate is fail-closed; unknown sessions and closed sessions are typed", async () => {
  const { service, artifacts } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-3", CHECKPOINT_POLICY);
  await openSession(service, revisionId, "ss:w6a-3");
  const joined = await service.joinSharedSession({
    sessionId: "ss:w6a-3",
    participantId: "user:b",
    capabilities: ["live"],
    usage: { usages: ["edit", "derive"] },
  });
  assert.deepEqual(joined.participants[1]?.effectiveUsages, ["edit", "derive"]);
  await assert.rejects(
    () =>
      service.joinSharedSession({
        sessionId: "ss:w6a-3",
        participantId: "user:c",
        usage: { usages: [] },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionAdmissionError);
      assert.ok(error.detail.includes("usage-context-empty"));
      return true;
    },
  );
  await assert.rejects(
    () =>
      service.joinSharedSession({
        sessionId: "ss:ghost",
        participantId: "user:c",
        usage: { usages: ["edit"] },
      }),
    (error: unknown) => {
      assert.ok(error instanceof UnknownSharedSessionError);
      return true;
    },
  );
});
test("broadcast: a left participant is refused typed; a closed session refuses broadcasts", async () => {
  const { service, artifacts } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-5", CHECKPOINT_POLICY);
  await openSession(service, revisionId, "ss:w6a-5");
  await service.joinSharedSession({
    sessionId: "ss:w6a-5",
    participantId: "user:b",
    usage: { usages: ["edit"] },
  });
  await service.leaveSharedSession({
    sessionId: "ss:w6a-5",
    participantId: "user:b",
    reason: "disconnected",
  });
  await assert.rejects(
    () =>
      service.broadcastDelta({
        sessionId: "ss:w6a-5",
        participantId: "user:b",
        baseRevisionId: revisionId,
        operations: [],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionAdmissionError);
      assert.ok(error.detail.includes("not-live:user:b"));
      return true;
    },
  );
  await service.closeSharedSession({
    sessionId: "ss:w6a-5",
    changedProjectHash: sha256EditorHash("final"),
    projectFormat: "kdenlive",
    projectState: { clips: [1] },
    externalTool: { name: "kdenlive", version: "24.08.0" },
  });
  await assert.rejects(
    () =>
      service.broadcastDelta({
        sessionId: "ss:w6a-5",
        participantId: "user:opener",
        baseRevisionId: revisionId,
        operations: [],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionClosedError);
      return true;
    },
  );
});

test("heartbeat: refreshes the live participant's lastHeartbeatAt from the injected clock", async () => {
  const { service, artifacts, clock } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-10", CHECKPOINT_POLICY);
  await openSession(service, revisionId, "ss:w6a-10");
  clock.advance(5_000);
  const beat = await service.heartbeatSharedSession({
    sessionId: "ss:w6a-10",
    participantId: "user:opener",
  });
  assert.equal(beat.presence[0]?.lastHeartbeatAt, "2026-10-01T00:00:05.000Z");
  assert.equal(beat.presence[0]?.joinedAt, "2026-10-01T00:00:00.000Z");
});
