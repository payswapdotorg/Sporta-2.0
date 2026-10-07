import { test } from "node:test";
import assert from "node:assert/strict";
import { LabPopulationKindError, LabService, LabWorkGraphNotFoundError } from "../src/contract.js";
import type { LabPopulationKind, LabReplayInput, LabSearchInput } from "../src/contract.js";
import { InMemoryWorkGraphStore, WorkGraphService } from "@sporta/work/contract";
import {
  InMemoryOrganizationStore,
  OrganizationRegistryService,
} from "@sporta/organizations/contract";
import type { IntentSpec, OrganizationVersionRecord } from "@sporta/contracts/contract";

const NOW = "2026-10-07T12:00:00.000Z";
const now = (): string => NOW;

function makeIntent(goal: string): IntentSpec {
  return {
    goal,
    constraints: [],
    artifactRequirements: ["reel"],
    learningPolicy: { scopes: [], requireConsent: true },
    policy: {
      rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
  };
}

function makeOrganization(
  organizationId: string,
  overrides: Partial<OrganizationVersionRecord> = {},
): OrganizationVersionRecord {
  return {
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
    evidence: [],
    policy: makeIntent("goal").policy,
    ...overrides,
  };
}

function makeLabFixture() {
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now,
  });
  const workGraphs = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now });
  const lab = new LabService({ catalog: registry, workGraphs, now });
  return { registry, workGraphs, lab };
}

function makeSearchInput(populations: readonly LabPopulationKind[]): LabSearchInput {
  return {
    intent: makeIntent("produce a tactical replay"),
    environmentProfile: "local",
    constraints: [],
    populations,
  };
}

test("searchPopulation filters the registry by population kind (deterministic order)", async () => {
  const { registry, lab } = makeLabFixture();
  await registry.registerDraft({
    record: makeOrganization("org:generalist", { intentProfile: "sports-replay-generalist" }),
  });
  await registry.registerDraft({
    record: makeOrganization("org:specialist", { intentProfile: "sports-replay-specialist" }),
  });
  await registry.registerDraft({
    record: makeOrganization("org:personalized", { learnedPreferences: ["pref:1"] }),
  });
  await registry.registerDraft({
    record: makeOrganization("org:winner", { evidence: ["ev:winner"] }),
  });
  await registry.promote({ organizationId: "org:winner", version: 1 });

  const results = await lab.searchPopulation(
    makeSearchInput(["baseline-generalist", "specialist"]),
  );
  assert.deepEqual(
    results.map((candidate) => candidate.organization.organizationId),
    ["org:generalist", "org:specialist"],
  );
  assert.ok(results.every((candidate) => candidate.rationale.includes("matched populations:")));
});

test("a candidate matching several requested kinds appears once with all kinds in the rationale", async () => {
  const { registry, lab } = makeLabFixture();
  await registry.registerDraft({
    record: makeOrganization("org:mixed", {
      intentProfile: "generalist-winner-replay",
      evidence: ["ev:mixed"],
    }),
  });
  await registry.promote({ organizationId: "org:mixed", version: 1 });
  const results = await lab.searchPopulation(
    makeSearchInput(["baseline-generalist", "historical-winner"]),
  );
  assert.equal(results.length, 1);
  assert.equal(results[0]?.organization.organizationId, "org:mixed");
  assert.equal(
    results[0]?.rationale,
    "matched populations: baseline-generalist, historical-winner",
  );
});

test("searchPopulation with no matches returns an honest empty array", async () => {
  const { lab } = makeLabFixture();
  const results = await lab.searchPopulation(makeSearchInput(["arena-improved"]));
  assert.deepEqual(results, []);
});

test("searchPopulation with an unknown kind is a typed error", async () => {
  const { lab } = makeLabFixture();
  const bad = ["not-a-kind"] as unknown as readonly LabPopulationKind[];
  await assert.rejects(
    lab.searchPopulation(makeSearchInput(bad)),
    (error: unknown) => error instanceof LabPopulationKindError,
  );
});

interface ReplayFixture {
  lab: LabService;
  workGraphs: WorkGraphService;
}

function makeReplayFixture(): ReplayFixture {
  return makeLabFixture();
}

