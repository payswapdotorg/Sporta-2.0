/**
 * Wave-3 read-seam wiring tests for the ProductLoopProjection.
 *
 * EVIDENCE CLASS: fixture — hand-written in-test seam implementations
 * typed from the frozen @sporta/contracts shapes (the real seams land in
 * their owning modules: sporta-editors worker-b, sporta-lab/evaluation
 * worker-a; the arena/product seams are production code tested in their
 * own packages). The PROJECTION WIRING under test is production code.
 *
 * Project law: node:test + tsx only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  EditorSessionHistoryQuery,
  EditorSessionSummary,
  EscalationQuery,
  EscalationReadPort,
  EscalationResultQuery,
  EscalationResultSummary,
  EscalationSummary,
  IntentSpec,
  LearningArtifactQuery,
  LearningArtifactSummary,
  OrganizationCandidateQuery,
  OrganizationCandidateSummary,
  PolicySet,
  PromotionSummary,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import type {
  OrganizationResolverPort,
  OrganizationSelection,
} from "@sporta/organizations/contract";
import type { ArtifactGraphPort, ArtifactRevisionRecord } from "@sporta/artifacts/contract";
import type { EditorBrokerPort } from "@sporta/editors/contract";
import type { ArenaClientPort } from "@sporta/arena/contract";
import { ProductLoopProjection } from "../src/app/productLoopProjection.js";
import { SEAM_TAKEOVER, SEAM_EDITOR, SEAM_LEARNING } from "../src/app/productLoopSeamStages.js";
import {
  SEAM_ARENA,
  SEAM_RESULT,
  SEAM_IMPROVEMENT,
} from "../src/app/productLoopEscalationStages.js";

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
    learningPolicy: {
      scopes: ["preference", "workflow", "organization-composition"],
      requireConsent: true,
    },
    policy: fixturePolicySet(),
  };
}

function fixtureRevision(
  revisionId: string,
  sourceKind: "agent-run" | "editor-session",
  sourceRef: string,
): ArtifactRevisionRecord {
  return {
    revisionId,
    artifactId: "art:1",
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

function fixtureWorkGraph(overrides: Partial<WorkGraphRecord> = {}): WorkGraphRecord {
  return {
    workGraphId: "wg:seam",
    intent: fixtureIntent(),
    nodes: [
      { nodeId: "task:1", kind: "task", seq: 1 },
      { nodeId: "run:1", kind: "run", parent: "task:1", seq: 2 },
      { nodeId: "action:1", kind: "action", parent: "run:1", seq: 3 },
      { nodeId: "art:1", kind: "artifact", parent: "action:1", seq: 4 },
      { nodeId: "out:1", kind: "outcome", parent: "task:1", seq: 5 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    status: "closed",
    ...overrides,
  };
}

class FakeWorkGraphPort implements WorkGraphPort {
  constructor(private readonly graphs: ReadonlyMap<string, WorkGraphRecord>) {}
  async openIntent(): Promise<never> {
    throw new Error("projection must not open intents");
  }
  async readWorkGraph(workGraphId: string): Promise<WorkGraphRecord | null> {
    return this.graphs.get(workGraphId) ?? null;
  }
  async appendNode(): Promise<never> {
    throw new Error("projection must not append nodes");
  }
}

const FIXTURE_ORG = {
  organizationId: "org:tactical",
  version: 1,
  intentProfile: "tactical-replay",
  roleGraph: [],
  agentBodies: [],
  cognitiveSubstrates: [],
  toolGraph: [],
  workflowGraph: [],
  environmentProfile: "local",
  fallbacks: [],
  budgets: {},
  learnedPreferences: [] as string[],
  evidence: ["ev:org"],
  policy: fixturePolicySet(),
};

class FakeOrganizationResolver implements OrganizationResolverPort {
  resolveCalls = 0;
  constructor(private readonly learnedPreferences: readonly string[] = []) {}
  async resolve(): Promise<OrganizationSelection> {
    this.resolveCalls += 1;
    return {
      selected: {
        organization: { ...FIXTURE_ORG, learnedPreferences: [...this.learnedPreferences] },
        rationale: "fixture rationale: best match for tactical replay intents",
        evidence: ["ev:org"],
      },
      candidates: [],
      explanation: [],
    };
  }
}

class FakeArtifactGraph implements ArtifactGraphPort {
  constructor(private readonly lineages: ReadonlyMap<string, readonly ArtifactRevisionRecord[]>) {}
  async recordArtifact(): Promise<never> {
    throw new Error("projection must not record artifacts");
  }
  async commitRevision(): Promise<never> {
    throw new Error("projection must not commit revisions");
  }
  async readRevision(): Promise<never> {
    throw new Error("not used by the projection");
  }
  async lineage(artifactId: string) {
    return [...(this.lineages.get(artifactId) ?? [])];
  }
}

class FakeEditorBroker implements EditorBrokerPort {
  async resolveEditor(): Promise<never> {
    throw new Error("projection must not resolve editors");
  }
  async openSession(): Promise<never> {
    throw new Error("projection must not open editor sessions");
  }
  async reconcileSession(): Promise<never> {
    throw new Error("projection must not reconcile sessions");
  }
}

class FakeArenaClient implements ArenaClientPort {
  async recordGap(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
  async escalate(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
  async readResult(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
  async validateResult(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
}

/** In-test editor-session history seam (records queries for assertions). */
class FakeEditorSessionHistory {
  queries: readonly EditorSessionHistoryQuery[] = [];
  constructor(private readonly sessions: readonly EditorSessionSummary[]) {}
  async listEditorSessions(
    query: EditorSessionHistoryQuery,
  ): Promise<readonly EditorSessionSummary[]> {
    this.queries = [...this.queries, query];
    let out = this.sessions;
    if (query.editorSessionId !== undefined) {
      out = out.filter((session) => session.editorSessionId === query.editorSessionId);
    }
    if (query.revisionId !== undefined) {
      out = out.filter((session) => session.revisionId === query.revisionId);
    }
    if (query.openOnly === true) {
      out = out.filter((session) => session.closedAt === undefined);
    }
    return out.slice(0, query.limit ?? 50);
  }
}

