/**
 * W12C-1 + W12C-2 — the connected-apps REAL host battery (packages/web,
 * node:test + tsx — the project law; the sportaScreens.test.ts W11C
 * precedent: registerDescriptor + consentToAttach + openSession +
 * performAction + revokeAttachment, every step REAL).
 *
 * Drives `createAppsRealHost` over the REAL app-environment services:
 * a REAL `ApplicationEnvironmentService` (the W11C `listAttachmentsByScope`
 * + descriptor reads + `revokeAttachment`), a REAL `ApplicationActionService`
 * (`readAudit`), and a REAL `ApplicationSessionService` (session
 * enumeration). The host is a pure projection over the REAL services —
 * NO local state, NO second store, NO shadow ledger.
 *
 * EVIDENCE CLASS (labeled):
 *   REAL — the host satisfies `AppsRealHost extends ConnectedAppsScreenPort`
 *   with `gradeNote: APPS_STORE_GRADE_NOTE` (the exported constant, never a
 *   literal); every `ConnectedAppView` projects verbatim from a REAL
 *   `ApplicationAttachment` + its descriptor; the audit trail maps REAL
 *   `ApplicationActionRecord`s through `ApplicationActionService.readAudit`
 *   (compared field-by-field against the service's own records); absent
 *   sessions = empty audit (never an error); revoke rides the REAL
 *   `revokeAttachment` path (idempotent re-revoke, P9-20 safe-stop verbatim).
 *   FIXTURE — the battery probe adapter (target reachable, invoke never
 *   called for real apps), clearly labeled; the sibling fixture host keeps
 *   its honest `backing: "fixture"` label (the retirement law).
 *
 * Acceptance: W12-13 (REAL attachments through the REAL host), W12-14
 * (audit reads over REAL action records, absent session = empty array),
 * W12-15 (revoke write over `revokeAttachment` with idempotent re-revoke,
 * P9-20 safe-stop, exactly one write path).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApplicationEnvironmentService,
  ApplicationSessionService,
  ApplicationActionService,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationSessionStore,
  systemClockNow,
  Sha256AppEnvironmentHash,
  type ApplicationCapabilityInvocationPort,
  type ApplicationCapabilityInvocationResult,
  type ApplicationCapabilityClass,
  type ApplicationEnvironmentDescriptor,
  type ApplicationAttachment,
} from "@sporta/app-environments/contract";
import {
  createAppsRealHost,
  APPS_STORE_GRADE_NOTE,
} from "../src/sporta/apps/appsRealHost.js";
import { createAppsFixtureHost } from "../src/sporta/apps/appsFixtureHost.js";
import {
  STUDIO_WORKSPACE,
  studioSeedDescriptor,
} from "../src/sporta/studioSeeds.js";

/**
 * Battery probe adapter (the W11C `W11cProbe` precedent): target reachable
 * so attach verifies REAL (fail-closed), invoke never reached for real
 * apps — labeled fixture evidence.
 */
class AppsBatteryProbe implements ApplicationCapabilityInvocationPort {
  async probeTarget(): Promise<{ reachable: boolean; detail: string }> {
    return { reachable: true, detail: "w12c battery probe (fixture)" };
  }
  async invoke(): Promise<ApplicationCapabilityInvocationResult> {
    return {
      status: "failed",
      failureKind: "w12c-battery-no-app",
      detail: "the battery never invokes app capabilities",
    };
  }
}

function makeRealDeps() {
  const clock = { now: systemClockNow };
  const hash = new Sha256AppEnvironmentHash();
  const attachmentStore = new InMemoryApplicationAttachmentStore();
  const descriptorStore = new InMemoryApplicationDescriptorStore();
  const actionAuditStore = new InMemoryApplicationActionAuditStore();
  const sessionStore = new InMemoryApplicationSessionStore();

  const sessions = new ApplicationSessionService({
    clock,
    attachments: attachmentStore,
    descriptors: descriptorStore,
    sessions: sessionStore,
  });
  const environment = new ApplicationEnvironmentService({
    clock,
    descriptors: descriptorStore,
    attachments: attachmentStore,
    adapter: new AppsBatteryProbe(),
    sessions,
  });
  const actionAudit = new ApplicationActionService({
    clock,
    hash,
    descriptors: descriptorStore,
    attachments: attachmentStore,
    sessions: sessionStore,
    audit: actionAuditStore,
    invocation: new AppsBatteryProbe(),
  });

  // The host rides the session STORE's enumeration read (the single
  // session state owner — the same read safeStopAttachment uses).
  return {
    environment,
    sessions: sessionStore,
    sessionService: sessions,
    actionAudit,
  };
}

function seedDescriptor(environment: ApplicationEnvironmentService) {
  environment.registerDescriptor(
    studioSeedDescriptor(systemClockNow()) as ApplicationEnvironmentDescriptor,
  );
}

