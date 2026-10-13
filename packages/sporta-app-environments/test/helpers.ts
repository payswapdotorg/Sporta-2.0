/**
 * Shared fixtures for the W9C test suites.
 *
 * EVIDENCE CLASS: fixture CONTENT — the descriptors/attachments/sessions
 * here are deterministic test data; every LAW observation (validation
 * results, ladder determinism, state machines, sha256 digests) is REAL
 * and measured by the suites that use these helpers.
 */
import type {
  ApplicationAttachment,
  ApplicationCapability,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
  PolicySet,
} from "@sporta/contracts/contract";
import type { ApplicationSandboxScope } from "../src/domain/admission.js";

export const testPolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["observe", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const NOW = "2026-10-13T00:00:00.000Z";
export const LATER = "2026-10-13T12:00:00.000Z";

export const observeCapability: ApplicationCapability = {
  capabilityId: "cap:read-status",
  capabilityClass: "observe",
  action: "read app status",
  inputs: [],
  outputs: [{ name: "status", dataKind: "app/status" }],
  sideEffects: [],
  requiredPermissions: [],
  failures: ["app-unreachable"],
};

export const controlCapability: ApplicationCapability = {
  capabilityId: "cap:append-note",
  capabilityClass: "control",
  action: "append one note",
  inputs: [{ name: "note", dataKind: "text/plain", required: true }],
  outputs: [{ name: "journal", dataKind: "app/journal-state" }],
  sideEffects: ["state:notes"],
  requiredPermissions: ["app:journal:write"],
  failures: ["app-unreachable"],
};

export const bindingCapability: ApplicationCapability = {
  capabilityId: "cap:bind-note",
  capabilityClass: "semantic-binding",
  action: "bind a note to an artifact",
  inputs: [{ name: "noteId", dataKind: "app/note-id", required: true }],
  outputs: [{ name: "binding", dataKind: "sporta/artifact-ref" }],
  sideEffects: ["state:bindings"],
  requiredPermissions: ["app:journal:write"],
  failures: ["binding-conflict"],
};

export const destructiveCapability: ApplicationCapability = {
  capabilityId: "cap:purge-journal",
  capabilityClass: "control",
  action: "purge the journal permanently",
  inputs: [],
  outputs: [],
  sideEffects: ["destructive journal purge"],
  requiredPermissions: ["app:journal:write"],
  failures: ["journal-corrupt"],
};

export function makeDescriptor(
  overrides: Partial<ApplicationEnvironmentDescriptor> = {},
): ApplicationEnvironmentDescriptor {
  return {
    descriptorId: "desc:test-app-1",
    applicationId: "app:test-app",
    providerAdapterId: "adapter:test-local",
    appVersion: "1.0.0",
    targetKind: "local",
    targetIdentity: "local:test-app",
    workspaceBinding: { tenant: "tenant:test", workspace: "ws:test" },
    capabilities: [observeCapability, controlCapability, bindingCapability],
    launchRequirements: ["local binary present"],
    dataClasses: ["app-status", "journal-notes"],
    networkNeeds: "none",
    licensing: { license: "MIT", provenance: "test" },
    health: { checkedAt: NOW, status: "healthy" },
    limitations: ["test app"],
    policy: testPolicy,
    ...overrides,
  };
}

export function makeAttachment(
  overrides: Partial<ApplicationAttachment> = {},
): ApplicationAttachment {
  return {
    attachmentId: "att:test-1",
    applicationId: "app:test-app",
    descriptorId: "desc:test-app-1",
    consentedBy: "user:test",
    tenant: "tenant:test",
    scope: { workspace: "ws:test", workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    grantedAt: NOW,
    expiresAt: "2026-10-14T00:00:00.000Z",
    revokedAt: null,
    policySnapshot: "policy:test-v1",
    learningConsent: { granted: false },
    ...overrides,
  };
}

export function makeSession(
  overrides: Partial<ApplicationSession> = {},
): ApplicationSession {
  return {
    sessionId: "sess:test-1",
    attachmentId: "att:test-1",
    versions: { app: "1.0.0", adapter: "adapter:test-local", target: "local:test-app" },
    activeGrants: ["observe"],
    openedAt: NOW,
    closedAt: null,
    closeState: "active",
    checkpointRefs: [],
    auditStreamRef: "audit-stream:sess:test-1:att:test-1",
    ...overrides,
  };
}

export const fullSandbox: ApplicationSandboxScope = {
  grantedPermissions: ["app:journal:write"],
  networkAllowed: false,
};

export const emptySandbox: ApplicationSandboxScope = {
  grantedPermissions: [],
  networkAllowed: false,
};