function editorSession(
  editorSessionId: string,
  revisionId: string,
  closedAt?: string,
): EditorSessionSummary {
  return {
    editorSessionId,
    editorId: "kdenlive",
    revisionId,
    mode: "local",
    integrationLevel: 2,
    openedAt: "2026-01-01T00:06:00.000Z",
    ...(closedAt === undefined ? {} : { closedAt }),
  };
}

/** In-test learning artifact seam. */
class FakeLearningArtifacts {
  queries: readonly LearningArtifactQuery[] = [];
  constructor(private readonly summaries: readonly LearningArtifactSummary[]) {}
  async listLearningArtifacts(
    query: LearningArtifactQuery,
  ): Promise<readonly LearningArtifactSummary[]> {
    this.queries = [...this.queries, query];
    let out = this.summaries;
    if (query.learningArtifactId !== undefined) {
      out = out.filter((s) => s.learningArtifactId === query.learningArtifactId);
    }
    if (query.scope !== undefined) {
      out = out.filter((s) => s.scope === query.scope);
    }
    if (query.status !== undefined) {
      out = out.filter((s) => s.status === query.status);
    }
    return out.slice(0, query.limit ?? 50);
  }
}

function learningArtifact(
  learningArtifactId: string,
  klass: LearningArtifactSummary["class"],
  status: LearningArtifactSummary["status"] = "candidate",
): LearningArtifactSummary {
  return { learningArtifactId, class: klass, scope: "user", status };
}

/** In-test organization candidate seam. */
class FakeOrganizationCandidates {
  candidateQueries: readonly OrganizationCandidateQuery[] = [];
  promotionQueries: readonly OrganizationCandidateQuery[] = [];
  constructor(
    private readonly candidates: readonly OrganizationCandidateSummary[],
    private readonly promotions: readonly PromotionSummary[] = [],
  ) {}
  async listOrganizationCandidates(
    query: OrganizationCandidateQuery,
  ): Promise<readonly OrganizationCandidateSummary[]> {
    this.candidateQueries = [...this.candidateQueries, query];
    let out = this.candidates;
    if (query.organizationId !== undefined) {
      out = out.filter((c) => c.organizationId === query.organizationId);
    }
    if (query.candidateId !== undefined) {
      out = out.filter((c) => c.candidateId === query.candidateId);
    }
    if (query.status !== undefined) {
      out = out.filter((c) => c.status === query.status);
    }
    return out.slice(0, query.limit ?? 50);
  }
  async listPromotions(query: OrganizationCandidateQuery): Promise<readonly PromotionSummary[]> {
    this.promotionQueries = [...this.promotionQueries, query];
    let out = this.promotions;
    if (query.organizationId !== undefined) {
      out = out.filter((p) => {
        const candidate = this.candidates.find((c) => c.candidateId === p.candidateId);
        return candidate?.organizationId === query.organizationId;
      });
    }
    return out.slice(0, query.limit ?? 50);
  }
}

