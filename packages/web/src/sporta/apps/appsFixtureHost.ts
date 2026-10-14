/**
 * The connected-apps screen browser FIXTURE host (W11C — the
 * studioBrowserFixture.ts precedent). EVIDENCE CLASS: FIXTURE, labeled
 * at the point of use. The REAL ApplicationEnvironmentService is a
 * headless Node leg; this host carries static demo attachments (an
 * observe-only one, an observe+control one with learning consent, a
 * revoked one) plus labeled demo audit rows, and an honest LOCAL
 * fixture revocation transition (typed, reversible by nothing — demo
 * only, never claimed to touch a real app). The REAL revoke path is
 * driven in the node battery.
 */
import type {
  ConnectedAppAuditShape,
  ConnectedAppView,
  ConnectedAppsScreenPort,
} from "./appsScreenPorts.js";

const CAPABILITIES = [
  {
    capabilityId: "cap:fixture-read-status",
    capabilityClass: "observe",
    action: "read-status",
    sideEffects: [] as readonly string[],
    requiredPermissions: [] as readonly string[],
  },
  {
    capabilityId: "cap:fixture-append-highlight",
    capabilityClass: "control",
    action: "append-highlight",
    sideEffects: ["mutates highlights.json"] as readonly string[],
    requiredPermissions: [] as readonly string[],
  },
];

const DESCRIPTOR = {
  descriptorId: "desc:fixture-tag-board",
  applicationId: "app:fixture-tag-board",
  appVersion: "1.0.0",
  targetKind: "local",
  targetIdentity: "local:app:fixture-tag-board@1.0.0:browser-demo",
  dataClasses: ["app-status", "app-highlights"],
  networkNeeds: "none",
  limitations: ["fixture attachment — browser demo content only"],
  licensing: { license: "MIT", provenance: "fixture" },
  capabilities: CAPABILITIES,
};

function attachment(
  attachmentId: string,
  granted: readonly string[],
  learningConsent: { granted: false } | { granted: true; scope: string; retention: string },
  revokedAt: string | null,
): ConnectedAppView["attachment"] {
  return {
    attachmentId,
    descriptorId: DESCRIPTOR.descriptorId,
    grantedCapabilityClasses: granted,
    grantedAt: "2026-10-13T12:00:00.000Z",
    expiresAt: "2026-11-13T12:00:00.000Z",
    revokedAt,
    learningConsent,
    consentedBy: "user:fixture-operator",
    scope: { workspace: "ws:fixture", workGraphId: null },
    policySnapshot: "policy:fixture-apps-v1",
  };
}

const FIXTURE_VIEWS: readonly ConnectedAppView[] = [
  { descriptor: DESCRIPTOR, attachment: attachment("att:fixture-observe-1", ["observe"], { granted: false }, null) },
  {
    descriptor: DESCRIPTOR,
    attachment: attachment("att:fixture-controller-1", ["observe", "control"], { granted: true, scope: "app-highlights", retention: "30 days" }, null),
  },
  { descriptor: DESCRIPTOR, attachment: attachment("att:fixture-revoked-1", ["observe"], { granted: false }, "2026-10-13T12:10:00.000Z") },
];

const FIXTURE_AUDIT: Readonly<Record<string, readonly ConnectedAppAuditShape[]>> = {
  "att:fixture-controller-1": [
    {
      actionRecordId: "act:fixture-1",
      sessionId: "ses:fixture-1",
      actor: "agent-run:fixture-1",
      capabilityId: "cap:fixture-read-status",
      capabilityClass: "observe",
      permissionDecision: { decision: "allowed", basis: "granted-scope", decidedBy: "policy:fixture-apps-v1" },
      status: "succeeded",
      recordedAt: "2026-10-13T12:05:00.000Z",
      missingCoverageNote: null,
    },
    {
      actionRecordId: "act:fixture-2",
      sessionId: "ses:fixture-1",
      actor: "agent-run:fixture-1",
      capabilityId: "cap:fixture-append-highlight",
      capabilityClass: "control",
      permissionDecision: { decision: "denied", basis: "requires-confirmation", decidedBy: "policy:fixture-apps-v1" },
      status: "denied",
      recordedAt: "2026-10-13T12:05:10.000Z",
      missingCoverageNote: "fixture demo row — the real audit store is the app-environment seam",
    },
  ],
};

/** The labeled FIXTURE connected-apps host (see file header). */
export function createAppsFixtureHost(): ConnectedAppsScreenPort {
  const views = FIXTURE_VIEWS.map((view) => ({
    descriptor: { ...view.descriptor, capabilities: [...view.descriptor.capabilities] },
    attachment: { ...view.attachment },
  }));
  return {
    backing: "fixture",
    async listAttachments() {
      return views.map((view) => ({ descriptor: { ...view.descriptor }, attachment: { ...view.attachment } }));
    },
    async readAuditTrail(attachmentId: string) {
      return (FIXTURE_AUDIT[attachmentId] ?? []).map((record) => ({ ...record }));
    },
    async revoke(attachmentId) {
      const view = views.find((entry) => entry.attachment.attachmentId === attachmentId);
      if (view === undefined) {
        return { ok: false, reason: `fixture host: no attachment ${attachmentId}` };
      }
      if (view.attachment.revokedAt !== null) {
        return { ok: false, reason: `attachment ${attachmentId} is already revoked` };
      }
      // Honest LOCAL fixture transition — never claimed to touch a real app.
      view.attachment.revokedAt = new Date().toISOString();
      return { ok: true, revokedAt: view.attachment.revokedAt };
    },
  };
}
