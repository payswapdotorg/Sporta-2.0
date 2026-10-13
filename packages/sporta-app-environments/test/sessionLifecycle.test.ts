/**
 * W9C-4 — bounded session lifecycle laws.
 *
 * EVIDENCE CLASS: REAL domain/service laws over fixture content
 * (closeState honesty, checkpoints, safe-stop, P9-19/20).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditStreamRefFor,
  buildApplicationAttachment,
  closeApplicationSession,
  closeStateFor,
  openApplicationSession,
  safeStopSessions,
  sessionMayReportSuccess,
  withCheckpoint,
} from "../src/contract.js";
import type { ApplicationSession } from "../src/contract.js";
import { attachAndOpen, makeAppWorld, makeConsentInput, makeDescriptor } from "./helpers.js";

const NOW = "2026-10-13T12:00:00.000Z";

test("open snapshots the grants and derives the audit stream ref deterministically", async () => {
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  const { sessionId } = await attachAndOpen(world, ["observe", "control"]);
  const session = world.sessionService.readSession(sessionId);
  assert.ok(session !== null);
  assert.deepEqual(session.activeGrants, ["observe", "control"]);
  assert.equal(session.closeState, "active");
  assert.equal(session.closedAt, null);
  assert.equal(session.auditStreamRef, auditStreamRefFor(sessionId));
  assert.deepEqual(session.versions, {
    app: "1.0.0",
    adapter: "adapter:fixture",
    target: "local:app:test-board@1.0.0:fixture",
  });
});

test("checkpoints are append-only, monotonic and refuse duplicates/empties", () => {
  let session: ApplicationSession = {
    sessionId: "sess:cp",
    attachmentId: "att:cp",
    versions: { app: "1", adapter: "1", target: "t" },
    activeGrants: ["observe"],
    openedAt: NOW,
    closedAt: null,
    closeState: "active",
    checkpointRefs: [],
    auditStreamRef: auditStreamRefFor("sess:cp"),
  };
  session = withCheckpoint(session, "cp:1");
  session = withCheckpoint(session, "cp:2");
  assert.deepEqual(session.checkpointRefs, ["cp:1", "cp:2"]);
  assert.deepEqual(withCheckpoint(session, "cp:1").checkpointRefs, ["cp:1", "cp:2"]);
  assert.throws(() => withCheckpoint(session, ""), /non-empty/);
});

test("closeState law: disconnected is never clean; honest states are never downgraded", () => {
  const base: ApplicationSession = {
    sessionId: "sess:close",
    attachmentId: "att:close",
    versions: { app: "1", adapter: "1", target: "t" },
    activeGrants: ["observe"],
    openedAt: NOW,
    closedAt: null,
    closeState: "active",
    checkpointRefs: [],
    auditStreamRef: auditStreamRefFor("sess:close"),
  };
  // Clean close on an active session.
  const clean = closeApplicationSession(base, "clean", NOW);
  assert.equal(clean.closeState, "closed-clean");
  assert.equal(clean.closedAt, NOW);
  // A revoked-mid-session session is never downgraded by a later clean close.
  const revoked = closeApplicationSession(base, "revoked", NOW);
  const downgraded = closeApplicationSession(revoked, "clean", "2026-10-13T13:00:00.000Z");
  assert.equal(downgraded.closeState, "revoked-mid-session");
  assert.equal(downgraded.closedAt, NOW);
  // Mapping table.
  assert.equal(closeStateFor("clean"), "closed-clean");
  assert.equal(closeStateFor("revoked"), "revoked-mid-session");
  assert.equal(closeStateFor("expired"), "expired");
  assert.equal(closeStateFor("disconnected"), "disconnected");
  // The success law.
  assert.equal(sessionMayReportSuccess(base), true);
  assert.equal(sessionMayReportSuccess(clean), true);
  assert.equal(sessionMayReportSuccess(revoked), true);
  assert.equal(
    sessionMayReportSuccess(closeApplicationSession(base, "disconnected", NOW)),
    false,
  );
});

test("safe-stop marks every OPEN session of the attachment and leaves others alone", () => {
  const base = (sessionId: string, attachmentId: string): ApplicationSession => ({
    sessionId,
    attachmentId,
    versions: { app: "1", adapter: "1", target: "t" },
    activeGrants: ["observe"],
    openedAt: NOW,
    closedAt: null,
    closeState: "active",
    checkpointRefs: [],
    auditStreamRef: auditStreamRefFor(sessionId),
  });
  const stopped = safeStopSessions(
    [
      base("sess:a", "att:1"),
      base("sess:b", "att:1"),
      { ...base("sess:c", "att:2") },
      { ...base("sess:d", "att:1"), closeState: "closed-clean", closedAt: NOW },
    ],
    "att:1",
    NOW,
  );
  assert.equal(stopped[0]?.closeState, "revoked-mid-session");
  assert.equal(stopped[1]?.closeState, "revoked-mid-session");
  assert.equal(stopped[2]?.closeState, "active");
  assert.equal(stopped[3]?.closeState, "closed-clean");
});

test("the session service closes honestly and refuses closed-session checkpoints", async () => {
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  const { sessionId } = await attachAndOpen(world, ["observe"]);
  world.sessionService.checkpointSession(sessionId, "cp:before-close");
  const closed = world.sessionService.closeSession(sessionId, "clean");
  assert.equal(closed.closeState, "closed-clean");
  assert.throws(
    () => world.sessionService.checkpointSession(sessionId, "cp:after-close"),
    /closed sessions never checkpoint/,
  );
  // Idempotent close.
  assert.deepEqual(world.sessionService.closeSession(sessionId, "clean"), closed);
});

test("opening a session over an EXPIRED attachment is refused (clock law)", async () => {
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  const attachment = await world.environment.consentToAttach(makeConsentInput());
  world.clock.advanceTo("2026-10-14T00:00:00.000Z");
  await assert.rejects(
    () => world.sessionService.openSession({ attachmentId: attachment.attachmentId }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /expired/);
      return true;
    },
  );
});

test("openApplicationSession is only reachable over ACTIVE grants (domain law)", () => {
  const descriptor = makeDescriptor();
  const attachment = buildApplicationAttachment(descriptor, makeConsentInput());
  assert.throws(
    () =>
      openApplicationSession(
        { ...attachment, revokedAt: "2026-10-13T06:00:00.000Z" },
        descriptor,
        "sess:revoked",
        NOW,
      ),
    /revoked/,
  );
});