function candidate(
  candidateId: string,
  status: OrganizationCandidateSummary["status"],
): OrganizationCandidateSummary {
  return {
    candidateId,
    organizationId: "org:tactical",
    version: 2,
    status,
    basis: "fixture basis",
  };
}

function promotion(candidateId: string, decision: PromotionSummary["decision"]): PromotionSummary {
  return {
    promotionId: `promo:${candidateId}`,
    candidateId,
    decision,
    decidedAt: "2026-01-02T00:00:00.000Z",
  };
}

/** In-test escalation seam. */
class FakeEscalations implements EscalationReadPort {
  escalationQueries: readonly EscalationQuery[] = [];
  resultQueries: readonly EscalationResultQuery[] = [];
  constructor(
    private readonly escalations: readonly EscalationSummary[],
    private readonly results: readonly EscalationResultSummary[] = [],
  ) {}
  async listEscalations(query: EscalationQuery): Promise<readonly EscalationSummary[]> {
    this.escalationQueries = [...this.escalationQueries, query];
    let out = this.escalations;
    if (query.escalationId !== undefined) {
      out = out.filter((e) => e.escalationId === query.escalationId);
    }
    if (query.workGraphId !== undefined) {
      out = out.filter((e) => e.workGraphId === query.workGraphId);
    }
    if (query.gapId !== undefined) {
      out = out.filter((e) => e.gapId === query.gapId);
    }
    return out.slice(0, query.limit ?? 50);
  }
  async listResults(query: EscalationResultQuery): Promise<readonly EscalationResultSummary[]> {
    this.resultQueries = [...this.resultQueries, query];
    let out = this.results;
    if (query.escalationId !== undefined) {
      out = out.filter((r) => r.escalationId === query.escalationId);
    }
    if (query.resultId !== undefined) {
      out = out.filter((r) => r.resultId === query.resultId);
    }
    if (query.validatedOnly === true) {
      out = out.filter((r) => r.validated);
    }
    return out.slice(0, query.limit ?? 50);
  }
}

function escalationSummary(
  escalationId: string,
  lifecycle: EscalationSummary["lifecycle"],
): EscalationSummary {
  return {
    escalationId,
    gapId: `gap:${escalationId}`,
    workGraphId: "wg:seam",
    sessionMode: "unblock",
    lifecycle,
  };
}

function resultSummary(
  resultId: string,
  validated: boolean,
  escalationId = "esc:1",
): EscalationResultSummary {
  return { resultId, escalationId, resultType: "unblock", validated };
}

interface Harness {
  projection: ProductLoopProjection;
  resolver: FakeOrganizationResolver;
  editorHistory: FakeEditorSessionHistory;
  learning: FakeLearningArtifacts;
  candidates: FakeOrganizationCandidates;
  escalations: FakeEscalations;
}

function makeHarness(
  graph: WorkGraphRecord,
  lineages: ReadonlyMap<string, readonly ArtifactRevisionRecord[]>,
  seams: {
    sessions?: readonly EditorSessionSummary[];
    learningSummaries?: readonly LearningArtifactSummary[];
    candidateList?: readonly OrganizationCandidateSummary[];
    promotions?: readonly PromotionSummary[];
    escalationList?: readonly EscalationSummary[];
    results?: readonly EscalationResultSummary[];
    learnedPreferences?: readonly string[];
  } = {},
  inject: Partial<{
    editor: boolean;
    learning: boolean;
    candidates: boolean;
    escalations: boolean;
  }> = {},
): Harness {
  const resolver = new FakeOrganizationResolver(seams.learnedPreferences);
  const editorHistory = new FakeEditorSessionHistory(seams.sessions ?? []);
  const learning = new FakeLearningArtifacts(seams.learningSummaries ?? []);
  const candidates = new FakeOrganizationCandidates(
    seams.candidateList ?? [],
    seams.promotions ?? [],
  );
  const escalations = new FakeEscalations(seams.escalationList ?? [], seams.results ?? []);
  const projection = new ProductLoopProjection({
    workGraphs: new FakeWorkGraphPort(new Map([[graph.workGraphId, graph]])),
    organizations: resolver,
    artifacts: new FakeArtifactGraph(lineages),
    editors: new FakeEditorBroker(),
    arena: new FakeArenaClient(),
    ...(inject.editor ? { editorSessionHistory: editorHistory } : {}),
    ...(inject.learning ? { learningArtifacts: learning } : {}),
    ...(inject.candidates ? { organizationCandidates: candidates } : {}),
    ...(inject.escalations ? { escalations } : {}),
  });
  return { projection, resolver, editorHistory, learning, candidates, escalations };
}

