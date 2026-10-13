/**
 * W9C-5 — the REAL local app action over the REAL agent/tool path
 * (P9-18/19/20/21).
 *
 * EVIDENCE CLASS (honestly labeled):
 *   - REAL: the agent path (ZCodeAgentRuntimeAdapter spawns a REAL child
 *     process — real spawn, real pipes, real wall time, real exit code —
 *     the executable is the labeled stand-in at
 *     test/fixtures/zcode-app-action-standin.mjs speaking the SAME
 *     zcode-cli headless interface, because the vendored zcode-cli is
 *     unbuildable in this sandbox [the W4C blocker]); the app target
 *     state (REAL local files — real reads/writes, real sha256 state
 *     digests); the WorkGraphService and ArtifactGraphService (real
 *     services; the work store is the fixture-labeled in-memory store);
 *     the admission ladder; the append-only audit law; every
 *     byte-equality assertion.
 *   - FIXTURE (labeled): the demo journal app content, the in-memory
 *     stores, the FixedClock, the stand-in executable WHAT it is.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AppActionService,
  AppSessionService,
  ApplicationAuditConflictError,
  AttachmentService,
  DescriptorRegistryService,
  FixedClock,
  InMemoryAppEnvironmentStore,
  LocalFileAppTargetAdapter,
  Sha256AppEnvironmentHash,
} from "../src/contract.js";
import {
  ArtifactGraphService,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import {
  InMemoryWorkGraphStore,
  WorkGraphService,
  ZCodeAgentRuntimeAdapter,
} from "@sporta/work/contract";
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import { LATER, NOW, makeDescriptor, testPolicy } from "./helpers.js";

const STANDIN_PATH = fileURLToPath(
  new URL("./fixtures/zcode-app-action-standin.mjs", import.meta.url),
);

const organization = (version: number): OrganizationVersionRecord => ({
  organizationId: "org:app-action-test",
  version,
  intentProfile: "sports-replay",
  roleGraph: [],
  agentBodies: [],
  cognitiveSubstrates: [],
  toolGraph: [],
  workflowGraph: [],
  environmentProfile: "local",
  fallbacks: [],
  budgets: {},
  learnedPreferences: [],
  evidence: [],
  policy: testPolicy,
});

async function makeWorld(workGraphId: string) {
  const root = await fs.mkdtemp(join(tmpdir(), "sporta-app-action-"));
  const clock = new FixedClock(NOW);
  const store = new InMemoryAppEnvironmentStore();
  const hash = new Sha256AppEnvironmentHash();
  const localTarget = new LocalFileAppTargetAdapter({ rootDir: root, hash });
  const agentRuntime = new ZCodeAgentRuntimeAdapter({ now: () => clock.now(), zcodeCliPath: STANDIN_PATH });
  const workService = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now: () => clock.now() });
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());

  const registry = new DescriptorRegistryService({ clock, descriptors: store, targets: localTarget });
  const attachments = new AttachmentService({ clock, descriptors: store, attachments: store, sessions: store });
  const sessions = new AppSessionService({ clock, descriptors: store, attachments: store, sessions: store });
  const actions = new AppActionService({
    clock,
    hash,
    descriptors: store,
    attachments: store,
    sessions: store,
    audit: store,
    agentRuntime,
    targets: localTarget,
    workGraphs: workService,
    workGraphRefs: workService,
    artifactRevisions: artifacts,
  });

  registry.registerDescriptor(makeDescriptor());
  await localTarget.installDemoAppState("local:test-app", { status: "ok", notes: [] });
  await workService.openIntent({
    workGraphId,
    intent: {
      goal: "test the real local app action lane",
      constraints: [],
      artifactRequirements: [],
      learningPolicy: { scopes: [], requireConsent: true },
      policy: testPolicy,
    },
  });
  await workService.appendNode({
    workGraphId,
    kind: "artifact",
    nodeId: "art:test-outputs",
    actor: { actorKind: "user", actorRef: "user:test" },
  });

  const attach = (classes: string[]) =>
    attachments.attachApplication({
      applicationId: "app:test-app",
      descriptorId: "desc:test-app-1",
      consentedBy: "user:test",
      tenant: "tenant:test",
      scope: { workspace: "ws:test", workGraphId },
      grantedCapabilityClasses: classes as never,
      expiresAt: "2026-10-14T00:00:00.000Z",
      policySnapshot: "policy:test-v1",
    });
  const openSession = (attachmentId: string) =>
    sessions.openSession({
      attachmentId,
      versions: { app: "1.0.0", adapter: "adapter:test-local", target: "local:test-app" },
    });

  return {
    root,
    clock,
    store,
    attachments,
    sessions,
    actions,
    artifacts,
    workService,
    attach,
    openSession,
    dispose: () => agentRuntime.dispose(),
  };
}

test("P9-18/19: ONE real local app action over the real agent path — verified effect reconciled into the SAME WorkGraph/artifact lineage", async () => {
  const world = await makeWorld("wg:app-action-happy");
  try {
    // Grant observation and control separately (P9-18): observe first,
    // control only after explicit re-consent.
    const observeOnly = world.attach(["observe"]);
    assert.deepEqual(observeOnly.grantedCapabilityClasses, ["observe"]);
    const attachment = world.attachments.amendGrant({
      attachmentId: observeOnly.attachmentId,
      consentedBy: "user:test",
      grantedCapabilityClasses: ["observe", "control"],
    });
    const session = world.openSession(attachment.attachmentId);

    const result = await world.actions.executeAppAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-note",
      actor: "agent:test",
      inputRefs: ["ref:note-source"],
      payload: "post-match recovery note",
      sandbox: { grantedPermissions: ["app:journal:write"], networkAllowed: false },
      organization: organization(1),
      workGraphId: "wg:app-action-happy",
      workGraphArtifactNode: "art:test-outputs",
    });

    // Admission: admitted without confirmation (append is not destructive).
    assert.equal(result.admission.admitted, true);
    // The agent run is a REAL process: real events, real terminal verdict.
    assert.notEqual(result.run, null);
    const terminal = result.run?.events[result.run.events.length - 1];
    assert.equal(terminal?.type, "completed");
    assert.ok(terminal?.detail.includes("exited with code 0"), `real exit code evidence: ${terminal?.detail}`);
    // The record: succeeded, verified effects, allowed decision.
    assert.equal(result.record.status, "succeeded");
    assert.equal(result.record.permissionDecision.decision, "allowed");
    assert.equal(result.record.permissionDecision.basis, "granted-scope");
    assert.ok(result.record.effects.some((effect) => effect.kind === "state-change" && effect.verified));
    assert.ok(result.record.effects.some((effect) => effect.kind === "state:notes" && effect.verified));
    assert.equal(result.record.missingCoverageNote, null);

    // The REAL app effect: the journal file on disk gained the note.
    const stateBytes = await fs.readFile(join(world.root, "local_test-app", "state.json"), "utf8");
    const state = JSON.parse(stateBytes) as { notes: { id: string; text: string }[] };
    assert.equal(state.notes.length, 1);
    assert.equal(state.notes[0]?.text, "post-match recovery note");

    // Reconciliation into the SAME WorkGraph + artifact lineage (P9-19).
    assert.equal(result.record.reconciledRefs.workGraphId, "wg:app-action-happy");
    const revisionId = result.record.reconciledRefs.artifactRevisionIds[0];
    assert.ok(revisionId !== undefined && revisionId.startsWith("rev:"));
    const revision = await world.artifacts.readRevision(revisionId);
    assert.notEqual(revision, null);
    assert.equal(revision?.provenance.sourceKind, "agent-run");
    const graph = await world.workService.readWorkGraph("wg:app-action-happy");
    const nodeIds = graph?.nodes.map((node) => node.nodeId) ?? [];
    assert.ok(nodeIds.some((id) => id.startsWith("run:wg:app-action-happy")), "the agent run node exists");
    assert.ok(nodeIds.includes(result.record.actionRecordId) || nodeIds.some((id) => id.startsWith("act-node:")), "the action node exists");
    const artifactNode = graph?.nodes.find((node) => node.nodeId === "art:test-outputs");
    assert.ok(
      artifactNode?.refs?.some((ref) => ref.kind === "artifact-revision" && ref.refId === revisionId),
      "the artifact node carries the revision ref through WorkGraphRefsPort",
    );
    // The audit trail is append-only with the checkpoint ref recorded.
    assert.equal(world.actions.readAuditTrail(session.sessionId).length, 1);
    assert.ok(world.store.bySessionId(session.sessionId)?.checkpointRefs.includes(result.record.actionRecordId));
  } finally {
    world.dispose();
    await fs.rm(world.root, { recursive: true, force: true });
  }
});

test("P9-19: a FAILED agent run (real non-zero exit) is never a successful action — no reconciliation", async () => {
  const world = await makeWorld("wg:app-action-fail");
  try {
    const attachment = world.attach(["observe", "control", "semantic-binding"]);
    const session = world.openSession(attachment.attachmentId);
    // cap:bind-note is declared but NOT implemented by the stand-in app:
    // the real process exits 3 — the honest failure lane.
    const result = await world.actions.executeAppAction({
      sessionId: session.sessionId,
      capabilityId: "cap:bind-note",
      actor: "agent:test",
      inputRefs: [],
      payload: "note-1",
      sandbox: { grantedPermissions: ["app:journal:write"], networkAllowed: false },
      organization: organization(1),
      workGraphId: "wg:app-action-fail",
      workGraphArtifactNode: "art:test-outputs",
    });
    assert.equal(result.admission.admitted, true);
    const terminal = result.run?.events[result.run.events.length - 1];
    assert.equal(terminal?.type, "failed");
    assert.ok(terminal?.detail.includes("exited with code 3"));
    assert.equal(result.record.status, "failed");
    assert.ok(result.record.effects.every((effect) => !effect.verified));
    assert.equal(result.record.reconciledRefs.workGraphId, null);
    assert.deepEqual(result.record.reconciledRefs.artifactRevisionIds, []);
    assert.ok(result.record.missingCoverageNote?.includes("never a successful action"));
  } finally {
    world.dispose();
    await fs.rm(world.root, { recursive: true, force: true });
  }
});

test("P9-20: revoking the attachment blocks the next action (typed refusal, no execution, denied audit record)", async () => {
  const world = await makeWorld("wg:app-action-revoke");
  try {
    const attachment = world.attach(["observe", "control"]);
    const session = world.openSession(attachment.attachmentId);
    world.attachments.revokeAttachment({ attachmentId: attachment.attachmentId });
    // Safe-stop: the session closed revoked-mid-session.
    assert.equal(world.store.bySessionId(session.sessionId)?.closeState, "revoked-mid-session");

    const result = await world.actions.executeAppAction({
      sessionId: session.sessionId,
      capabilityId: "cap:append-note",
      actor: "agent:test",
      inputRefs: [],
      payload: "never written",
      sandbox: { grantedPermissions: ["app:journal:write"], networkAllowed: false },
      organization: organization(1),
      workGraphId: "wg:app-action-revoke",
      workGraphArtifactNode: "art:test-outputs",
    });
    assert.equal(result.admission.admitted, false);
    if (!result.admission.admitted) assert.equal(result.admission.reason, "attachment-revoked");
    assert.equal(result.run, null, "no agent run was started for a denied action");
    assert.equal(result.record.status, "denied");
    assert.equal(result.record.permissionDecision.basis, "revoked");
    assert.equal(result.record.permissionDecision.decision, "denied");
    // The journal file was NOT touched.
    const stateBytes = await fs.readFile(join(world.root, "local_test-app", "state.json"), "utf8");
    assert.equal((JSON.parse(stateBytes) as { notes: unknown[] }).notes.length, 0);
  } finally {
    world.dispose();
    await fs.rm(world.root, { recursive: true, force: true });
  }
});

test("the observation lane: a completed read over the real agent path succeeds without mutating the app", async () => {
  const world = await makeWorld("wg:app-action-observe");
  try {
    const attachment = world.attach(["observe"]);
    const session = world.openSession(attachment.attachmentId);
    const before = await new LocalFileAppTargetAdapter({ rootDir: world.root, hash: new Sha256AppEnvironmentHash() }).readTargetState("local:test-app");
    const result = await world.actions.executeAppAction({
      sessionId: session.sessionId,
      capabilityId: "cap:read-status",
      actor: "agent:test",
      inputRefs: [],
      sandbox: { grantedPermissions: [], networkAllowed: false },
      organization: organization(1),
      workGraphId: "wg:app-action-observe",
      workGraphArtifactNode: "art:test-outputs",
    });
    assert.equal(result.admission.admitted, true);
    assert.equal(result.record.status, "succeeded");
    assert.ok(result.record.effects.some((effect) => effect.kind === "state-observed" && effect.verified));
    // The state bytes did not change (observation never mutates).
    const after = await new LocalFileAppTargetAdapter({ rootDir: world.root, hash: new Sha256AppEnvironmentHash() }).readTargetState("local:test-app");
    assert.equal(after.stateDigest, before.stateDigest);
  } finally {
    world.dispose();
    await fs.rm(world.root, { recursive: true, force: true });
  }
});

test("P9-21: secret-shaped input refs are sanitized out and surfaced in missingCoverageNote (never silent)", async () => {
  const world = await makeWorld("wg:app-action-sanitize");
  try {
    const attachment = world.attach(["observe"]);
    const session = world.openSession(attachment.attachmentId);
    const result = await world.actions.executeAppAction({
      sessionId: session.sessionId,
      capabilityId: "cap:read-status",
      actor: "agent:test",
      inputRefs: ["ref:ok-1", "secret:api-token-xyz", "ref:ok-2"],
      sandbox: { grantedPermissions: [], networkAllowed: false },
      organization: organization(1),
      workGraphId: "wg:app-action-sanitize",
      workGraphArtifactNode: "art:test-outputs",
    });
    assert.deepEqual(result.record.sanitizedInputRefs, ["ref:ok-1", "ref:ok-2"]);
    assert.ok(result.record.missingCoverageNote?.includes("1 input ref(s) sanitized out"));
  } finally {
    world.dispose();
    await fs.rm(world.root, { recursive: true, force: true });
  }
});

test("the audit store is append-only: identical re-appends are idempotent, conflicting bytes are the typed error", () => {
  const store = new InMemoryAppEnvironmentStore();
  const record = {
    actionRecordId: "act:test-1",
    sessionId: "sess:x",
    actor: "agent:test",
    capabilityId: "cap:read-status",
    capabilityClass: "observe" as const,
    targetIdentity: "local:test-app",
    sanitizedInputRefs: [],
    sanitizedOutputRefs: [],
    permissionDecision: { decision: "allowed" as const, basis: "granted-scope" as const, decidedBy: "p" },
    effects: [],
    status: "succeeded" as const,
    reconciledRefs: { workGraphId: null, artifactRevisionIds: [] },
    recordedAt: NOW,
    missingCoverageNote: null,
  };
  store.append(record);
  store.append(record); // idempotent
  assert.equal(store.listBySession("sess:x").length, 1);
  assert.throws(
    () => store.append({ ...record, recordedAt: LATER }),
    ApplicationAuditConflictError,
  );
});