async function attach(
  environment: ApplicationEnvironmentService,
  attachmentId: string,
  grantedCapabilityClasses: readonly ApplicationCapabilityClass[],
): Promise<ApplicationAttachment> {
  return environment.consentToAttach({
    attachmentId,
    descriptorId: "desc:studio-tag-board",
    consentedBy: "user:operator",
    tenant: "tenant:operator",
    scope: { workspace: STUDIO_WORKSPACE, workGraphId: null },
    grantedCapabilityClasses,
    expiresAt: "2026-11-13T12:00:00.000Z",
    policySnapshot: "policy:w12c-v1",
  });
}

test("W12-13: listAttachments projects REAL attachment + descriptor views verbatim", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-controller", ["observe", "control"]);
  await attach(environment, "att:w12c-observer", ["observe"]);

  const views = await host.listAttachments();
  assert.equal(views.length, 2, "both attachments visible (granted + partial-grant)");

  const controller = views.find((view) => view.attachment.attachmentId === "att:w12c-controller");
  assert.ok(controller, "the controller view exists");
  // Descriptor projects verbatim (the frozen mirror).
  assert.equal(controller.descriptor.descriptorId, "desc:studio-tag-board");
  assert.equal(controller.descriptor.applicationId, "app:studio-tag-board");
  assert.equal(controller.descriptor.appVersion, "1.0.0");
  assert.equal(controller.descriptor.capabilities.length, 2);
  const readStatus = controller.descriptor.capabilities.find(
    (capability) => capability.capabilityId === "cap:studio-read-status",
  );
  assert.ok(readStatus, "the observe capability is declared");
  assert.equal(readStatus.capabilityClass, "observe");
  // Attachment projects verbatim.
  assert.deepEqual(controller.attachment.grantedCapabilityClasses, ["observe", "control"]);
  assert.equal(controller.attachment.revokedAt, null, "honest null before any revoke");
  assert.equal(controller.attachment.consentedBy, "user:operator");
  assert.deepEqual(controller.attachment.learningConsent, { granted: false },
    "attaching grants no learning consent (P9-22)");
  assert.deepEqual(controller.attachment.scope, {
    workspace: STUDIO_WORKSPACE,
    workGraphId: null,
  });
  assert.equal(controller.attachment.policySnapshot, "policy:w12c-v1");
  assert.equal(controller.attachment.expiresAt, "2026-11-13T12:00:00.000Z");

  // Not-granted visibility is CAPABILITY-CLASS level (the W11C law): the
  // observer grants ["observe"] while the descriptor declares observe +
  // control — the un-granted "control" class stays visible as the gap
  // between declared and granted (never hidden, never fabricated).
  const observer = views.find((view) => view.attachment.attachmentId === "att:w12c-observer");
  assert.ok(observer, "the partial-grant attachment stays visible");
  assert.deepEqual(observer.attachment.grantedCapabilityClasses, ["observe"]);
  const grantedClasses = new Set(observer.attachment.grantedCapabilityClasses);
  const declaredClasses = observer.descriptor.capabilities.map(
    (capability) => capability.capabilityClass,
  );
  const notGrantedClasses = declaredClasses.filter(
    (declared) => !grantedClasses.has(declared),
  );
  assert.deepEqual(notGrantedClasses, ["control"],
    "the declared-but-not-granted class is visible (capability-class independence)");
  assert.equal(observer.attachment.revokedAt, null);
});

test("W12-13: listAttachments carries the honest revokedAt after a REAL revoke", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-revoked", ["observe"]);

  const revokedRecord = environment.revokeAttachment("att:w12c-revoked");
  assert.ok(revokedRecord.revokedAt !== null, "the REAL service stamped the revocation");

  const views = await host.listAttachments();
  const revokedView = views.find((view) => view.attachment.attachmentId === "att:w12c-revoked");
  assert.ok(revokedView, "the revoked attachment stays visible (honest states)");
  assert.equal(revokedView.attachment.revokedAt, revokedRecord.revokedAt,
    "the stamped revokedAt carries verbatim — never re-badged");
});

test("W12-14: readAuditTrail with no sessions returns an empty array (never an error)", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-quiet", ["observe"]);

  const audit = await host.readAuditTrail("att:w12c-quiet");
  assert.ok(Array.isArray(audit), "the port returns an array");
  assert.equal(audit.length, 0, "absent sessions = empty audit, not an error");
});

test("W12-14: readAuditTrail for an unknown attachment returns an empty array (the fixture-host precedent)", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  const audit = await host.readAuditTrail("att:unknown");
  assert.ok(Array.isArray(audit), "the port returns an array");
  assert.equal(audit.length, 0, "unknown attachment = honest empty audit (never fabricated)");
});