function byStage(stages: readonly { stage: string }[]) {
  return new Map(stages.map((stage) => [stage.stage, stage]));
}

test("takeover/editor: a reconciled editor-session revision makes both stages done", async () => {
  const graph = fixtureWorkGraph();
  const harness = makeHarness(
    graph,
    new Map([
      [
        "art:1",
        [
          fixtureRevision("rev:1", "agent-run", "run:1"),
          fixtureRevision("rev:2", "editor-session", "es:1"),
        ],
      ],
    ]),
    { sessions: [editorSession("es:1", "rev:1")] },
    { editor: true },
  );
  const trace = await harness.projection.trace("wg:seam");
  const stages = byStage(trace.stages);
  assert.deepEqual(stages.get("takeover"), {
    stage: "takeover",
    state: "done",
    ref: "rev:2",
    detail: "1 user takeover revision(s) reconciled",
  });
  assert.deepEqual(stages.get("editor"), {
    stage: "editor",
    state: "done",
    ref: "rev:2",
    detail: "1 editor revision(s) committed",
  });
  assert.equal(harness.resolver.resolveCalls, 1, "resolve is called exactly once");
});

test("takeover/editor: an open session with no reconciled revision is active; closed is done; none is pending", async () => {
  const open = makeHarness(
    fixtureWorkGraph(),
    new Map([["art:1", [fixtureRevision("rev:1", "agent-run", "run:1")]]]),
    { sessions: [editorSession("es:1", "rev:1")] },
    { editor: true },
  );
  const openTrace = await open.projection.trace("wg:seam");
  assert.deepEqual(byStage(openTrace.stages).get("takeover"), {
    stage: "takeover",
    state: "active",
    detail: "1 open editor session(s)",
  });
  assert.deepEqual(byStage(openTrace.stages).get("editor"), {
    stage: "editor",
    state: "active",
    detail: "1 open editor session(s)",
  });

  const closed = makeHarness(
    fixtureWorkGraph(),
    new Map([["art:1", [fixtureRevision("rev:1", "agent-run", "run:1")]]]),
    { sessions: [editorSession("es:1", "rev:1", "2026-01-01T01:00:00.000Z")] },
    { editor: true },
  );
  const closedTrace = await closed.projection.trace("wg:seam");
  assert.equal(byStage(closedTrace.stages).get("editor")?.state, "done");
  assert.equal(byStage(closedTrace.stages).get("editor")?.detail, "1 closed editor session(s)");

  const none = makeHarness(
    fixtureWorkGraph(),
    new Map([["art:1", [fixtureRevision("rev:1", "agent-run", "run:1")]]]),
    { sessions: [] },
    { editor: true },
  );
  const noneTrace = await none.projection.trace("wg:seam");
  assert.deepEqual(byStage(noneTrace.stages).get("takeover"), {
    stage: "takeover",
    state: "pending",
    detail: "no editor session yet",
  });
});

test("takeover/editor: node refs (editor-session, artifact-revision) drive session lookups", async () => {
  const graph = fixtureWorkGraph({
    nodes: [
      ...fixtureWorkGraph().nodes,
      {
        nodeId: "run:2",
        kind: "run",
        parent: "task:1",
        seq: 6,
        refs: [
          { kind: "editor-session", refId: "es:ref" },
          { kind: "artifact-revision", refId: "rev:ref" },
        ],
      },
    ],
  });
  const harness = makeHarness(
    graph,
    new Map(),
    { sessions: [editorSession("es:ref", "rev:ref")] },
    { editor: true },
  );
  const trace = await harness.projection.trace("wg:seam");
  assert.equal(byStage(trace.stages).get("editor")?.state, "active");
  const queried = harness.editorHistory.queries.map((query) => ({
    id: query.editorSessionId,
    rev: query.revisionId,
  }));
  assert.ok(
    queried.some((q) => q.id === "es:ref"),
    "the editor-session node ref drives a session query",
  );
  assert.ok(
    queried.some((q) => q.rev === "rev:ref"),
    "the artifact-revision node ref drives a revision query",
  );
});

