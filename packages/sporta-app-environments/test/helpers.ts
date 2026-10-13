/**
 * Shared fixtures for the Wave 9 Worker C test suites (domain laws).
 *
 * EVIDENCE CLASS: fixture CONTENT — descriptors/attachments/invocation
 * outcomes here are deterministic test data; every PROCESS observation
 * (real app spawns, real agent processes, real HTTP tool calls, real
 * state-file mutations, real WorkGraph/artifact reconciliation) is REAL
 * and lives in processHelpers.ts (used by the REAL suites).
 */
import type { PolicySet } from "@sporta/contracts/contract";
import type {
  ApplicationAttachment,
  ApplicationCapability,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
} from "../src/contract.js";
import {
  ApplicationActionService,
  ApplicationEnvironmentService,
  ApplicationSessionService,
  FixedClock,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationSessionStore,
  Sha256AppEnvironmentHash,
} from "../src/contract.js";
import type {
  ApplicationCapabilityInvocationPort,
  ApplicationCapabilityInvocationResult,
  ApplicationEffectSinkPort,
} from "../src/contract.js";

export const hash = new Sha256AppEnvironmentHash();
export const testPolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["observe", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** Observe capability fixture (pure observation, no side effects). */
export const readStatusCapability: ApplicationCapability = {
  capabilityId: "cap:read-status",
  capabilityClass: "observe",
  action: "read-status",
  inputs: [],
  outputs: [{ name: "status", dataKind: "app/status" }],
  sideEffects: [],
  requiredPermissions: [],
  failures: ["app-exit-nonzero"],
};

/** Control capability fixture (declared state mutation). */
export const appendHighlightCapability: ApplicationCapability = {
  capabilityId: "cap:append-highlight",
  capabilityClass: "control",
  action: "append-highlight",
  inputs: [
    { name: "label", dataKind: "app/highlight-label", required: true },
    { name: "eventId", dataKind: "app/event-id", required: true },
  ],
  outputs: [{ name: "entry", dataKind: "app/highlight-entry" }],
  sideEffects: ["mutates highlights.json"],
  requiredPermissions: [],
  failures: ["app-exit-nonzero"],
};

/** Destructive control capability fixture (confirmation class). */
export const renameBoardCapability: ApplicationCapability = {
  capabilityId: "cap:rename-board",
  capabilityClass: "control",
  action: "rename-board",
  inputs: [{ name: "name", dataKind: "app/board-name", required: true }],
  outputs: [{ name: "status", dataKind: "app/status" }],
  sideEffects: ["destructive: renames the board (irreversible label loss)"],
  requiredPermissions: [],
  failures: ["app-exit-nonzero"],
};

/** Network capability fixture (sandbox screening). */
export const syncRemoteCapability: ApplicationCapability = {
  capabilityId: "cap:sync-remote",
  capabilityClass: "network-access",
  action: "sync-remote",
  inputs: [],
  outputs: [{ name: "sync", dataKind: "app/sync-status" }],
  sideEffects: ["narrow network sync"],
  requiredPermissions: ["network-egress"],
  failures: ["app-exit-nonzero"],
};

/** A well-formed descriptor fixture over the capability fixtures. */
export function makeDescriptor(
  overrides: Partial<ApplicationEnvironmentDescriptor> = {},
): ApplicationEnvironmentDescriptor {
  return {
    descriptorId: "desc:test-app",
    applicationId: "app:test-board",
    providerAdapterId: "adapter:fixture",
    appVersion: "1.0.0",
    targetKind: "local",
    targetIdentity: "local:app:test-board@1.0.0:fixture",
    workspaceBinding: { tenant: "tenant:test", workspace: "ws:test" },
    capabilities: [readStatusCapability, appendHighlightCapability],
    launchRequirements: ["fixture adapter"],
    dataClasses: ["app-status", "app-highlights"],
    networkNeeds: "none",
    licensing: { license: "MIT", provenance: "fixture" },
    health: { checkedAt: "2026-10-13T00:00:00.000Z", status: "healthy" },
    limitations: ["fixture descriptor"],
    policy: testPolicy,
    ...overrides,
  };
}

/** Default consent input matching the fixture descriptor. */
export function makeConsentInput(
  overrides: Partial<Parameters<ApplicationEnvironmentService["consentToAttach"]>[0]> = {},
): {
  descriptorId: string;
  consentedBy: string;
  tenant: string;
  scope: { workspace: string; workGraphId: string | null };
  grantedCapabilityClasses: readonly ApplicationCapabilityClass[];
  expiresAt: string;
  policySnapshot: string;
} {
  return {
    descriptorId: "desc:test-app",
    consentedBy: "user:test",
    tenant: "tenant:test",
    scope: { workspace: "ws:test", workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    expiresAt: "2026-10-14T00:00:00.000Z",
    policySnapshot: "policy:test-v1",
    ...overrides,
  };
}

/**
 * FIXTURE invocation adapter (clearly labeled): probe always reachable;
 * invoke returns the configured outcome. For REAL app-process legs use
 * installLocalTagBoardApp() instead.
 */
export class FixtureInvocationAdapter implements ApplicationCapabilityInvocationPort {
  private readonly configured:
    | ApplicationCapabilityInvocationResult
    | (() => ApplicationCapabilityInvocationResult);

  constructor(
    configured:
      | ApplicationCapabilityInvocationResult
      | (() => ApplicationCapabilityInvocationResult) = {
      status: "succeeded",
      sanitizedOutputRefs: ["out:fixture"],
      effect: null,
      detail: "fixture invocation",
    },
  ) {
    this.configured = configured;
  }

  async probeTarget(): Promise<{ reachable: boolean; detail: string }> {
    return { reachable: true, detail: "fixture probe — not a real target" };
  }

  async invoke(): Promise<ApplicationCapabilityInvocationResult> {
    return typeof this.configured === "function" ? this.configured() : this.configured;
  }
}

/** The service composition over injected stores (fixture stores, real laws). */
export function makeAppWorld(options: {
  clock?: FixedClock;
  adapter?: ApplicationCapabilityInvocationPort;
  effectSink?: ApplicationEffectSinkPort;
  sandbox?: { deniedPermissions: readonly string[] };
} = {}) {
  const clock = options.clock ?? new FixedClock("2026-10-13T00:00:00.000Z");
  const adapter = options.adapter ?? new FixtureInvocationAdapter();
  const descriptors = new InMemoryApplicationDescriptorStore();
  const attachments = new InMemoryApplicationAttachmentStore();
  const sessions = new InMemoryApplicationSessionStore();
  const audit = new InMemoryApplicationActionAuditStore();
  const sessionService = new ApplicationSessionService({
    clock,
    attachments,
    descriptors,
    sessions,
  });
  const environment = new ApplicationEnvironmentService({
    clock,
    descriptors,
    attachments,
    adapter,
    sessions: sessionService,
  });
  const actions = new ApplicationActionService({
    clock,
    hash,
    descriptors,
    attachments,
    sessions,
    audit,
    invocation: adapter,
    ...(options.effectSink !== undefined ? { effectSink: options.effectSink } : {}),
    ...(options.sandbox !== undefined ? { sandbox: options.sandbox } : {}),
  });
  return { clock, adapter, descriptors, attachments, sessions, audit, sessionService, environment, actions };
}

/** Attach + open a session in one step (the common test prologue). */
export async function attachAndOpen(
  world: ReturnType<typeof makeAppWorld>,
  grantedClasses: readonly ("observe" | "control")[],
  options: { workGraphId?: string | null } = {},
): Promise<{ attachment: ApplicationAttachment; sessionId: string }> {
  const attachment = await world.environment.consentToAttach(
    makeConsentInput({
      grantedCapabilityClasses: [...grantedClasses],
      ...(options.workGraphId !== undefined
        ? { scope: { workspace: "ws:test", workGraphId: options.workGraphId } }
        : {}),
    }),
  );
  const session = await world.sessionService.openSession({ attachmentId: attachment.attachmentId });
  return { attachment, sessionId: session.sessionId };
}