async function buildTakeoverGraph(workGraphs: WorkGraphService): Promise<void> {
  const agentActor = { actorKind: "agent-run", actorRef: "run:1" } as const;
  const userActor = { actorKind: "user", actorRef: "user:alice" } as const;
  await workGraphs.openIntent({ workGraphId: "wg:replay-1", intent: makeIntent("goal") });
  await workGraphs.appendNode({ workGraphId: "wg:replay-1", kind: "run", actor: agentActor });
  await workGraphs.appendNode({ workGraphId: "wg:replay-1", kind: "action", actor: userActor });
  await workGraphs.appendNode({ workGraphId: "wg:replay-1", kind: "action", actor: userActor });
  await workGraphs.appendNode({ workGraphId: "wg:replay-1", kind: "action", actor: agentActor });
  await workGraphs.appendNode({ workGraphId: "wg:replay-1", kind: "evidence", actor: agentActor });
  await workGraphs.appendNode({ workGraphId: "wg:replay-1", kind: "outcome", actor: agentActor });
}

test("replay reports an honest shape: outcome, interventionCost, evidence, replayedAt", async () => {
  const { lab, workGraphs } = makeReplayFixture();
  await buildTakeoverGraph(workGraphs);
  const input: LabReplayInput = {
    workGraphId: "wg:replay-1",
    organization: makeOrganization("org:candidate"),
  };
  const report = await lab.replay(input);
  assert.equal(report.workGraphId, "wg:replay-1");
  assert.equal(report.organizationId, "org:candidate");
  assert.equal(report.replayedAt, NOW);
  assert.equal(report.outcome, "success");
  assert.equal(report.interventionCost, 2);
  assert.deepEqual(report.evidence, ["node:wg:replay-1:5"]);
});

test("replay intervention cost decreases with the candidate's learned preferences (simulation)", async () => {
  const { lab, workGraphs } = makeReplayFixture();
  await buildTakeoverGraph(workGraphs);
  const oneLearned = await lab.replay({
    workGraphId: "wg:replay-1",
    organization: makeOrganization("org:learned", { learnedPreferences: ["pref:1"] }),
  });
  assert.equal(oneLearned.interventionCost, 1);
  const twoLearned = await lab.replay({
    workGraphId: "wg:replay-1",
    organization: makeOrganization("org:learned", { learnedPreferences: ["pref:1", "pref:2"] }),
  });
  assert.equal(twoLearned.interventionCost, 0);
  const saturated = await lab.replay({
    workGraphId: "wg:replay-1",
    organization: makeOrganization("org:over", {
      learnedPreferences: ["pref:1", "pref:2", "pref:3"],
    }),
  });
  assert.equal(saturated.interventionCost, 0);
});

test("replay outcome is partial for an unfinished graph and failure for escalated/empty", async () => {
  const { lab, workGraphs } = makeReplayFixture();
  await workGraphs.openIntent({ workGraphId: "wg:awaiting", intent: makeIntent("goal") });
  const agentActor = { actorKind: "agent-run", actorRef: "run:1" } as const;
  await workGraphs.appendNode({ workGraphId: "wg:awaiting", kind: "run", actor: agentActor });
  const partial = await lab.replay({
    workGraphId: "wg:awaiting",
    organization: makeOrganization("org:candidate"),
  });
  assert.equal(partial.outcome, "partial");

  await workGraphs.transitionStatus("wg:awaiting", "escalated");
  const failure = await lab.replay({
    workGraphId: "wg:awaiting",
    organization: makeOrganization("org:candidate"),
  });
  assert.equal(failure.outcome, "failure");

  await workGraphs.openIntent({ workGraphId: "wg:empty", intent: makeIntent("goal") });
  const empty = await lab.replay({
    workGraphId: "wg:empty",
    organization: makeOrganization("org:candidate"),
  });
  assert.equal(empty.outcome, "failure");
});

test("replay of an unknown work graph is a typed error", async () => {
  const { lab } = makeReplayFixture();
  await assert.rejects(
    lab.replay({ workGraphId: "wg:unknown", organization: makeOrganization("org:candidate") }),
    (error: unknown) => error instanceof LabWorkGraphNotFoundError,
  );
});