test("learning: candidate in policy scope is active; promoted status or promoted-org reference is done", async () => {
  const graph = fixtureWorkGraph();
  const candidateOnly = makeHarness(
    graph,
    new Map(),
    { learningSummaries: [learningArtifact("learn:1", "workflow")] },
    { learning: true },
  );
  const candidateTrace = await candidateOnly.projection.trace("wg:seam");
  assert.deepEqual(byStage(candidateTrace.stages).get("learning"), {
    stage: "learning",
    state: "active",
    ref: "learn:1",
    detail: "1 candidate learning artifact(s)",
  });

  const promotedStatus = makeHarness(
    graph,
    new Map(),
    { learningSummaries: [learningArtifact("learn:1", "workflow", "promoted")] },
    { learning: true },
  );
  const promotedTrace = await promotedStatus.projection.trace("wg:seam");
  assert.deepEqual(byStage(promotedTrace.stages).get("learning"), {
    stage: "learning",
    state: "done",
    ref: "learn:1",
    detail: "1 learning artifact(s) promoted",
  });

  const promotedByOrg = makeHarness(
    graph,
    new Map(),
    {
      learningSummaries: [learningArtifact("learn:1", "workflow")],
      learnedPreferences: ["learn:1"],
    },
    { learning: true },
  );
  const orgTrace = await promotedByOrg.projection.trace("wg:seam");
  assert.equal(byStage(orgTrace.stages).get("learning")?.state, "done");
});

test("learning: out-of-policy-scope classes and rejected artifacts degrade honestly", async () => {
  const outOfScope = makeHarness(
    fixtureWorkGraph(),
    new Map(),
    { learningSummaries: [learningArtifact("learn:policy", "policy")] },
    { learning: true },
  );
  const outTrace = await outOfScope.projection.trace("wg:seam");
  assert.deepEqual(byStage(outTrace.stages).get("learning"), {
    stage: "learning",
    state: "pending",
    detail: "no learning artifact in policy scope yet",
  });

  const rejected = makeHarness(
    fixtureWorkGraph(),
    new Map(),
    { learningSummaries: [learningArtifact("learn:1", "workflow", "rejected")] },
    { learning: true },
  );
  const rejectedTrace = await rejected.projection.trace("wg:seam");
  assert.deepEqual(byStage(rejectedTrace.stages).get("learning"), {
    stage: "learning",
    state: "refused",
    detail: "1 rejected learning artifact(s)",
  });
});

