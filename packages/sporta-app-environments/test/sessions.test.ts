/**
 * W9C-2 — ApplicationSession lifecycle + the closeState law tests
 * (P9-19/20). The vocabulary itself is the guard: `disconnected` is a
 * terminal NON-SUCCESS state; only `closed-clean` is successful.
 *
 * EVIDENCE CLASS: REAL law observations over fixture content.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppSessionService,
  ApplicationSessionStateError,
  ApplicationUnknownRecordError,
  FixedClock,
  InMemoryAppEnvironmentStore,
  TERMINAL_CLOSE_STATES,
  appendCheckpointRef,
  auditStreamRefFor,
  closeApplicationSession,
  closeStateForRevocation,
  isSuccessfulCloseState,
} from "../src/contract.js";
import { LATER, NOW, makeAttachment, makeDescriptor, makeSession } from "./helpers.js";

function makeServices(clock = new FixedClock(LATER)) {
  const store = new InMemoryAppEnvironmentStore();
  store.save(makeDescriptor());
  store.save(makeAttachment());
  const sessions = new AppSessionService({
    clock,
    descriptors: store,
    attachments: store,
    sessions: store,
  });
  return { clock, store, sessions };
}

test("openSession snapshots the attachment's granted classes and pins versions", () => {
  const { sessions } = makeServices();
  const session = sessions.openSession({
    attachmentId: "att:test-1",
    versions: { app: "1.0.0", adapter: "adapter:test-local", target: "local:test-app" },
  });
  assert.deepEqual(session.activeGrants, ["observe"]);
  assert.equal(session.closeState, "active");
  assert.equal(session.closedAt, null);
  assert.deepEqual(session.versions, {
    app: "1.0.0",
    adapter: "adapter:test-local",
    target: "local:test-app",
  });
  assert.equal(session.auditStreamRef, auditStreamRefFor(session.sessionId, "att:test-1"));
});

test("openSession refuses revoked and expired attachments (typed, fail-closed)", () => {
  const { store, sessions } = makeServices();
  store.save(makeAttachment({ attachmentId: "att:revoked", revokedAt: LATER }));
  store.save(
    makeAttachment({ attachmentId: "att:expired", expiresAt: NOW, grantedAt: "2026-10-12T00:00:00.000Z" }),
  );
  const versions = { app: "1.0.0", adapter: "a", target: "t" };
  assert.throws(
    () => sessions.openSession({ attachmentId: "att:revoked", versions }),
    (error: unknown) => error instanceof ApplicationSessionStateError && error.code === "attachment-revoked",
  );
  assert.throws(
    () => sessions.openSession({ attachmentId: "att:expired", versions }),
    (error: unknown) => error instanceof ApplicationSessionStateError && error.code === "attachment-expired",
  );
  assert.throws(
    () => sessions.openSession({ attachmentId: "att:missing", versions }),
    ApplicationUnknownRecordError,
  );
});

test("closeSession applies honest terminal close states", () => {
  const { sessions } = makeServices();
  const session = sessions.openSession({
    attachmentId: "att:test-1",
    versions: { app: "1.0.0", adapter: "a", target: "t" },
  });
  const closed = sessions.closeSession({ sessionId: session.sessionId, closeState: "closed-clean" });
  assert.equal(closed.closeState, "closed-clean");
  assert.notEqual(closed.closedAt, null);
});

test("closing an already-closed session is the typed append-only violation", () => {
  const { sessions } = makeServices();
  const session = sessions.openSession({
    attachmentId: "att:test-1",
    versions: { app: "1.0.0", adapter: "a", target: "t" },
  });
  sessions.closeSession({ sessionId: session.sessionId, closeState: "disconnected" });
  assert.throws(
    () => sessions.closeSession({ sessionId: session.sessionId, closeState: "closed-clean" }),
    (error: unknown) => error instanceof ApplicationSessionStateError && error.code === "already-closed",
  );
});

test("the closeState law: disconnected is NEVER a successful close state (P9-19)", () => {
  assert.equal(isSuccessfulCloseState("disconnected"), false);
  assert.equal(isSuccessfulCloseState("revoked-mid-session"), false);
  assert.equal(isSuccessfulCloseState("expired"), false);
  assert.equal(isSuccessfulCloseState("active"), false);
  assert.equal(isSuccessfulCloseState("closed-clean"), true);
  assert.deepEqual(TERMINAL_CLOSE_STATES, [
    "closed-clean",
    "revoked-mid-session",
    "expired",
    "disconnected",
  ]);
  assert.equal(closeStateForRevocation(), "revoked-mid-session");
});

test("closeApplicationSession (domain) refuses unknown close states and preserves checkpoints", () => {
  const session = makeSession({ checkpointRefs: ["act:1"] });
  const closed = closeApplicationSession(session, { sessionId: session.sessionId, closeState: "expired" }, LATER);
  assert.equal(closed.closeState, "expired");
  assert.deepEqual(closed.checkpointRefs, ["act:1"]);
  assert.throws(() =>
    closeApplicationSession(session, { sessionId: session.sessionId, closeState: "nonsense" as never }, LATER),
  );
  assert.throws(() =>
    closeApplicationSession({ ...session, closeState: "expired" }, { sessionId: session.sessionId, closeState: "expired" }, LATER),
  );
});

test("appendCheckpoint is append-only and idempotent per ref", () => {
  let session = makeSession();
  session = appendCheckpointRef(session, "act:1");
  session = appendCheckpointRef(session, "act:1");
  session = appendCheckpointRef(session, "act:2");
  assert.deepEqual(session.checkpointRefs, ["act:1", "act:2"]);
});

test("the session service appends checkpoints and reads sessions typed", () => {
  const { sessions } = makeServices();
  const session = sessions.openSession({
    attachmentId: "att:test-1",
    versions: { app: "1.0.0", adapter: "a", target: "t" },
  });
  sessions.appendCheckpoint({ sessionId: session.sessionId, ref: "act:9" });
  assert.deepEqual(sessions.readSession(session.sessionId).checkpointRefs, ["act:9"]);
  assert.equal(sessions.listSessions("att:test-1").length, 1);
  assert.throws(() => sessions.readSession("sess:missing"), ApplicationUnknownRecordError);
});
