import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SharedSessionAdmissionError,
  SharedSessionConflictError,
  sha256EditorHash,
} from "../src/contract.js";
import {
  CHECKPOINT_POLICY,
  EDITOR_AVAILABILITY,
  NARROW_SESSION_POLICY,
  SESSION_POLICY,
  fixture,
  openSession,
  seedRevision,
} from "./sharedSessionFixtures.js";

/**
 * W6A service laws, part 2 — the save/close lifecycle, the optional
 * additive ports (delta sink fan-out, history-read coherence), and the
 * divergence-detection law. EVIDENCE CLASS: FIXTURE (in-memory stores,
 * fixture adapters, fixed clock); every coordination/reconcile law is
 * still the real domain + real broker code.
 */
test("broadcast: the total order grows, the sink fans out to live participants, delivery is idempotent", async () => {
  const { service, artifacts, sink } = fixture({ withSink: true });
  const revisionId = await seedRevision(artifacts, "rev:w6a-4", CHECKPOINT_POLICY);
  await openSession(service, revisionId, "ss:w6a-4");
  await service.joinSharedSession({
    sessionId: "ss:w6a-4",
    participantId: "user:b",
    usage: { usages: ["edit"] },
  });
  const first = await service.broadcastDelta({
    sessionId: "ss:w6a-4",
    participantId: "user:opener",
    baseRevisionId: revisionId,
    operations: ["set /clips"],
  });
  assert.equal(first.entry.sequence, 1);
  assert.equal(first.deduplicated, false);
  const second = await service.broadcastDelta({
    sessionId: "ss:w6a-4",
    participantId: "user:b",
    baseRevisionId: revisionId,
    operations: ["set /tracks"],
  });
  assert.equal(second.entry.sequence, 2);
  // a retry of the same logical delta (explicit id) dedupes cleanly
  const retry = await service.broadcastDelta({
    sessionId: "ss:w6a-4",
    deltaId: first.entry.deltaId,
    participantId: "user:opener",
    baseRevisionId: revisionId,
    operations: ["set /clips"],
  });
  assert.equal(retry.deduplicated, true);
  assert.deepEqual(retry.entry, first.entry);
  assert.ok(sink);
  assert.equal(sink.deliveries.length, 2); // deduplicated retries are not re-published
  assert.deepEqual(sink.deliveries[0]?.recipients, ["user:opener", "user:b"]);
  assert.deepEqual(sink.deliveries[1]?.entry.deltaId, second.entry.deltaId);
});

test("save + close: the chain grows r1 -> r2 -> r3, stale bases conflict with BOTH divergent ids, the EditDelta carries editor-session provenance, and the policy propagates VERBATIM (invariant 22)", async () => {
  const { service, artifacts } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-6", CHECKPOINT_POLICY);
  await openSession(service, revisionId, "ss:w6a-6");
  await service.joinSharedSession({
    sessionId: "ss:w6a-6",
    participantId: "user:b",
    usage: { usages: ["edit"] },
  });
  await service.broadcastDelta({
    sessionId: "ss:w6a-6",
    participantId: "user:opener",
    baseRevisionId: revisionId,
    operations: ["set /clips"],
  });
  // mid-session save: the merged state at r2 (head advances)
  const saved = await service.saveSharedSession({
    sessionId: "ss:w6a-6",
    changedProjectHash: sha256EditorHash("merged-v1"),
    projectFormat: "kdenlive",
    projectState: { clips: [{ start: 0, end: 90 }], tracks: 2 },
    externalTool: { name: "kdenlive", version: "24.08.0" },
  });
  assert.equal(saved.reconcile.understood, true);
  const r2 = saved.reconcile.revision;
  assert.equal(r2.parentRevisionId, revisionId);
  assert.equal(saved.headRevisionId, r2.revisionId);
  // an in-flight delta based on the OLD head is refused with both ids
  await assert.rejects(
    () =>
      service.broadcastDelta({
        sessionId: "ss:w6a-6",
        participantId: "user:b",
        baseRevisionId: revisionId,
        operations: ["set /stale"],
      }),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionConflictError);
      assert.equal(error.sessionHeadRevisionId, r2.revisionId);
      assert.equal(error.deltaBaseRevisionId, revisionId);
      return true;
    },
  );
  // a delta based on the NEW head delivers
  const fresh = await service.broadcastDelta({
    sessionId: "ss:w6a-6",
    participantId: "user:b",
    baseRevisionId: r2.revisionId,
    operations: ["set /tracks"],
  });
  assert.equal(fresh.entry.sequence, 2);
  // close: the final merged state reconciles to r3
  const closed = await service.closeSharedSession({
    sessionId: "ss:w6a-6",
    changedProjectHash: sha256EditorHash("merged-v2"),
    projectFormat: "kdenlive",
    projectState: { clips: [{ start: 0, end: 90 }], tracks: 4 },
    externalTool: { name: "kdenlive", version: "24.08.0" },
  });
  const r3 = closed.reconcile.revision;
  assert.equal(r3.parentRevisionId, r2.revisionId);
  assert.deepEqual(
    (await artifacts.lineage("art:rev:w6a-6")).map((revision) => revision.revisionId),
    [revisionId, r2.revisionId, r3.revisionId],
  );
  assert.equal(closed.reconcile.delta.fromRevisionId, r2.revisionId);
  assert.equal(closed.reconcile.delta.toRevisionId, r3.revisionId);
  assert.equal(closed.reconcile.delta.provenance.sourceKind, "editor-session");
  assert.equal(closed.reconcile.delta.provenance.sourceRef, "ss:w6a-6#es");
  // invariant 22: the session policy propagates VERBATIM to the new revisions
  assert.deepEqual(r2.policy, SESSION_POLICY);
  assert.deepEqual(r3.policy, SESSION_POLICY);
  // the close summary freezes the total order and the participants' leave
  assert.deepEqual(
    [closed.broadcast.count, closed.broadcast.lastSequence, closed.broadcast.deltaIds.length],
    [2, 2, 2],
  );
  assert.deepEqual(
    closed.participants.map((participant) => [participant.participantId, participant.leaveReason]),
    [
      ["user:opener", "closed"],
      ["user:b", "closed"],
    ],
  );
  // idempotent close: the memo returns the identical result
  const retry = await service.closeSharedSession({
    sessionId: "ss:w6a-6",
    changedProjectHash: sha256EditorHash("merged-v2"),
    projectFormat: "kdenlive",
    projectState: { clips: [{ start: 0, end: 90 }], tracks: 4 },
    externalTool: { name: "kdenlive", version: "24.08.0" },
  });
  assert.deepEqual(retry, closed);
});

