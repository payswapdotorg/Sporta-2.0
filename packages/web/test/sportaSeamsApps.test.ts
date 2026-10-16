/**
 * W12C-1 + W12C-2 — the connected-apps REAL host battery (packages/web,
 * node:test + tsx — the project law; the sportaScreens.test.ts and
 * sportaSeamsRuns.test.ts precedents).
 *
 * Drives `createAppsRealHost` over the REAL app-environment services:
 * a REAL `ApplicationEnvironmentService` (the W11C `listAttachmentsByScope`
 * + descriptor reads + `revokeAttachment`), a REAL `ApplicationActionService`
 * (`readAudit`), and a REAL `ApplicationSessionService` (session enumeration).
 * The host is a pure projection over the REAL services — NO local state,
 * NO second store, NO shadow ledger.
 *
 * EVIDENCE CLASS (labeled):
 *   REAL — the host satisfies `AppsRealHost extends ConnectedAppsScreenPort`
 *   with `gradeNote: "CONNECTED_APPS_STORE_GRADE_NOTE"`; every
 *   `ConnectedAppView` projects verbatim from REAL `ApplicationAttachment`
 *   + its descriptor; the audit trail maps REAL `ApplicationActionRecord`s
 *   through `ApplicationActionService.readAudit(sessionId)`; absent sessions
 *   = empty audit (never an error); unknown attachment = typed refusal
 *   (ScreenRefusal) never a fabricated trail; revoke rides the REAL
 *   `ApplicationEnvironmentService.revokeAttachment` (idempotent, safe-stop
 *   semantics verbatim, typed failures carry verbatim reason).
 *   FIXTURE — the in-memory stores (the W11C precedent's test stores).
 *
 * Acceptance: W12-13 (REAL attachments through the REAL host), W12-14
 * (audit reads over REAL action records, absent session = empty array),
 * W12-15 (revoke write over `revokeAttachment` with idempotent re-revoke
 * and exactly one write path).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationSessionStore,
} from "@sporta/app-environments/test/stores.js";
import {
  ApplicationEnvironmentService,
  ApplicationActionService,
  ApplicationSessionService,
} from "@sporta/app-environments/app/index.js";
import { createAppsRealHost } from "../src/sporta/apps/appsRealHost.js";
import { SystemClock } from "@sporta/app-environments/app/clock.js";
import { Sha256HashPort } from "@sporta/app-environments/app/hash.js";

function makeRealDeps() {
  const clock = new SystemClock();
  const hash = new Sha256HashPort();
  const attachmentStore = new InMemoryApplicationAttachmentStore();
  const descriptorStore = new InMemoryApplicationDescriptorStore();
  const actionAuditStore = new InMemoryApplicationActionAuditStore();
  const sessionStore = new InMemoryApplicationSessionStore();

  const environment = new ApplicationEnvironmentService({
    clock,
    hash,
    attachments: attachmentStore,
    descriptors: descriptorStore,
  });

  const actionAudit = new ApplicationActionService({
    clock,
    hash,
    attachments: attachmentStore,
    descriptors: descriptorStore,
    audit: actionAuditStore,
    sessions: sessionStore,
  });

  const sessions = new ApplicationSessionService({
    clock,
    attachments: attachmentStore,
    descriptors: descriptorStore,
    sessions: sessionStore,
  });

  return { environment, actionAudit, sessions, attachmentStore, descriptorStore, actionAuditStore, sessionStore };
}

test("W12-13: listAttachments projects REAL attachment + descriptor views", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  // Register a descriptor
  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read", "write"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe", "control"],
  });

  // Create an attachment (granted)
  await attachmentStore.put({
    id: "att-1",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: null,
    scope: "user",
    sessionIds: [],
  });

  // Create an attachment (not-granted)
  await attachmentStore.put({
    id: "att-2",
    descriptorId: "desc-1",
    granted: false,
    grantedAt: null,
    revokedAt: null,
    scope: "user",
    sessionIds: [],
  });

  const views = await host.listAttachments();
  
  assert.equal(views.length, 2);
  
  // Find granted attachment
  const grantedView = views.find(v => v.attachment.id === "att-1");
  assert.ok(grantedView, "granted attachment should exist");
  assert.equal(grantedView.descriptor.id, "desc-1");
  assert.equal(grantedView.descriptor.applicationId, "app-1");
  assert.equal(grantedView.attachment.granted, true);
  assert.equal(grantedView.attachment.grantedAt, "2024-01-01T00:00:00.000Z");
  assert.equal(grantedView.attachment.revokedAt, null);
  assert.equal(grantedView.attachment.scope, "user");
  
  // Find not-granted attachment
  const notGrantedView = views.find(v => v.attachment.id === "att-2");
  assert.ok(notGrantedView, "not-granted attachment should exist");
  assert.equal(notGrantedView.attachment.granted, false);
  assert.equal(notGrantedView.attachment.grantedAt, null);
});

test("W12-13: listAttachments shows revoked attachment with honest revokedAt", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe"],
  });

  await attachmentStore.put({
    id: "att-revoked",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: new Date("2024-01-02T00:00:00.000Z").toISOString(),
    scope: "user",
    sessionIds: [],
  });

  const views = await host.listAttachments();
  
  assert.equal(views.length, 1);
  const revokedView = views[0];
  assert.equal(revokedView.attachment.id, "att-revoked");
  assert.equal(revokedView.attachment.revokedAt, "2024-01-02T00:00:00.000Z");
  assert.equal(revokedView.attachment.granted, true);
});

test("W12-14: readAuditTrail for unknown attachment returns typed refusal", async () => {
  const { environment, actionAudit, sessions } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  const result = await host.readAuditTrail("unknown-attachment");
  
  // Should be a ScreenRefusal (typed refusal)
  assert.ok("ok" in result);
  assert.equal((result as { ok: false; reason: string }).ok, false);
  assert.ok(typeof (result as { ok: false; reason: string }).reason === "string");
  assert.ok((result as { ok: false; reason: string }).reason.length > 0);
});

test("W12-14: readAuditTrail with no sessions returns empty array", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe"],
  });

  await attachmentStore.put({
    id: "att-no-sessions",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: null,
    scope: "user",
    sessionIds: [], // No sessions
  });

  const result = await host.readAuditTrail("att-no-sessions");
  
  // Should be an empty array (absent sessions = empty audit, never an error)
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test("W12-14: readAuditTrail with existing sessions projects REAL action records", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore, actionAuditStore, sessionStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe"],
  });

  await attachmentStore.put({
    id: "att-with-audit",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: null,
    scope: "user",
    sessionIds: ["session-1"],
  });

  // Create a session
  await sessionStore.put({
    id: "session-1",
    attachmentId: "att-with-audit",
    openedAt: new Date("2024-01-01T01:00:00.000Z").toISOString(),
    closedAt: null,
    closeReason: null,
    checkpoints: [],
  });

  // Add an action record to the audit store
  await actionAuditStore.put({
    id: "action-1",
    sessionId: "session-1",
    actionId: "act-1",
    actionType: "browser-navigate",
    inputRefs: { url: "https://example.com" },
    outcome: "executed",
    executedAt: new Date("2024-01-01T01:05:00.000Z").toISOString(),
    outputRefs: { result: "success" },
    verification: { before: {}, after: {} },
  });

  const result = await host.readAuditTrail("att-with-audit");
  
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  const auditEntry = result[0];
  assert.equal(auditEntry.actionId, "act-1");
  assert.equal(auditEntry.actionType, "browser-navigate");
  assert.equal(auditEntry.outcome, "executed");
});

test("W12-14: readAuditTrail with nonexistent session returns empty array (not error)", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore, sessionStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe"],
  });

  await attachmentStore.put({
    id: "att-bad-session",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: null,
    scope: "user",
    sessionIds: ["nonexistent-session"], // Session doesn't exist
  });

  const result = await host.readAuditTrail("att-bad-session");
  
  // Should be an empty array (absent session = empty audit, never an error)
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test("W12-15: revoke successful via REAL service", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe"],
  });

  await attachmentStore.put({
    id: "att-to-revoke",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: null,
    scope: "user",
    sessionIds: [],
  });

  const result = await host.revoke("att-to-revoke");
  
  assert.ok(result.ok);
  assert.ok(typeof result.revokedAt === "string");
  assert.ok(result.revokedAt.length > 0);
  
  // Verify the attachment was actually revoked in the store
  const attachment = await attachmentStore.get("att-to-revoke");
  assert.ok(attachment);
  assert.ok(attachment.revokedAt !== null);
});

test("W12-15: revoke idempotent — re-revoke returns SAME record", async () => {
  const { environment, actionAudit, sessions, attachmentStore, descriptorStore } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  await descriptorStore.put({
    id: "desc-1",
    applicationId: "app-1",
    appVersion: "1.0.0",
    targetKind: "browser-hosted",
    targetIdentity: "https://example.com",
    dataClasses: ["read"],
    networkNeeds: "internet",
    limitations: ["none"],
    licensing: { licenseId: "MIT", licenseUrl: "https://opensource.org/licenses/MIT" },
    declaredCapabilities: ["observe"],
  });

  await attachmentStore.put({
    id: "att-idempotent",
    descriptorId: "desc-1",
    granted: true,
    grantedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    revokedAt: null,
    scope: "user",
    sessionIds: [],
  });

  // First revoke
  const firstRevoke = await host.revoke("att-idempotent");
  assert.ok(firstRevoke.ok);
  const firstRevokedAt = firstRevoke.revokedAt;
  
  // Second revoke (idempotent)
  const secondRevoke = await host.revoke("att-idempotent");
  assert.ok(secondRevoke.ok);
  assert.equal(secondRevoke.revokedAt, firstRevokedAt, "idempotent re-revoke must return SAME revokedAt");
  
  // Verify only one revocation happened
  const attachment = await attachmentStore.get("att-idempotent");
  assert.ok(attachment);
  assert.equal(attachment.revokedAt, firstRevokedAt);
});

test("W12-15: revoke failure carries verbatim reason (no silent no-op)", async () => {
  const { environment, actionAudit, sessions } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });

  // Try to revoke non-existent attachment
  const result = await host.revoke("nonexistent-attachment");
  
  assert.equal(result.ok, false);
  assert.ok(typeof result.reason === "string");
  assert.ok(result.reason.length > 0, "failure reason must be verbatim, not empty");
});

test("gradeNote surfaces honest backing label", async () => {
  const { environment, actionAudit, sessions } = makeRealDeps();
  const host = createAppsRealHost({ environment, actionAudit, sessions });
  
  assert.equal(host.gradeNote, "CONNECTED_APPS_STORE_GRADE_NOTE");
});