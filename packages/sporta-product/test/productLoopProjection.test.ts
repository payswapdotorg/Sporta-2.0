import assert from "node:assert/strict";
import { test } from "node:test";
import type { IntentSpec, PolicySet, WorkGraphRecord } from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import type {
  OrganizationResolverPort,
  OrganizationSelection,
} from "@sporta/organizations/contract";
import type { ArtifactGraphPort } from "@sporta/artifacts/contract";
import type { EditorBrokerPort } from "@sporta/editors/contract";
import type { ArenaClientPort } from "@sporta/arena/contract";
import { ProductLoopProjection } from "../src/app/productLoopProjection.js";
import { UnknownWorkGraphError } from "../src/domain/errors.js";

function fixturePolicySet(): PolicySet {
  return {
    rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

function fixtureIntent(): IntentSpec {
  return {
    goal: "produce a tactical replay of the match",
    constraints: ["keep highlight length under 90s"],
    artifactRequirements: ["tactical-board-video"],
    learningPolicy: { scopes: ["preference"], requireConsent: true },
    policy: fixturePolicySet(),
  };
}

function fixtureWorkGraph(overrides: Partial<WorkGraphRecord> = {}): WorkGraphRecord {
  return {
    workGraphId: "wg:happy",
    intent: fixtureIntent(),
    nodes: [
      { nodeId: "task:1", kind: "task", seq: 1 },
      { nodeId: "run:1", kind: "run", parent: "task:1", seq: 2 },
      { nodeId: "action:1", kind: "action", parent: "run:1", seq: 3 },
      { nodeId: "art:1", kind: "artifact", parent: "action:1", seq: 4 },
      { nodeId: "ev:1", kind: "evidence", parent: "action:1", seq: 5 },
      { nodeId: "out:1", kind: "outcome", parent: "task:1", seq: 6 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    status: "closed",
    ...overrides,
  };
}

/** Hand-written fake WorkGraphPort (fixture-grade, in test file per the work order). */
class FakeWorkGraphPort implements WorkGraphPort {
  openIntentCalls = 0;
  appendNodeCalls = 0;
  readCalls: readonly string[] = [];

  constructor(private readonly graphs: ReadonlyMap<string, WorkGraphRecord>) {}

  async openIntent(): Promise<never> {
    this.openIntentCalls += 1;
    throw new Error("projection must not open intents");
  }

  async readWorkGraph(workGraphId: string): Promise<WorkGraphRecord | null> {
    this.readCalls = [...this.readCalls, workGraphId];
    return this.graphs.get(workGraphId) ?? null;
  }

  async appendNode(): Promise<never> {
    this.appendNodeCalls += 1;
    throw new Error("projection must not append nodes");
  }
}

/** Hand-written fake OrganizationResolverPort. */
class FakeOrganizationResolver implements OrganizationResolverPort {
  resolveCalls = 0;

  readonly selection: OrganizationSelection = {
    selected: {
      organization: {
        organizationId: "org:tactical",
        version: 2,
        intentProfile: "tactical-replay",
        roleGraph: ["role:editor"],
        agentBodies: ["body:fixture"],
        cognitiveSubstrates: ["substrate:fixture"],
        toolGraph: ["tool:fixture"],
        workflowGraph: ["flow:fixture"],
        environmentProfile: "local",
        fallbacks: [],
        budgets: {},
        learnedPreferences: [],
        evidence: ["ev:org"],
        policy: fixturePolicySet(),
      },
      rationale: "fixture rationale: best match for tactical replay intents",
      evidence: ["ev:org"],
    },
    candidates: [],
    explanation: [],
  };

  async resolve(): Promise<OrganizationSelection> {
    this.resolveCalls += 1;
    return this.selection;
  }
}

/** Hand-written fake ArtifactGraphPort. */
class FakeArtifactGraph implements ArtifactGraphPort {
  writeCalls = 0;
  readonly lineages = new Map<string, ReturnType<ArtifactGraphPort["lineage"]>>();

  async recordArtifact(): Promise<never> {
    this.writeCalls += 1;
    throw new Error("projection must not record artifacts");
  }

  async commitRevision(): Promise<never> {
    this.writeCalls += 1;
    throw new Error("projection must not commit revisions");
  }

  async readRevision(): Promise<never> {
    throw new Error("not used by the projection");
  }

  async lineage(artifactId: string) {
    const revisions = this.lineages.get(artifactId) ?? [];
    return [...revisions];
  }
}

/** Hand-written fake EditorBrokerPort — the projection must never call it (v1). */
class FakeEditorBroker implements EditorBrokerPort {
  calls = 0;

  async resolveEditor(): Promise<never> {
    this.calls += 1;
    throw new Error("projection must not resolve editors in v1");
  }

  async openSession(): Promise<never> {
    this.calls += 1;
    throw new Error("projection must not open editor sessions");
  }

  async reconcileSession(): Promise<never> {
    this.calls += 1;
    throw new Error("projection must not reconcile sessions");
  }
}

/** Hand-written fake ArenaClientPort — the projection must never call it (v1). */
class FakeArenaClient implements ArenaClientPort {
  calls = 0;

  private refuse(): never {
    this.calls += 1;
    throw new Error("projection must not use the arena client in v1 (no read-by-work-graph seam)");
  }

  recordGap(): Promise<never> {
    return this.refuse();
  }

  escalate(): Promise<never> {
    return this.refuse();
  }

  readResult(): Promise<never> {
    return this.refuse();
  }

  validateResult(): Promise<never> {
    return this.refuse();
  }
}

function fixtureRevision(
  revisionId: string,
  sourceKind: "agent-run" | "editor-session",
  sourceRef: string,
  parentRevisionId?: string,
) {
  return {
    revisionId,
    artifactId: "art:1",
    ...(parentRevisionId !== undefined ? { parentRevisionId } : {}),
    contentHash: "a".repeat(64),
    toolVersions: ["fixture@1"],
    provenance: {
      sourceKind,
      sourceRef,
      capturedAt: "2026-01-01T00:05:00.000Z",
    },
    policy: fixturePolicySet(),
  };
}

function makeProjection(
  graphs: readonly WorkGraphRecord[],
  artifactLineages: FakeArtifactGraph["lineages"],
) {
  const workGraphs = new FakeWorkGraphPort(
    new Map(graphs.map((graph) => [graph.workGraphId, graph])),
  );
  const organizations = new FakeOrganizationResolver();
  const artifacts = new FakeArtifactGraph();
  artifacts.lineages.clear();
  for (const [artifactId, revisions] of artifactLineages) {
    artifacts.lineages.set(artifactId, revisions);
  }
  const editors = new FakeEditorBroker();
  const arena = new FakeArenaClient();
  const projection = new ProductLoopProjection({
    workGraphs,
    organizations,
    artifacts,
    editors,
    arena,
    environmentProfile: "local-test",
    constraints: [],
  });
  return { projection, workGraphs, organizations, artifacts, editors, arena };
}

test("happy path: the trace contains all 12 canonical stages in order with honest states", async () => {
  const graph = fixtureWorkGraph();
  const { projection, workGraphs, organizations, artifacts, editors, arena } = makeProjection(
    [graph],
    new Map([
      [
        "art:1",
        [
          fixtureRevision("rev:1", "agent-run", "run:1"),
          fixtureRevision("rev:2", "editor-session", "ev:1", "rev:1"),
        ],
      ],
    ]),
  );

  const trace = await projection.trace("wg:happy");

  // the full-array deepEqual asserts all 12 stage kinds in canonical order
  assert.deepEqual(trace.workGraphId, "wg:happy");
  assert.deepEqual(trace.stages, [
    { stage: "intent", ref: "wg:happy", state: "done", detail: "intent admitted" },
    {
      stage: "organization",
      ref: "org:tactical@v2",
      state: "done",
      detail: "fixture rationale: best match for tactical replay intents",
    },
    { stage: "execution", state: "done", detail: "1 outcome node(s)" },
    { stage: "progress", state: "done", detail: "1 task(s), 1 run(s), 1 action(s)" },
    { stage: "artifact", ref: "art:1", state: "done", detail: "2 revision(s)" },
    {
      stage: "takeover",
      state: "pending",
      detail:
        "pending: v1 ports expose no takeover/editor-session history read seam (Wave 2 event projection)",
    },
    {
      stage: "editor",
      state: "pending",
      detail:
        "pending: v1 ports expose no editor-session history read seam (Wave 2 editor read port)",
    },
    {
      stage: "learning",
      state: "pending",
      detail:
        "pending: learning state becomes traceable when arena-result/learning read seams land (Wave 2)",
    },
    {
      stage: "capability-gap",
      state: "pending",
      detail: "no escalation signal in v1 work-graph status",
    },
    {
      stage: "arena",
      state: "pending",
      detail:
        "pending: no in-flight escalation; v1 work-graph status is the only escalation signal",
    },
    {
      stage: "result",
      state: "pending",
      detail:
        "pending: reading the Arena result requires escalation refs which v1 work-graph nodes do not carry",
    },
    {
      stage: "organization-improvement",
      state: "pending",
      detail: "pending: organization candidate/promotion read seams (Worker A, Wave 2)",
    },
  ]);

  // read-model boundary: only read methods were called
  assert.equal(workGraphs.openIntentCalls, 0);
  assert.equal(workGraphs.appendNodeCalls, 0);
  assert.equal(organizations.resolveCalls, 1);
  assert.equal(artifacts.writeCalls, 0);
  assert.equal(editors.calls, 0);
  assert.equal(arena.calls, 0);
});

test("escalated work graph: capability-gap done and arena active", async () => {
  const graph = fixtureWorkGraph({
    status: "escalated",
    nodes: [
      { nodeId: "task:1", kind: "task", seq: 1 },
      { nodeId: "run:1", kind: "run", parent: "task:1", seq: 2 },
      { nodeId: "art:1", kind: "artifact", parent: "run:1", seq: 3 },
    ],
  });
  const { projection } = makeProjection([graph], new Map());
  const trace = await projection.trace("wg:happy");
  const byStage = new Map(trace.stages.map((stage) => [stage.stage, stage]));
  assert.deepEqual(byStage.get("execution"), {
    stage: "execution",
    state: "active",
    detail: "escalated to Arena",
  });
  assert.deepEqual(byStage.get("capability-gap"), {
    stage: "capability-gap",
    state: "done",
    detail: "work graph status: escalated",
  });
  assert.deepEqual(byStage.get("arena"), {
    stage: "arena",
    state: "active",
    detail: "escalation in flight at the Arena",
  });
});

test("early work graph: execution/progress/artifact pending until evidence exists", async () => {
  const graph = fixtureWorkGraph({
    status: "open",
    nodes: [{ nodeId: "task:1", kind: "task", seq: 1 }],
  });
  const { projection } = makeProjection([graph], new Map());
  const trace = await projection.trace("wg:happy");
  const byStage = new Map(trace.stages.map((stage) => [stage.stage, stage]));
  assert.deepEqual(byStage.get("execution"), {
    stage: "execution",
    state: "pending",
    detail: "not started",
  });
  assert.deepEqual(byStage.get("progress"), {
    stage: "progress",
    state: "pending",
    detail: "1 task(s), 0 run(s), 0 action(s)",
  });
  assert.deepEqual(byStage.get("artifact"), {
    stage: "artifact",
    state: "pending",
    detail: "no artifact node yet",
  });
});

test("artifact node without committed revisions is active, not done", async () => {
  const graph = fixtureWorkGraph({
    status: "executing",
    nodes: [
      { nodeId: "task:1", kind: "task", seq: 1 },
      { nodeId: "run:1", kind: "run", parent: "task:1", seq: 2 },
      { nodeId: "action:1", kind: "action", parent: "run:1", seq: 3 },
      { nodeId: "art:1", kind: "artifact", parent: "action:1", seq: 4 },
    ],
  });
  const { projection } = makeProjection([graph], new Map([["art:1", []]]));
  const trace = await projection.trace("wg:happy");
  assert.deepEqual(
    trace.stages.find((stage) => stage.stage === "artifact"),
    {
      stage: "artifact",
      ref: "art:1",
      state: "active",
      detail: "artifact not yet committed",
    },
  );
});

test("unknown workGraphId is a typed error, never a fabricated trace", async () => {
  const { projection } = makeProjection([], new Map());
  await assert.rejects(() => projection.trace("wg:missing"), UnknownWorkGraphError);
});
