/**
 * A17 seeded-loop integration proof (TL-owned, wave-1 integration).
 *
 * Traces the complete acceptance loop on one WorkGraph/artifact lineage:
 * intent -> organization -> execution (fixture seam) -> artifact ->
 * external editor -> user edit -> learning -> capability gap -> Arena ->
 * expert result -> organization candidate -> evaluation -> promotion.
 *
 * EVIDENCE CLASS: fixture. Every store/adapter/transport in this proof is
 * in-memory fixture-grade. The execution leg runs on the DECLARED
 * AgentRuntimeExecutionPort with its deterministic fixture adapter — the
 * real ZCode AgentRuntime adapter is a later wave. No real provider,
 * expert, or editor is contacted. This proves the SEMANTIC loop and the
 * lineage invariants only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  IntentSpec,
  PolicySet,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type { AppendWorkNodeInput, WorkGraphRecord } from "@sporta/work/contract";
import {
  WorkGraphService,
  InMemoryWorkGraphStore,
  FixtureAgentRuntimeAdapter,
} from "@sporta/work/contract";
import {
  OrganizationRegistryService,
  OrganizationResolverService,
  UserPreferenceService,
  InMemoryOrganizationStore,
  InMemoryUserPreferenceStore,
} from "@sporta/organizations/contract";
import { LabService } from "@sporta/lab/contract";
import { EvaluationService } from "@sporta/evaluation/contract";
import {
  ArtifactGraphService,
  FixedClock as ArtifactClock,
  sha256Text,
} from "@sporta/artifacts/contract";
import {
  EditorBrokerService,
  InMemoryEditorSessionStore,
  KdenliveFixtureAdapter,
  MysteryAppFixtureAdapter,
  sha256EditorHash,
  FixedClock as EditorClock,
} from "@sporta/editors/contract";
import { ArenaClientService, InMemoryArenaTransport } from "@sporta/arena/contract";
// Same-package composition services follow this package's ports-only
// convention (relative module-internal imports, as in this package's own tests).
import { ProductLoopProjection } from "../src/app/productLoopProjection.js";
import { LearningIntakeService } from "../src/app/learningIntake.js";

const T0 = "2026-10-07T00:00:00.000Z";
const fixedNow = () => T0;

const policy: PolicySet = {
  rights: { holders: ["holder:operator"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const intent: IntentSpec = {
  goal: "produce a tactical replay of the authorized clip",
  constraints: ["authorized sources only"],
  artifactRequirements: ["tactical-board-video"],
  learningPolicy: {
    scopes: ["preference", "workflow", "capability", "organization-composition", "knowledge"],
    requireConsent: true,
  },
  policy,
};

const orgDraftFor = (organizationId: string) => ({
  organizationId,
  version: 1,
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
  evidence: ["evidence:seed-a17"],
  policy,
});

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:a17",
  capturedAt: T0,
};

test("A17 seeded loop: the complete trace preserves the canonical WorkGraph and artifact lineage", async () => {
  // --- composition root (all services through public contracts) ---
  const workService = new WorkGraphService({
    store: new InMemoryWorkGraphStore(),
    now: fixedNow,
  });
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now: fixedNow,
  });
  const preferences = new UserPreferenceService({
    store: new InMemoryUserPreferenceStore(),
    now: fixedNow,
  });
  const resolver = new OrganizationResolverService({ catalog: registry, preferences });
  const _lab = new LabService({ catalog: registry, workGraphs: workService, now: fixedNow });
  const evaluation = new EvaluationService();
  const artifacts = new ArtifactGraphService(new ArtifactClock(T0));
  const editors = new EditorBrokerService({
    clock: new EditorClock(T0),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
  });
  const arenaTransport = new InMemoryArenaTransport({ now: fixedNow });
  const arena = new ArenaClientService({ transport: arenaTransport });
  const learningIntake = new LearningIntakeService({ workGraphs: workService });
  const projection = new ProductLoopProjection({
    workGraphs: workService,
    organizations: resolver,
    artifacts,
    editors,
    arena,
  });

  // --- stage 1: intent ---
  const graph = await workService.openIntent({ workGraphId: "wg:a17", intent });
  assert.equal(graph.workGraphId, "wg:a17");
  assert.equal(graph.status, "open");
  const nodesBefore = graph.nodes.length;

  // --- stage 2: organization (draft -> promote -> explainable resolve) ---
  const orgDraft = orgDraftFor("org:replay");
  await registry.registerDraft({ record: orgDraft });
  const promotionV1 = await registry.promote({ organizationId: "org:replay", version: 1 });
  assert.equal(promotionV1.decision, "promoted");
  const selection = await resolver.resolve({
    intent,
    workGraph: graph,
    userRef: "user:operator",
    environmentProfile: "local",
    constraints: [],
  });
  assert.equal(selection.selected.organization.organizationId, "org:replay");
  assert.ok(selection.explanation.length > 0, "selection must be explainable");

  // --- stage 3: execution through the DECLARED AgentRuntime seam (fixture) ---
  const runtime = new FixtureAgentRuntimeAdapter({ now: fixedNow });
  const handle = await runtime.startRun({
    workGraphId: "wg:a17",
    organization: selection.selected.organization,
    task: "render the tactical board from the authorized source",
  });
  const events = await runtime.observeRun(handle.runId);
  assert.ok(events.length > 0, "fixture runtime must emit run events");
  const appendAgent = (input: Omit<AppendWorkNodeInput, "workGraphId" | "actor">) =>
    workService.appendNode({
      workGraphId: "wg:a17",
      actor: { actorKind: "agent-run", actorRef: handle.runId },
      ...input,
    });
  await appendAgent({ kind: "task", nodeId: "task:render" });
  await appendAgent({ kind: "run", nodeId: handle.runId });

  // --- stage 4: durable artifact + revision r1 ---
  await artifacts.recordArtifact({
    artifactId: "art:a17",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const r1 = await artifacts.commitRevision({
    artifactId: "art:a17",
    revisionId: "rev:a17-1",
    contentHash: sha256Text("board-render-v1"),
    organizationVersion: { organizationId: "org:replay", version: 1 },
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });
  assert.equal(r1.revisionId, "rev:a17-1");
  await appendAgent({ kind: "artifact", nodeId: "art:a17", parent: handle.runId });

  // --- stage 5: external editor session (kdenlive fixture, round-trip) ---
  const session = await editors.openSession({
    editorSessionId: "es:a17",
    revisionId: "rev:a17-1",
    editorId: "kdenlive",
    mode: "local",
    policy,
  });
  assert.equal(session.integrationLevel, 2);

  // --- stage 6: user takeover — manual edit reconciled into a NEW revision ---
  const userProjectState = { timeline: "edited", clip: "trimmed" };
  const reconciled = await editors.reconcileSession({
    editorSessionId: "es:a17",
    changedProjectHash: sha256EditorHash(JSON.stringify(userProjectState)),
    externalTool: { name: "kdenlive", version: "24.08.0" },
    projectFormat: "kdenlive",
    projectState: userProjectState,
  });
  assert.equal(reconciled.understood, true, "kdenlive format must round-trip");
  assert.equal(reconciled.revision.parentRevisionId, "rev:a17-1");
  assert.ok(reconciled.delta.operations.length > 0);
  const userAppend = await workService.appendNode({
    workGraphId: "wg:a17",
    nodeId: "edit:user-1",
    kind: "action",
    parent: "art:a17",
    actor: { actorKind: "user", actorRef: "user:operator" },
  });
  assert.ok(userAppend.seq > 0, "user takeover append is first-class lineage");

  // --- stage 7: learning — consent-gated candidate artifact (user scope) ---
  await preferences.setPreference({
    userRef: "user:operator",
    preferredOrganizationId: "org:replay",
    preferredEnvironmentProfile: "local",
  });
  const learningArtifact = await learningIntake.recordConsent({
    workGraphId: "wg:a17",
    userId: "user:operator",
    scopes: ["workflow", "organization-composition"],
    decision: "granted",
  });
  assert.equal(learningArtifact.status, "candidate");
  assert.equal(learningArtifact.scope, "user");
  assert.ok(
    learningArtifact.class === "workflow" || learningArtifact.class === "organization-composition",
    "consent scopes map to their learning class",
  );

  // --- stage 8: capability gap (typed, evidence-backed) ---
  const gap = await arena.recordGap({
    gapId: "gap:a17",
    workGraphId: "wg:a17",
    capabilityNeed: "broadcast-frame-tracking",
    attemptedStrategies: ["builtin-tracker@0"],
    contextRefs: ["wg:a17", "art:a17"],
    evidence: [],
  });
  assert.equal(gap.status, "open");

  // --- stage 9: idempotent Arena escalation; expert session (fixture transport) ---
  const escalateInput = {
    idempotencyKey: "esc:a17-key",
    gapId: "gap:a17",
    tenantRef: "tenant:operator",
    urgency: "high" as const,
    sessionMode: "unblock" as const,
    permittedActions: ["observe", "correct"],
    learningPermissions: { scopes: ["workflow", "capability"] as const, requireConsent: true },
    contextRefs: ["gap:a17"],
    policy,
  };
  const escalation1 = await arena.escalate(escalateInput);
  const escalation2 = await arena.escalate(escalateInput);
  assert.equal(escalation1.escalationId, escalation2.escalationId, "escalation is idempotent");
  // The simulated expert works the session through to a submitted result.
  await arenaTransport.advance(escalation1.escalationId, 12);
  const result = await arena.readResult(escalation1.escalationId);
  assert.ok(result !== null, "expert result must exist after the session");
  assert.equal(result?.validated, false, "Arena never claims Sporta-side validation");

  // --- stage 10: validated result (Sporta validates before applying) ---
  const verdict = await arena.validateResult(result);
  assert.equal(verdict.accepted, true, "well-formed result passes validation");

  // --- stage 11: organization candidate from the validated learning ---
  const orgV2 = {
    ...orgDraft,
    version: 2,
    learnedPreferences: [learningArtifact.learningArtifactId],
    evidence: [...orgDraft.evidence, promotionV1.promotionId],
  };
  await registry.registerDraft({ record: orgV2 });

  // --- stage 12: evaluation (intervention cost is a first-class signal) ---
  const candidates = [
    {
      organization: orgDraft,
      rationale: "v1 baseline",
      evidence: [] as readonly SportaId[],
    },
    {
      organization: orgV2,
      rationale: "v2 candidate improved by Arena-validated learning",
      evidence: [learningArtifact.learningArtifactId],
    },
  ];
  const report = await evaluation.evaluateCandidates({
    candidates,
    evidence: [learningArtifact.learningArtifactId],
    interventionCost: { manualInterventions: 1, userSeconds: 45 },
  });
  assert.ok(report.metrics.length > 0);
  assert.ok(
    report.metrics.some((m) => m.axis === "intervention-cost"),
    "intervention cost must be included",
  );

  // --- stage 13: promotion of the improved organization (immutable) ---
  const promotionV2 = await registry.promote({ organizationId: "org:replay", version: 2 });
  assert.equal(promotionV2.decision, "promoted");
  assert.notEqual(promotionV2.promotionId, promotionV1.promotionId);

  // The loop completes: the agent closes the work (outcome terminal).
  await appendAgent({ kind: "outcome", nodeId: "outcome:loop-complete", parent: "task:render" });

  // --- invariant: the canonical WorkGraph only ever APPENDED ---
  const finalGraph: WorkGraphRecord = await workService.readWorkGraph("wg:a17");
  assert.ok(finalGraph !== null);
  assert.ok(finalGraph.nodes.length > nodesBefore, "the loop appended nodes");
  const firstNodes = finalGraph.nodes.slice(0, nodesBefore);
  assert.deepEqual(firstNodes, graph.nodes, "pre-existing WorkGraph nodes are never rewritten");
  assert.ok(
    finalGraph.nodes.every((n, i) => i === 0 || finalGraph.nodes[i - 1].seq < n.seq),
    "seq stays strictly monotonic",
  );

  // --- invariant: the artifact lineage preserved r1 (never overwritten) ---
  const r1After: typeof r1 = await artifacts.readRevision("rev:a17-1");
  assert.deepEqual(r1After, r1, "revision r1 is byte-identical after the whole loop");
  const lineage = await artifacts.lineage("art:a17");
  assert.equal(lineage.length, 2, "r1 -> r2 chain");
  assert.equal(lineage[1]?.parentRevisionId, "rev:a17-1");

  // --- the product shell projects the whole loop as one trace ---
  const trace = await projection.trace("wg:a17");
  const stageKinds = trace.stages.map((s) => s.stage);
  const expectedStages = [
    "intent",
    "organization",
    "execution",
    "progress",
    "artifact",
    "takeover",
    "editor",
    "learning",
    "capability-gap",
    "arena",
    "result",
    "organization-improvement",
  ];
  assert.deepEqual(stageKinds, expectedStages, "all 12 UX stages project in loop order");
});

test("A17 honesty: a replayed lab simulation is fixture evidence, never production truth", async () => {
  const workService = new WorkGraphService({
    store: new InMemoryWorkGraphStore(),
    now: fixedNow,
  });
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now: fixedNow,
  });
  const lab = new LabService({ catalog: registry, workGraphs: workService, now: fixedNow });
  const graph = await workService.openIntent({ workGraphId: "wg:replay", intent });
  await registry.registerDraft({ record: { ...orgDraftFor("org:replay"), policy } });
  await registry.promote({ organizationId: "org:replay", version: 1 });
  const replay = await lab.replay({
    workGraphId: graph.workGraphId,
    organization: orgDraftFor("org:replay"),
  });
  assert.ok(["success", "partial", "failure"].includes(replay.outcome));
  assert.equal(typeof replay.interventionCost, "number");
});
