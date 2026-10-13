import type {
  ApplicationCapability,
  ApplicationEnvironmentDescriptor,
  ApplicationAttachment,
  ApplicationSession,
  ApplicationActionRecord,
  ApplicationActionAdmissionResult,
} from "./contract.js";

/** Example read-only observation capability (grants no mutation). */
export const exampleApplicationCapability: ApplicationCapability = {
  capabilityId: "cap:read-status",
  capabilityClass: "observe",
  action: "read app status",
  inputs: [],
  outputs: [{ name: "status", dataKind: "app/status" }],
  sideEffects: [],
  requiredPermissions: [],
  failures: ["app-unreachable"],
};

/** Example local app descriptor (first-slice shape). */
export const exampleApplicationEnvironmentDescriptor: ApplicationEnvironmentDescriptor = {
  descriptorId: "desc:example",
  applicationId: "app:example",
  providerAdapterId: "adapter:local-example",
  appVersion: "1.0.0",
  targetKind: "local",
  targetIdentity: "local:example-app",
  workspaceBinding: { tenant: "tenant:example", workspace: "ws:example" },
  capabilities: [exampleApplicationCapability],
  launchRequirements: ["local binary present"],
  dataClasses: ["app-status"],
  networkNeeds: "none",
  licensing: { license: "MIT", provenance: "example" },
  health: { checkedAt: "2026-10-13T00:00:00.000Z", status: "healthy" },
  limitations: ["observation only"],
  policy: {
    rights: { holders: ["holder:example"], usages: ["observe"], prohibitions: ["distribute"] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

/** Example scoped attachment: observe granted, control NOT granted. */
export const exampleApplicationAttachment: ApplicationAttachment = {
  attachmentId: "att:example",
  applicationId: "app:example",
  descriptorId: "desc:example",
  consentedBy: "user:example",
  tenant: "tenant:example",
  scope: { workspace: "ws:example", workGraphId: null },
  grantedCapabilityClasses: ["observe"],
  grantedAt: "2026-10-13T00:00:00.000Z",
  expiresAt: "2026-10-14T00:00:00.000Z",
  revokedAt: null,
  policySnapshot: "policy:example-v1",
  learningConsent: { granted: false },
};

/** Example active session. */
export const exampleApplicationSession: ApplicationSession = {
  sessionId: "sess:example",
  attachmentId: "att:example",
  versions: { app: "1.0.0", adapter: "1.0.0", target: "local:example-app" },
  activeGrants: ["observe"],
  openedAt: "2026-10-13T00:00:00.000Z",
  closedAt: null,
  closeState: "active",
  checkpointRefs: [],
  auditStreamRef: "audit:example",
};

/** Example allowed observation action with verified effect. */
export const exampleApplicationActionRecord: ApplicationActionRecord = {
  actionRecordId: "act:example",
  sessionId: "sess:example",
  actor: "agent:example",
  capabilityId: "cap:read-status",
  capabilityClass: "observe",
  targetIdentity: "local:example-app",
  sanitizedInputRefs: [],
  sanitizedOutputRefs: ["ref:status-output"],
  permissionDecision: { decision: "allowed", basis: "granted-scope", decidedBy: "policy:example" },
  effects: [{ kind: "status-read", evidenceRef: "ref:status-output", verified: true }],
  status: "succeeded",
  reconciledRefs: { workGraphId: "wg:example", artifactRevisionIds: [] },
  recordedAt: "2026-10-13T00:00:00.000Z",
  missingCoverageNote: null,
};

/** Example fail-closed admission denial (control not granted). */
export const exampleApplicationActionAdmissionResult: ApplicationActionAdmissionResult = {
  admitted: false,
  reason: "capability-class-not-granted",
  detail: "control class was never granted by the user — observation does not imply mutation",
};