test("close: an uncoordinated reconcile outside the service is DETECTED (the shared session refuses to close onto a head it did not advance)", async () => {
  const { service, broker, artifacts, sharedStore } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-7", CHECKPOINT_POLICY);
  await openSession(service, revisionId, "ss:w6a-7");
  // an actor reconciles the underlying broker session DIRECTLY,
  // bypassing the shared-session coordination (the broker's own writes
  // are legal; the shared session must still refuse to adopt them)
  const outside = await broker.reconcileSession({
    editorSessionId: "ss:w6a-7#es",
    changedProjectHash: sha256EditorHash("outside-edit"),
    projectFormat: "kdenlive",
    projectState: { clips: [9] },
    externalTool: { name: "kdenlive", version: "24.08.0" },
  });
  await assert.rejects(
    () =>
      service.closeSharedSession({
        sessionId: "ss:w6a-7",
        changedProjectHash: sha256EditorHash("inside-edit"),
        projectFormat: "kdenlive",
        projectState: { clips: [7] },
        externalTool: { name: "kdenlive", version: "24.08.0" },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionConflictError);
      assert.equal(error.sessionHeadRevisionId, revisionId); // the shared session's head
      assert.equal(error.deltaBaseRevisionId, outside.revision.revisionId); // where the chain went
      return true;
    },
  );
  // the refusal left no shared-session trace: still open, no close memo
  const record = await sharedStore.findSession("ss:w6a-7");
  assert.ok(record);
  assert.equal(record.state, "open");
  assert.equal(await sharedStore.findCloseResult("ss:w6a-7"), null);
});

test("the optional ports are truly additive: the full lifecycle works with NEITHER sink NOR historyRead wired", async () => {
  const { service, artifacts } = fixture();
  const revisionId = await seedRevision(artifacts, "rev:w6a-8", CHECKPOINT_POLICY);
  const record = await openSession(service, revisionId, "ss:w6a-8");
  assert.equal(record.participants.length, 1);
  const broadcast = await service.broadcastDelta({
    sessionId: "ss:w6a-8",
    participantId: "user:opener",
    baseRevisionId: revisionId,
    operations: ["set /x"],
  });
  assert.equal(broadcast.entry.sequence, 1);
  const closed = await service.closeSharedSession({
    sessionId: "ss:w6a-8",
    changedProjectHash: sha256EditorHash("plain"),
    projectFormat: "kdenlive",
    projectState: { x: 1 },
    externalTool: { name: "kdenlive", version: "24.08.0" },
  });
  assert.equal(closed.reconcile.revision.parentRevisionId, revisionId);
});

test("the coherence check: a usage the session policy prohibits refuses the shared open (fail-closed), and is skipped when historyRead is absent", async () => {
  // The checkpoint permits derive; the SESSION policy prohibits it. The
  // opener declares [edit, derive]: admitted by the checkpoint gate, but
  // the rights-gated history read hides the underlying editor session —
  // the context is incoherent and the open refuses (fail-closed).
  const incoherent = fixture({ withHistoryRead: true });
  const revisionId = await seedRevision(incoherent.artifacts, "rev:w6a-9", CHECKPOINT_POLICY);
  await assert.rejects(
    () =>
      incoherent.service.openSharedSession({
        sessionId: "ss:w6a-9",
        revisionId,
        availability: EDITOR_AVAILABILITY,
        userPreference: "kdenlive",
        mode: "local",
        policy: NARROW_SESSION_POLICY,
        opener: { participantId: "user:opener", usage: { usages: ["edit", "derive"] } },
      }),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionAdmissionError);
      assert.ok(error.detail.includes("usage-context-incoherent"));
      return true;
    },
  );
  assert.equal(await incoherent.sharedStore.findSession("ss:w6a-9"), null);
  // without historyRead the same input opens (the optional port is additive)
  const plain = fixture();
  const revisionId2 = await seedRevision(plain.artifacts, "rev:w6a-9b", CHECKPOINT_POLICY);
  const record = await plain.service.openSharedSession({
    sessionId: "ss:w6a-9b",
    revisionId: revisionId2,
    availability: EDITOR_AVAILABILITY,
    userPreference: "kdenlive",
    mode: "local",
    policy: NARROW_SESSION_POLICY,
    opener: { participantId: "user:opener", usage: { usages: ["edit", "derive"] } },
  });
  assert.equal(record.state, "open");
});
