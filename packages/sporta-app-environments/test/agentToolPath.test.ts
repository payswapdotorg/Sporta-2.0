/**
 * W9C-7 — one REAL local app action over the REAL agent/tool path,
 * reconciled into the REAL WorkGraph/artifact lineage (P9-19/23).
 *
 * EVIDENCE CLASS: REAL process legs — the REAL ZCodeAgentRuntimeAdapter
 * (the declared @sporta/work AgentRuntimeExecutionPort seam) spawns a
 * REAL agent process speaking the zcode-cli headless interface; the
 * agent performs the attached-app action through the generic
 * app-action tool endpoint over REAL localhost HTTP; the endpoint runs
 * the REAL admission ladder, spawns the REAL tagboard app, verifies
 * the REAL state-file effect and reconciles it through the REAL
 * Artifact Fabric + REAL WorkGraph refs port. The agent wrapper
 * program is fixture-labeled content (the W4A precedent); every
 * process, pipe, exit code, file and HTTP exchange is REAL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ZCodeAgentRuntimeAdapter, systemClockNow } from "@sporta/work/contract";
import { WorkGraphService, InMemoryWorkGraphStore } from "@sporta/work/contract";
import { ArtifactGraphService } from "../../sporta-artifacts/src/contract.js";
import {
  ApplicationActionService,
  ApplicationActionToolEndpoint,
  ApplicationEnvironmentService,
  ApplicationSessionService,
  FixedClock,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationSessionStore,
} from "../src/contract.js";
import { hash, testPolicy } from "./helpers.js";
import {
  installAgentWrapper,
  installLocalTagBoardApp,
  makeRealEffectSink,
  readTagBoardState,
  runAgentAppAction,
} from "./processHelpers.js";

/** The full REAL composition: app + agent + endpoint + workgraph + fabric. */
async function makeAgentPathWorld() {
  const app = await installLocalTagBoardApp();
  const agent = await installAgentWrapper();
  const workGraphs = new WorkGraphService({
    store: new InMemoryWorkGraphStore(),
    now: systemClockNow,
  });
  const artifacts = new ArtifactGraphService({ now: systemClockNow });
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
    effectSink: makeRealEffectSink(artifacts, workGraphs),
  });
  const endpoint = new ApplicationActionToolEndpoint({ actions });
  const runtime = new ZCodeAgentRuntimeAdapter({
    now: systemClockNow,
    zcodeCliPath: agent.wrapperPath,
  });
  const descriptor = await app.adapter.buildDescriptorFromProbe({
    descriptorId: "desc:tagboard-agent-path",
    workspaceBinding: { tenant: "tenant:test", workspace: "ws:test" },
    policy: testPolicy,
    licensing: { license: "MIT", provenance: "demo local app" },
    limitations: ["demo app; local process per action"],
    dataClasses: ["app-status", "app-highlights"],
  });
  environment.registerDescriptor(descriptor);
  return {
    app,
    agent,
    workGraphs,
    artifacts,
    clock,
    environment,
    sessionService,
    actions,
    endpoint,
    runtime,
    descriptor,
    async cleanup() {
      runtime.dispose();
      await endpoint.close();
      await app.cleanup();
      await agent.cleanup();
    },
  };
}

