/**
 * W9C-2 — scoped user grants / attachment laws.
 *
 * EVIDENCE CLASS: REAL domain/service laws over fixture content
 * (P9-18 separate grants, P9-20 revocation, P9-22 learning consent,
 * lock 30/31).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApplicationAttachmentError,
  attachmentStatus,
  buildApplicationAttachment,
  isCapabilityClassGranted,
  withLearningConsent,
  withRevocation,
  withoutLearningConsent,
} from "../src/contract.js";
import { makeAppWorld, makeConsentInput, makeDescriptor } from "./helpers.js";

const GRANT_TIME = "2026-10-13T00:00:00.000Z";

test("consent builds an EXACT granted set — deduped, never widened (lock 30)", () => {
  const attachment = buildApplicationAttachment(
    makeDescriptor(),
    makeConsentInput({ grantedCapabilityClasses: ["observe", "observe"] }),
  );
  assert.deepEqual(attachment.grantedCapabilityClasses, ["observe"]);
  assert.equal(isCapabilityClassGranted(attachment, "observe"), true);
  assert.equal(isCapabilityClassGranted(attachment, "control"), false);
  assert.equal(attachment.learningConsent.granted, false);
});

test("granting a class the descriptor does not declare is a typed refusal", () => {
  assert.throws(
    () =>
      buildApplicationAttachment(makeDescriptor(), makeConsentInput({
        grantedCapabilityClasses: ["network-access"],
      })),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationAttachmentError);
      assert.equal(error.refusalKind, "class-not-declared");
      return true;
    },
  );
});

test("tenant/workspace scope mismatches and bad expiry fail closed", () => {
  const descriptor = makeDescriptor();
  assert.throws(
    () => buildApplicationAttachment(descriptor, makeConsentInput({ tenant: "tenant:other" })),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationAttachmentError);
      assert.equal(error.refusalKind, "tenant-mismatch");
      return true;
    },
  );
  assert.throws(
    () =>
      buildApplicationAttachment(descriptor, makeConsentInput({
        scope: { workspace: "ws:other", workGraphId: null },
      })),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationAttachmentError);
      assert.equal(error.refusalKind, "workspace-mismatch");
      return true;
    },
  );
  assert.throws(
    () =>
      buildApplicationAttachment(descriptor, makeConsentInput({
        grantedAt: GRANT_TIME,
        expiresAt: GRANT_TIME,
      })),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationAttachmentError);
      assert.equal(error.refusalKind, "expiry-not-after-grant");
      return true;
    },
  );
  assert.throws(
    () => buildApplicationAttachment(descriptor, makeConsentInput({ grantedCapabilityClasses: [] })),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationAttachmentError);
      assert.equal(error.refusalKind, "no-capability-granted");
      return true;
    },
  );
});

test("attachment status is CLOCK-evaluated: revoked dominates, then expiry (P9-20)", () => {
  const base = buildApplicationAttachment(makeDescriptor(), makeConsentInput());
  assert.deepEqual(attachmentStatus(base, "2026-10-13T12:00:00.000Z"), { active: true });
  const expired = attachmentStatus(base, "2026-10-14T00:00:00.000Z");
  assert.deepEqual(expired, { active: false, reason: "expired" });
  const revoked = withRevocation(base, "2026-10-13T06:00:00.000Z");
  assert.deepEqual(attachmentStatus(revoked, "2026-10-13T12:00:00.000Z"), {
    active: false,
    reason: "revoked",
  });
  // Revocation is idempotent: the first stamp wins.
  assert.equal(
    withRevocation(revoked, "2026-10-13T09:00:00.000Z").revokedAt,
    "2026-10-13T06:00:00.000Z",
  );
});

test("learning consent is a SEPARATE explicit path — attachment alone never learns (lock 31, P9-22)", async () => {
  const attached = buildApplicationAttachment(makeDescriptor(), makeConsentInput());
  assert.equal(attached.learningConsent.granted, false);
  const learned = withLearningConsent(attached, { scope: "app-activity", retention: "90d" });
  assert.deepEqual(learned.learningConsent, {
    granted: true,
    scope: "app-activity",
    retention: "90d",
  });
  const withdrawn = withoutLearningConsent(learned);
  assert.equal(withdrawn.learningConsent.granted, false);
  // The service path enforces the same separation on a real attachment.
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  const attachedByService = await world.environment.consentToAttach(makeConsentInput());
  assert.equal(attachedByService.learningConsent.granted, false);
  const learnedByService = world.environment.grantLearningConsent(
    attachedByService.attachmentId,
    { scope: "app-activity", retention: "90d" },
  );
  assert.equal(learnedByService.learningConsent.granted, true);
  const withdrawnByService = world.environment.withdrawLearningConsent(
    attachedByService.attachmentId,
  );
  assert.equal(withdrawnByService.learningConsent.granted, false);
});

test("the service attaches only after REAL verification and revokes idempotently with safe-stop", async () => {
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  const attachment = await world.environment.consentToAttach(
    makeConsentInput({ grantedCapabilityClasses: ["observe", "control"] }),
  );
  assert.deepEqual(attachment.grantedCapabilityClasses, ["observe", "control"]);
  const session = await world.sessionService.openSession({ attachmentId: attachment.attachmentId });
  assert.equal(session.closeState, "active");

  const revoked = world.environment.revokeAttachment(attachment.attachmentId);
  assert.notEqual(revoked.revokedAt, null);
  // Idempotent: revoking again keeps the first stamp.
  const revokedAgain = world.environment.revokeAttachment(attachment.attachmentId);
  assert.equal(revokedAgain.revokedAt, revoked.revokedAt);
  // P9-20 safe-stop: the open session is revoked-mid-session.
  const stopped = world.sessionService.readSession(session.sessionId);
  assert.equal(stopped?.closeState, "revoked-mid-session");
  assert.notEqual(stopped?.closedAt, null);
});