test("arena stages: in-flight escalation is active; concluded + validated result is done; rejected is refused", async () => {
  const inFlight = makeHarness(
    fixtureWorkGraph({ status: "closed" }),
    new Map(),
    {
      escalationList: [escalationSummary("esc:1", "in_progress")],
      results: [resultSummary("res:1", false)],
    },
    { escalations: true },
  );
  const inFlightTrace = await inFlight.projection.trace("wg:seam");
  assert.deepEqual(byStage(inFlightTrace.stages).get("capability-gap"), {
    stage: "capability-gap",
    state: "done",
    ref: "gap:esc:1",
    detail: "1 capability gap(s) escalated to the Arena",
  });
  assert.deepEqual(byStage(inFlightTrace.stages).get("arena"), {
    stage: "arena",
    state: "active",
    ref: "esc:1",
    detail: "escalation in flight (in_progress)",
  });
  assert.deepEqual(byStage(inFlightTrace.stages).get("result"), {
    stage: "result",
    state: "active",
    ref: "res:1",
    detail: "1 result(s) awaiting validation",
  });

  const concluded = makeHarness(
    fixtureWorkGraph({ status: "closed" }),
    new Map(),
    {
      escalationList: [escalationSummary("esc:1", "accepted_result")],
      results: [resultSummary("res:1", true)],
    },
    { escalations: true },
  );
  const concludedTrace = await concluded.projection.trace("wg:seam");
  assert.deepEqual(byStage(concludedTrace.stages).get("arena"), {
    stage: "arena",
    state: "done",
    ref: "esc:1",
    detail: "escalation concluded (accepted_result)",
  });
  assert.deepEqual(byStage(concludedTrace.stages).get("result"), {
    stage: "result",
    state: "done",
    ref: "res:1",
    detail: "1 validated result(s)",
  });

  const rejected = makeHarness(
    fixtureWorkGraph({ status: "closed" }),
    new Map(),
    { escalationList: [escalationSummary("esc:1", "rejected")] },
    { escalations: true },
  );
  const rejectedTrace = await rejected.projection.trace("wg:seam");
  assert.deepEqual(byStage(rejectedTrace.stages).get("arena"), {
    stage: "arena",
    state: "refused",
    ref: "esc:1",
    detail: "escalation rejected by the Arena",
  });

  const revision = makeHarness(
    fixtureWorkGraph({ status: "closed" }),
    new Map(),
    { escalationList: [escalationSummary("esc:1", "revision_required")] },
    { escalations: true },
  );
  const revisionTrace = await revision.projection.trace("wg:seam");
  assert.deepEqual(byStage(revisionTrace.stages).get("arena"), {
    stage: "arena",
    state: "blocked",
    ref: "esc:1",
    detail: "escalation requires revision",
  });
});

test("arena stages: seam present with no escalations honors the v1 status signal", async () => {
  const escalated = makeHarness(
    fixtureWorkGraph({ status: "escalated" }),
    new Map(),
    {},
    { escalations: true },
  );
  const escalatedTrace = await escalated.projection.trace("wg:seam");
  assert.deepEqual(byStage(escalatedTrace.stages).get("capability-gap"), {
    stage: "capability-gap",
    state: "done",
    detail: "work graph status: escalated",
  });
  assert.deepEqual(byStage(escalatedTrace.stages).get("arena"), {
    stage: "arena",
    state: "active",
    detail: "escalation in flight at the Arena",
  });

  const quiet = makeHarness(
    fixtureWorkGraph({ status: "closed" }),
    new Map(),
    {},
    { escalations: true },
  );
  const quietTrace = await quiet.projection.trace("wg:seam");
  assert.deepEqual(byStage(quietTrace.stages).get("arena"), {
    stage: "arena",
    state: "pending",
    detail: "no escalation recorded for this work graph",
  });
  assert.deepEqual(byStage(quietTrace.stages).get("result"), {
    stage: "result",
    state: "pending",
    detail: "no Arena result yet",
  });
});

test("arena/result: escalation and arena-result node refs drive seam queries", async () => {
  const graph = fixtureWorkGraph({
    nodes: [
      ...fixtureWorkGraph().nodes,
      {
        nodeId: "run:2",
        kind: "run",
        parent: "task:1",
        seq: 6,
        refs: [
          { kind: "escalation", refId: "esc:from-ref" },
          { kind: "arena-result", refId: "res:from-ref" },
          { kind: "capability-gap", refId: "gap:from-ref" },
        ],
      },
    ],
  });
  const harness = makeHarness(
    graph,
    new Map(),
    {
      escalationList: [escalationSummary("esc:from-ref", "accepted_result")],
      results: [resultSummary("res:from-ref", true, "esc:from-ref")],
    },
    { escalations: true },
  );
  const trace = await harness.projection.trace("wg:seam");
  assert.equal(byStage(trace.stages).get("arena")?.state, "done");
  assert.equal(byStage(trace.stages).get("result")?.state, "done");
  assert.ok(
    harness.escalations.escalationQueries.some((query) => query.escalationId === "esc:from-ref"),
    "the escalation node ref drives an escalation query",
  );
  assert.ok(
    harness.escalations.resultQueries.some((query) => query.resultId === "res:from-ref"),
    "the arena-result node ref drives a result query",
  );
});