test("a REAL agent-driven app action is admitted, executed, verified and reconciled onto the same WorkGraph (P9-19/23)", async () => {
  const world = await makeAgentPathWorld();
  try {
    // One WorkGraph carries BOTH the run and the attached-app lineage.
    const graph = await world.workGraphs.openIntent({
      workGraphId: "wg:agent-path",
      intent: {
        goal: "demonstrate one real attached-app action over the agent path",
        constraints: [],
        artifactRequirements: [],
      },
    });
    assert.equal(graph.workGraphId, "wg:agent-path");

    // Run-scoped grant (workspace + exactly this WorkGraph).
    const attachment = await world.environment.consentToAttach({
      descriptorId: world.descriptor.descriptorId,
      consentedBy: "user:test",
      tenant: "tenant:test",
      scope: { workspace: "ws:test", workGraphId: "wg:agent-path" },
      grantedCapabilityClasses: ["observe", "control"],
      expiresAt: "2026-10-14T00:00:00.000Z",
      policySnapshot: "policy:test-v1",
    });
    const session = await world.sessionService.openSession({
      attachmentId: attachment.attachmentId,
    });

    const { url } = await world.endpoint.listen();
    const { runId, events } = await runAgentAppAction({
      runtime: world.runtime,
      task: {
        capabilityId: "cap:append-highlight",
        parameters: { label: "agent-called save", eventId: "evt-7" },
        actor: "agent:zcode-demo",
      },
      workGraphId: "wg:agent-path",
      toolUrl: url,
      sessionId: session.sessionId,
    });

    // The REAL agent process completed (real exit code 0 -> terminal completed).
    const terminal = events[events.length - 1];
    assert.equal(terminal?.type, "completed");
    // The tool call and its typed result are progress evidence in the stream
    // (the stream never decides the verdict — W4A law 2).
    const toolEvent = events.find((event) => event.detail.includes("app-action tool HTTP 200"));
    assert.ok(toolEvent !== undefined, "the real HTTP tool call is in the agent event stream");
    assert.match(toolEvent.detail, /cap:append-highlight/);
    assert.match(toolEvent.detail, /"status":"succeeded"/);
    assert.match(toolEvent.detail, /rev:app:/);

    // The REAL app state file changed.
    const state = await readTagBoardState(world.app.statePath);
    assert.equal(state.highlights.length, 1);
    assert.deepEqual(state.highlights[0], {
      id: 1,
      label: "agent-called save",
      eventId: "evt-7",
      atMs: 0,
    });

    // The audit record succeeded with reconciled refs onto the SAME graph.
    const stream = world.actions.readAudit(session.sessionId);
    const record = stream[stream.length - 1];
    assert.equal(record?.status, "succeeded");
    assert.equal(record?.actor, "agent:zcode-demo");
    assert.equal(record?.reconciledRefs.workGraphId, "wg:agent-path");
    const revisionId = record?.reconciledRefs.artifactRevisionIds[0];
    assert.match(revisionId ?? "", /^rev:app:/);

    // The REAL fabric holds the immutable evidence revision.
    const revision = await world.artifacts.readRevision(revisionId ?? "rev:missing");
    assert.ok(revision !== null);
    assert.equal(revision.artifactId.startsWith("art:app-effect:"), true);
    assert.equal(revision.provenance.sourceKind, "agent-run");
    assert.equal(revision.provenance.sourceRef, "agent:zcode-demo");

    // The REAL WorkGraph node carries the artifact-revision ref.
    const updated = await world.workGraphs.readWorkGraph("wg:agent-path");
    const artifactNode = updated?.nodes.find((node) =>
      node.refs?.some((ref) => ref.kind === "artifact-revision" && ref.refId === revisionId),
    );
    assert.ok(artifactNode !== undefined, "the WorkGraph carries the app-effect revision ref");
    assert.equal(artifactNode.kind, "artifact");

    // The session checkpointed the revision (run-scoped lineage evidence).
    const checkpointed = world.sessionService.readSession(session.sessionId);
    assert.deepEqual(checkpointed?.checkpointRefs, [revisionId]);
    assert.equal(checkpointed?.closeState, "active");
    void runId;
  } finally {
    await world.cleanup();
  }
});

test("revocation denies the NEXT agent-driven action through the same path (P9-20)", async () => {
  const world = await makeAgentPathWorld();
  try {
    await world.workGraphs.openIntent({
      workGraphId: "wg:agent-path-revoke",
      intent: { goal: "revocation proof", constraints: [], artifactRequirements: [] },
    });
    const attachment = await world.environment.consentToAttach({
      descriptorId: world.descriptor.descriptorId,
      consentedBy: "user:test",
      tenant: "tenant:test",
      scope: { workspace: "ws:test", workGraphId: "wg:agent-path-revoke" },
      grantedCapabilityClasses: ["observe", "control"],
      expiresAt: "2026-10-14T00:00:00.000Z",
      policySnapshot: "policy:test-v1",
    });
    const session = await world.sessionService.openSession({
      attachmentId: attachment.attachmentId,
    });
    const { url } = await world.endpoint.listen();

    // First agent action succeeds.
    const first = await runAgentAppAction({
      runtime: world.runtime,
      task: {
        capabilityId: "cap:append-highlight",
        parameters: { label: "before revoke", eventId: "evt-1" },
        actor: "agent:zcode-demo",
      },
      workGraphId: "wg:agent-path-revoke",
      toolUrl: url,
      sessionId: session.sessionId,
    });
    assert.equal(first.events[first.events.length - 1]?.type, "completed");
    assert.equal((await readTagBoardState(world.app.statePath)).highlights.length, 1);

    // Revoke, then the SAME agent path is refused with the typed reason.
    world.environment.revokeAttachment(attachment.attachmentId);
    const denied = await runAgentAppAction({
      runtime: world.runtime,
      task: {
        capabilityId: "cap:append-highlight",
        parameters: { label: "after revoke", eventId: "evt-2" },
        actor: "agent:zcode-demo",
      },
      workGraphId: "wg:agent-path-revoke",
      toolUrl: url,
      sessionId: session.sessionId,
    });
    const terminal = denied.events[denied.events.length - 1];
    // The agent run itself completes (exit 0): the denial is a policy
    // outcome carried as progress evidence, not a crash (W4A law 2).
    assert.equal(terminal?.type, "completed");
    const toolEvent = denied.events.find((event) => event.detail.includes("app-action tool HTTP 200"));
    assert.match(toolEvent?.detail ?? "", /"admitted":false/);
    assert.match(toolEvent?.detail ?? "", /attachment-revoked/);

    // The app state is untouched by the denied action.
    const state = await readTagBoardState(world.app.statePath);
    assert.equal(state.highlights.length, 1);
    assert.equal(state.highlights[0]?.label, "before revoke");

    // The audit recorded the denial; the session safe-stopped.
    const stream = world.actions.readAudit(session.sessionId);
    const record = stream[stream.length - 1];
    assert.equal(record?.status, "denied");
    assert.equal(record?.permissionDecision.basis, "revoked");
    assert.equal(
      world.sessionService.readSession(session.sessionId)?.closeState,
      "revoked-mid-session",
    );
  } finally {
    await world.cleanup();
  }
});