test("W12-14: readAuditTrail projects REAL ApplicationActionRecords verbatim", async () => {
  const { environment, sessions, sessionService, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-audited", ["observe", "control"]);

  const session = await sessionService.openSession({ attachmentId: "att:w12c-audited" });
  assert.equal(session.closeState, "active");

  await actionAudit.performAction({
    sessionId: session.sessionId,
    capabilityId: "cap:studio-read-status",
    actor: "user:operator",
    parameters: {},
  });

  const audit = await host.readAuditTrail("att:w12c-audited");
  assert.equal(audit.length, 1, "the REAL action record projects through the host");

  // The verbatim law: field-by-field against the service's own record.
  const serviceRecord = actionAudit.readAudit(session.sessionId)[0];
  assert.ok(serviceRecord, "the service's audit stream holds the record");
  const [hostRecord] = audit;
  assert.ok(hostRecord !== undefined, "the projected record exists");
  assert.equal(hostRecord.actionRecordId, serviceRecord.actionRecordId);
  assert.equal(hostRecord.sessionId, serviceRecord.sessionId);
  assert.equal(hostRecord.actor, serviceRecord.actor);
  assert.equal(hostRecord.actor, "user:operator");
  assert.equal(hostRecord.capabilityId, serviceRecord.capabilityId);
  assert.equal(hostRecord.capabilityId, "cap:studio-read-status");
  assert.equal(hostRecord.capabilityClass, serviceRecord.capabilityClass);
  assert.deepEqual(hostRecord.permissionDecision, serviceRecord.permissionDecision);
  assert.equal(hostRecord.status, serviceRecord.status);
  assert.equal(hostRecord.recordedAt, serviceRecord.recordedAt);
  assert.equal(hostRecord.missingCoverageNote, serviceRecord.missingCoverageNote);
});

test("W12-15: revoke rides the REAL path and surfaces the stamped revokedAt", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-revoke-me", ["observe"]);

  const result = await host.revoke("att:w12c-revoke-me");
  assert.ok(result.ok, "the REAL revoke succeeds");
  if (!result.ok) return;
  const after = environment.readAttachment("att:w12c-revoke-me");
  assert.ok(after !== null);
  assert.equal(after.revokedAt, result.revokedAt,
    "the host surfaces the service's own stamp verbatim");
});

test("W12-15: revoke is idempotent — re-revoke returns the SAME record", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-twice", ["observe"]);

  const first = await host.revoke("att:w12c-twice");
  const second = await host.revoke("att:w12c-twice");
  assert.ok(first.ok && second.ok, "both revocations succeed (idempotent)");
  if (!first.ok || !second.ok) return;
  assert.equal(second.revokedAt, first.revokedAt,
    "the re-revoke returns the SAME stamped record — never a second write");
});

test("W12-15: revoke safe-stops mid-session sessions (P9-20 verbatim)", async () => {
  const { environment, sessions, sessionService, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  seedDescriptor(environment);
  await attach(environment, "att:w12c-live", ["observe"]);

  const session = await sessionService.openSession({ attachmentId: "att:w12c-live" });
  assert.equal(session.closeState, "active", "the session is open pre-revoke");

  const result = await host.revoke("att:w12c-live");
  assert.ok(result.ok);

  const stopped = sessionService.readSession(session.sessionId);
  assert.ok(stopped !== null);
  assert.equal(stopped.closeState, "revoked-mid-session",
    "P9-20: revocation safe-stops mid-session sessions");
  assert.ok(stopped.closedAt !== null, "the stop is stamped");
});

test("W12-15: revoke failure carries the verbatim typed reason (no silent no-op)", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  const result = await host.revoke("att:unknown");
  assert.ok(!result.ok, "the typed failure surfaces");
  if (result.ok) return;
  assert.ok(result.reason.length > 0, "the reason is non-empty");
  assert.ok(result.reason.includes("att:unknown"),
    "the verbatim service reason carries (the attachment id is visible)");
});

test("the honest backing labels: REAL host + fixture sibling (the retirement law)", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  assert.equal(host.backing, "real", "the REAL host reports real backing");
  assert.equal(host.gradeNote, APPS_STORE_GRADE_NOTE,
    "the grade note is the exported honest constant — never re-badged");
  assert.match(host.gradeNote, /^BACKING: REAL \(.*fixture-grade in-memory\)$/);

  // The sibling fixture host STAYS for the browser demo (the w12a law).
  const fixtureHost = createAppsFixtureHost();
  assert.equal(fixtureHost.backing, "fixture",
    "the fixture host keeps its honest fixture label — sibling, not replacement");
});

test("the exactly-one-write-path law: the host surface is the frozen port", async () => {
  const { environment, sessions, actionAudit } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  const methodNames = Object.keys(host).filter(
    (key) => typeof (host as unknown as Record<string, unknown>)[key] === "function",
  );
  assert.deepEqual(
    [...methodNames].sort(),
    ["listAttachments", "readAuditTrail", "revoke"],
    "exactly one write path (revoke) — no grant/attach path from the screen",
  );
});
