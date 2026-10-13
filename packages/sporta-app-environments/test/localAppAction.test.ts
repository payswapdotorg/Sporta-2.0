/**
 * W9C-7 — the REAL local app action (direct service path).
 *
 * EVIDENCE CLASS: REAL process legs — every action spawns the REAL
 * tagboard app program (real pipes, real exit codes, real state-file
 * mutations on real disk). The app program content is fixture-labeled;
 * the process observations and effects are REAL (P9-18/19/20/21).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApplicationActionService,
  ApplicationEnvironmentService,
  ApplicationSessionService,
  FixedClock,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationSessionStore,
  LocalApplicationAdapter,
  Sha256AppEnvironmentHash,
} from "../src/contract.js";
import { hash, makeConsentInput, testPolicy } from "./helpers.js";
import { installLocalTagBoardApp, readTagBoardState } from "./processHelpers.js";

/** The REAL app world: real adapter over the installed real app. */
async function makeRealWorld() {
  const app = await installLocalTagBoardApp();
  const clock = new FixedClock("2026-10-13T00:00:00.000Z");
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
    adapter: app.adapter,
    sessions: sessionService,
  });
  const actions = new ApplicationActionService({
    clock,
    hash,
    descriptors,
    attachments,
    sessions,
    audit,
    invocation: app.adapter,
  });
  // Build the descriptor from a REAL probe of the REAL app.
  const descriptor = await app.adapter.buildDescriptorFromProbe({
    descriptorId: "desc:tagboard",
    workspaceBinding: { tenant: "tenant:test", workspace: "ws:test" },
    policy: testPolicy,
    licensing: { license: "MIT", provenance: "demo local app" },
    limitations: ["demo app; local process per action"],
    dataClasses: ["app-status", "app-highlights"],
  });
  environment.registerDescriptor(descriptor);
  const consent = (
    overrides: Partial<Parameters<typeof makeConsentInput>[0]> = {},
  ) => makeConsentInput({ descriptorId: descriptor.descriptorId, ...overrides });
  return { app, clock, environment, sessionService, actions, descriptor, consent };
}

test("the REAL app probe maps its self-description onto the frozen vocabulary", async () => {
  const world = await makeRealWorld();
  try {
    const probe = await world.app.adapter.probeTarget(world.descriptor);
    assert.deepEqual(probe, {
      reachable: true,
      detail: `real describe probe matched ${world.descriptor.applicationId}@${world.descriptor.appVersion}`,
    });
    assert.equal(world.descriptor.applicationId, "app:local-tagboard");
    assert.equal(world.descriptor.appVersion, "1.2.0");
    assert.equal(world.descriptor.targetKind, "local");
    assert.deepEqual(
      world.descriptor.capabilities.map((capability) => `${capability.capabilityId}:${capability.capabilityClass}`),
      ["cap:read-status:observe", "cap:append-highlight:control"],
    );
    // The probe catches identity drift: a stale descriptor version fails.
    const stale = await world.app.adapter.probeTarget({
      applicationId: "app:local-tagboard",
      appVersion: "9.9.9",
    });
    assert.equal(stale.reachable, false);
    assert.match(stale.detail, /version/);
  } finally {
    await world.app.cleanup();
  }
});

test("observe and control are granted SEPARATELY: observe-only cannot mutate (P9-18)", async () => {
  const world = await makeRealWorld();
  try {
    const attachment = await world.environment.consentToAttach(
      world.consent({ grantedCapabilityClasses: ["observe"] }),
    );
    const session = await world.sessionService.openSession({ attachmentId: attachment.attachmentId });
    const denied = await world.actions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-highlight",
      actor: "user:test",
      parameters: { label: "nope", eventId: "evt-1" },
    });
    assert.equal(denied.admission.admitted, false);
    if (!denied.admission.admitted) {
      assert.equal(denied.admission.reason, "capability-class-not-granted");
    }
    assert.equal(denied.record.status, "denied");
    assert.deepEqual(
      (await readTagBoardState(world.app.statePath)).highlights,
      [],
      "no mutation happened",
    );
  } finally {
    await world.app.cleanup();
  }
});

test("a REAL control action mutates the app's REAL state file and verifies the effect (P9-19)", async () => {
  const world = await makeRealWorld();
  try {
    const attachment = await world.environment.consentToAttach(
      world.consent({ grantedCapabilityClasses: ["observe", "control"] }),
    );
    const session = await world.sessionService.openSession({ attachmentId: attachment.attachmentId });
    const outcome = await world.actions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-highlight",
      actor: "agent:real-test",
      parameters: { label: "great save", eventId: "evt-3" },
    });
    assert.equal(outcome.admission.admitted, true);
    assert.equal(outcome.record.status, "succeeded");
    assert.equal(outcome.record.effects[0]?.kind, "app-state-mutation");
    assert.equal(outcome.record.effects[0]?.verified, true);
    // The REAL state file on real disk carries the mutation.
    const state = await readTagBoardState(world.app.statePath);
    assert.equal(state.highlights.length, 1);
    assert.deepEqual(state.highlights[0], {
      id: 1,
      label: "great save",
      eventId: "evt-3",
      atMs: 0,
    });
    // A REAL observe action reads the real board status.
    const observed = await world.actions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:read-status",
      actor: "agent:real-test",
      parameters: {},
    });
    assert.equal(observed.record.status, "succeeded");
    assert.equal(observed.record.effects[0]?.kind, "app-observation");
  } finally {
    await world.app.cleanup();
  }
});

