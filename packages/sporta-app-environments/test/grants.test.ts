/**
 * W9C-1 — scoped grants, expiry/revocation and the SEPARATE learning
 * consent tests (P9-18/20, lock 31).
 *
 * EVIDENCE CLASS: REAL law observations over fixture content — the
 * services and state machines are real; attachment/learning laws are
 * asserted as typed failures, never silent passes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppSessionService,
  ApplicationAttachmentError,
  ApplicationSessionStateError,
  ApplicationUnknownRecordError,
  AttachmentService,
  FixedClock,
  InMemoryAppEnvironmentStore,
  grantedClassesCover,
  initialLearningConsent,
  isAttachmentExpired,
  isAttachmentRevoked,
} from "../src/contract.js";
import { LATER, NOW, makeAttachment, makeDescriptor } from "./helpers.js";

function makeServices() {
  const clock = new FixedClock(NOW);
  const store = new InMemoryAppEnvironmentStore();
  const attachments = new AttachmentService({
    clock,
    descriptors: store,
    attachments: store,
    sessions: store,
  });
  const sessions = new AppSessionService({
    clock,
    descriptors: store,
    attachments: store,
    sessions: store,
  });
  const register = () => store.save(makeDescriptor());
  return { clock, store, attachments, sessions, register };
}

test("attachApplication grants only declared classes — an undeclared class is a typed refusal", () => {
  const { store, attachments, register } = makeServices();
  register();
  assert.throws(
    () =>
      attachments.attachApplication({
        applicationId: "app:test-app",
        descriptorId: "desc:test-app-1",
        consentedBy: "user:test",
        tenant: "tenant:test",
        scope: { workspace: "ws:test", workGraphId: null },
        grantedCapabilityClasses: ["observe", "network-access"],
        expiresAt: "2026-10-14T00:00:00.000Z",
        policySnapshot: "policy:test-v1",
      }),
    (error: unknown) =>
      error instanceof ApplicationAttachmentError && error.code === "class-not-declared",
  );
  assert.equal(store.listByApplication("app:test-app").length, 0);
});

test("attachApplication refuses an expiry that is not in the future", () => {
  const { attachments, register } = makeServices();
  register();
  assert.throws(
    () =>
      attachments.attachApplication({
        applicationId: "app:test-app",
        descriptorId: "desc:test-app-1",
        consentedBy: "user:test",
        tenant: "tenant:test",
        scope: { workspace: "ws:test", workGraphId: null },
        grantedCapabilityClasses: ["observe"],
        expiresAt: NOW,
        policySnapshot: "policy:test-v1",
      }),
    (error: unknown) => error instanceof ApplicationAttachmentError && error.code === "expiry-not-future",
  );
});

test("an attachment ALWAYS starts with learning consent NOT granted (lock 31: attachment alone never learns)", () => {
  const { attachments, register } = makeServices();
  register();
  const attachment = attachments.attachApplication({
    applicationId: "app:test-app",
    descriptorId: "desc:test-app-1",
    consentedBy: "user:test",
    tenant: "tenant:test",
    scope: { workspace: "ws:test", workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    expiresAt: "2026-10-14T00:00:00.000Z",
    policySnapshot: "policy:test-v1",
  });
  assert.deepEqual(attachment.learningConsent, { granted: false });
  assert.deepEqual(initialLearningConsent(), { granted: false });
});

test("learning consent is a SEPARATE explicit path — granting it changes nothing else", () => {
  const { attachments, register } = makeServices();
  register();
  const attachment = attachments.attachApplication({
    applicationId: "app:test-app",
    descriptorId: "desc:test-app-1",
    consentedBy: "user:test",
    tenant: "tenant:test",
    scope: { workspace: "ws:test", workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    expiresAt: "2026-10-14T00:00:00.000Z",
    policySnapshot: "policy:test-v1",
  });
  const consented = attachments.grantLearningConsent({
    attachmentId: attachment.attachmentId,
    scope: "workflow",
    retention: "90d",
  });
  assert.deepEqual(consented.learningConsent, { granted: true, scope: "workflow", retention: "90d" });
  assert.deepEqual(consented.grantedCapabilityClasses, ["observe"]);
  const reset = attachments.revokeLearningConsent(attachment.attachmentId);
  assert.deepEqual(reset.learningConsent, { granted: false });
});

test("amendGrant broadens classes ONLY with the original principal's re-consent (reauthorization law)", () => {
  const { attachments, register } = makeServices();
  register();
  const attachment = attachments.attachApplication({
    applicationId: "app:test-app",
    descriptorId: "desc:test-app-1",
    consentedBy: "user:test",
    tenant: "tenant:test",
    scope: { workspace: "ws:test", workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    expiresAt: "2026-10-14T00:00:00.000Z",
    policySnapshot: "policy:test-v1",
  });
  assert.throws(
    () =>
      attachments.amendGrant({
        attachmentId: attachment.attachmentId,
        consentedBy: "user:other",
        grantedCapabilityClasses: ["observe", "control"],
      }),
    (error: unknown) => error instanceof ApplicationAttachmentError && error.code === "consent-required",
  );
  const amended = attachments.amendGrant({
    attachmentId: attachment.attachmentId,
    consentedBy: "user:test",
    grantedCapabilityClasses: ["observe", "control"],
  });
  assert.deepEqual(amended.grantedCapabilityClasses, ["observe", "control"]);
});

test("revokeAttachment is idempotent and blocks new sessions (safe-stop, P9-20)", () => {
  const { store, attachments, sessions, register } = makeServices();
  register();
  const attachment = attachments.attachApplication({
    applicationId: "app:test-app",
    descriptorId: "desc:test-app-1",
    consentedBy: "user:test",
    tenant: "tenant:test",
    scope: { workspace: "ws:test", workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    expiresAt: "2026-10-14T00:00:00.000Z",
    policySnapshot: "policy:test-v1",
  });
  const session = sessions.openSession({
    attachmentId: attachment.attachmentId,
    versions: { app: "1.0.0", adapter: "adapter:test-local", target: "local:test-app" },
  });
  sessions.appendCheckpoint({ sessionId: session.sessionId, ref: "act:checkpoint-1" });
  const revoked = attachments.revokeAttachment({ attachmentId: attachment.attachmentId });
  assert.notEqual(revoked.revokedAt, null);
  assert.deepEqual(attachments.revokeAttachment({ attachmentId: attachment.attachmentId }), revoked);
  // Safe-stop: the active session closed revoked-mid-session with checkpoints preserved.
  const closed = store.bySessionId(session.sessionId);
  assert.equal(closed?.closeState, "revoked-mid-session");
  assert.deepEqual(closed?.checkpointRefs, ["act:checkpoint-1"]);
  // No NEW sessions over a revoked attachment.
  assert.throws(
    () =>
      sessions.openSession({
        attachmentId: attachment.attachmentId,
        versions: { app: "1.0.0", adapter: "adapter:test-local", target: "local:test-app" },
      }),
    (error: unknown) =>
      error instanceof ApplicationSessionStateError && error.code === "attachment-revoked",
  );
});

test("expiry and revocation predicates are honest facts of the record", () => {
  assert.equal(isAttachmentRevoked(makeAttachment()), false);
  assert.equal(isAttachmentRevoked(makeAttachment({ revokedAt: LATER })), true);
  assert.equal(isAttachmentExpired(makeAttachment(), NOW), false);
  assert.equal(isAttachmentExpired(makeAttachment({ expiresAt: NOW }), NOW), true);
  assert.equal(isAttachmentExpired(makeAttachment({ expiresAt: LATER }), LATER), true);
});

test("grantedClassesCover: observe never covers control (independence law)", () => {
  assert.equal(grantedClassesCover(["observe"], "observe"), true);
  assert.equal(grantedClassesCover(["observe"], "control"), false);
  assert.equal(grantedClassesCover(["observe", "control"], "control"), true);
});

test("revokeAttachment on an unknown attachment is the typed unknown-record error", () => {
  const { attachments } = makeServices();
  assert.throws(
    () => attachments.revokeAttachment({ attachmentId: "att:missing" }),
    ApplicationUnknownRecordError,
  );
});