test("organization-improvement: live candidate is active; promotion completes it", async () => {
  const candidateState = makeHarness(
    fixtureWorkGraph(),
    new Map(),
    { candidateList: [candidate("cand:1", "candidate")], promotions: [] },
    { candidates: true },
  );
  const candidateTrace = await candidateState.projection.trace("wg:seam");
  assert.deepEqual(byStage(candidateTrace.stages).get("organization-improvement"), {
    stage: "organization-improvement",
    state: "active",
    ref: "cand:1",
    detail: "1 candidate organization version(s)",
  });
  assert.ok(
    candidateState.candidates.candidateQueries.every(
      (query) => query.organizationId === "org:tactical",
    ),
    "queries are scoped to the resolved organization",
  );

  // A past promotion does not mask a LIVE candidate (the current leg wins).
  const liveOverPast = makeHarness(
    fixtureWorkGraph(),
    new Map(),
    {
      candidateList: [candidate("cand:1", "promoted"), candidate("cand:2", "candidate")],
      promotions: [promotion("cand:1", "promoted")],
    },
    { candidates: true },
  );
  const liveTrace = await liveOverPast.projection.trace("wg:seam");
  assert.equal(byStage(liveTrace.stages).get("organization-improvement")?.state, "active");

  const promotedState = makeHarness(
    fixtureWorkGraph(),
    new Map(),
    {
      candidateList: [candidate("cand:1", "candidate"), candidate("cand:2", "promoted")],
      promotions: [promotion("cand:1", "promoted"), promotion("cand:2", "promoted")],
    },
    { candidates: true },
  );
  const promotedTrace = await promotedState.projection.trace("wg:seam");
  assert.deepEqual(byStage(promotedTrace.stages).get("organization-improvement"), {
    stage: "organization-improvement",
    state: "done",
    ref: "promo:cand:2",
    detail: "2 promoted organization version(s)",
  });
});

test("degradation law: each absent seam keeps its exact v1 pending string while others are wired", async () => {
  const graph = fixtureWorkGraph();
  const harness = makeHarness(
    graph,
    new Map([["art:1", [fixtureRevision("rev:1", "agent-run", "run:1")]]]),
    {
      sessions: [editorSession("es:1", "rev:1")],
      learningSummaries: [learningArtifact("learn:1", "workflow")],
      escalationList: [escalationSummary("esc:1", "accepted_result")],
      results: [resultSummary("res:1", true)],
      candidateList: [candidate("cand:1", "candidate")],
      promotions: [promotion("cand:1", "promoted")],
    },
    { editor: true, learning: true, candidates: true, escalations: true },
  );
  // All four wired: the six seam stages are NOT pending.
  const full = await harness.projection.trace("wg:seam");
  for (const stage of full.stages) {
    if (stage.stage !== "execution") {
      assert.notEqual(stage.state, "pending", `${stage.stage} is un-pended with all seams wired`);
    }
  }

  // Now remove each seam in turn; only that stage's pending string returns.
  const cases: [
    string,
    Partial<{ editor: boolean; learning: boolean; candidates: boolean; escalations: boolean }>,
    string,
  ][] = [
    ["takeover", { learning: true, candidates: true, escalations: true }, SEAM_TAKEOVER],
    ["editor", { learning: true, candidates: true, escalations: true }, SEAM_EDITOR],
    ["learning", { editor: true, candidates: true, escalations: true }, SEAM_LEARNING],
    ["arena", { editor: true, learning: true, candidates: true }, SEAM_ARENA],
    ["result", { editor: true, learning: true, candidates: true }, SEAM_RESULT],
    [
      "organization-improvement",
      { editor: true, learning: true, escalations: true },
      SEAM_IMPROVEMENT,
    ],
  ];
  const seams = {
    sessions: [editorSession("es:1", "rev:1")],
    learningSummaries: [learningArtifact("learn:1", "workflow")],
    escalationList: [escalationSummary("esc:1", "accepted_result")],
    results: [resultSummary("res:1", true)],
    candidateList: [candidate("cand:1", "candidate")],
    promotions: [promotion("cand:1", "promoted")],
  };
  for (const [stageKind, inject, expectedDetail] of cases) {
    const degraded = makeHarness(
      graph,
      new Map([["art:1", [fixtureRevision("rev:1", "agent-run", "run:1")]]]),
      seams,
      inject,
    );
    const trace = await degraded.projection.trace("wg:seam");
    const stage = byStage(trace.stages).get(stageKind);
    assert.equal(
      stage?.state,
      "pending",
      `${stageKind} degrades to pending when its seam is absent`,
    );
    assert.equal(stage?.detail, expectedDetail, `${stageKind} keeps the exact v1 pending string`);
  }
});