test("revocation blocks the next action and leaves the app state untouched (P9-20)", async () => {
  const world = await makeRealWorld();
  try {
    const attachment = await world.environment.consentToAttach(
      world.consent({ grantedCapabilityClasses: ["observe", "control"] }),
    );
    const session = await world.sessionService.openSession({ attachmentId: attachment.attachmentId });
    const first = await world.actions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-highlight",
      actor: "agent:real-test",
      parameters: { label: "before revoke", eventId: "evt-1" },
    });
    assert.equal(first.record.status, "succeeded");
    world.environment.revokeAttachment(attachment.attachmentId);
    const denied = await world.actions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-highlight",
      actor: "agent:real-test",
      parameters: { label: "after revoke", eventId: "evt-2" },
    });
    assert.equal(denied.admission.admitted, false);
    if (!denied.admission.admitted) {
      assert.equal(denied.admission.reason, "attachment-revoked");
    }
    assert.equal(denied.record.status, "denied");
    assert.equal(denied.record.permissionDecision.basis, "revoked");
    const state = await readTagBoardState(world.app.statePath);
    assert.equal(state.highlights.length, 1);
    assert.deepEqual(state.highlights[0]?.label, "before revoke");
    // Safe-stop closed the session honestly.
    const stopped = world.sessionService.readSession(session.sessionId);
    assert.equal(stopped?.closeState, "revoked-mid-session");
  } finally {
    await world.app.cleanup();
  }
});

test("a DISCONNECTED target never records success and closes the session disconnected (P9-19)", async () => {
  const app = await installLocalTagBoardApp();
  // Bind an adapter whose node executable does not exist — every spawn
  // fails with a REAL spawn error (the realistic post-attach disconnect).
  const brokenAdapter = new LocalApplicationAdapter({
    appExecutable: app.appExecutable,
    appDirectory: app.appDirectory,
    nodeExecutable: "/nonexistent/node-runtime-for-disconnect-test",
    clock: new FixedClock("2026-10-13T00:00:00.000Z"),
    hash: new Sha256AppEnvironmentHash(),
  });
  const clock = new FixedClock("2026-10-13T00:00:00.000Z");
  const descriptors = new InMemoryApplicationDescriptorStore();
  const attachments = new InMemoryApplicationAttachmentStore();
  const sessions = new InMemoryApplicationSessionStore();
  const audit = new InMemoryApplicationActionAuditStore();
  const sessionService = new ApplicationSessionService({ clock, attachments, descriptors, sessions });
  const workingEnv = new ApplicationEnvironmentService({
    clock,
    descriptors,
    attachments,
    adapter: app.adapter,
    sessions: sessionService,
  });
  const brokenActions = new ApplicationActionService({
    clock,
    hash,
    descriptors,
    attachments,
    sessions,
    audit,
    invocation: brokenAdapter,
  });
  try {
    const descriptor = await app.adapter.buildDescriptorFromProbe({
      descriptorId: "desc:tagboard-gone",
      workspaceBinding: { tenant: "tenant:test", workspace: "ws:test" },
      policy: testPolicy,
      licensing: { license: "MIT", provenance: "demo" },
      limitations: ["demo"],
      dataClasses: ["app-status"],
    });
    workingEnv.registerDescriptor(descriptor);
    // Attach through the WORKING adapter (the app was reachable)...
    const attachment = await workingEnv.consentToAttach(
      makeConsentInput({ descriptorId: descriptor.descriptorId }),
    );
    const session = await sessionService.openSession({ attachmentId: attachment.attachmentId });
    // ...then execute through the BROKEN adapter: the target went away.
    const outcome = await brokenActions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:read-status",
      actor: "agent:real-test",
      parameters: {},
    });
    assert.equal(outcome.record.status, "failed");
    assert.match(outcome.record.missingCoverageNote ?? "", /disconnected/);
    const closed = sessionService.readSession(session.sessionId);
    assert.equal(closed?.closeState, "disconnected");
    assert.notEqual(closed?.closedAt, null);
  } finally {
    await app.cleanup();
  }
});

test("an app-reported failure is a typed failed record, never success", async () => {
  const world = await makeRealWorld();
  try {
    const attachment = await world.environment.consentToAttach(
      world.consent({ grantedCapabilityClasses: ["observe", "control"] }),
    );
    const session = await world.sessionService.openSession({ attachmentId: attachment.attachmentId });
    // Missing label -> the REAL app exits 1 with an error payload.
    const outcome = await world.actions.performAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-highlight",
      actor: "agent:real-test",
      parameters: { eventId: "evt-9" },
    });
    assert.equal(outcome.record.status, "failed");
    assert.match(outcome.record.missingCoverageNote ?? "", /failed|error/i);
    assert.deepEqual((await readTagBoardState(world.app.statePath)).highlights, []);
  } finally {
    await world.app.cleanup();
  }
});
