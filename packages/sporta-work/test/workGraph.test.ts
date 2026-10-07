import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FixtureAgentRuntimeAdapter,
  InMemoryWorkGraphStore,
  WorkGraphIntentConflictError,
  WorkGraphNodeConflictError,
  WorkGraphNodeParentError,
  WorkGraphNotFoundError,
  WorkGraphService,
  WorkGraphStatusError,
} from "../src/contract.js";
import type { IntentSpec, SportaId } from "@sporta/contracts/contract";

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

function makeService(): WorkGraphService {
  return new WorkGraphService({ store: new InMemoryWorkGraphStore(), now });
}

const agentActor = { actorKind: "agent-run", actorRef: "run:1" } as const;
const userActor = { actorKind: "user", actorRef: "user:alice" } as const;

test("openIntent is idempotent: same intent twice -> same graph, no duplicate", async () => {
  const service = makeService();
  const first = await service.openIntent({ intent: makeIntent("produce a tactical replay") });
  const second = await service.openIntent({ intent: makeIntent("produce a tactical replay") });
  assert.equal(second.workGraphId, first.workGraphId);
  assert.deepEqual(second, first);
  const read = await service.readWorkGraph(first.workGraphId);
  assert.notEqual(read, null);
  assert.deepEqual(read, first);
});

test("openIntent with an explicit id: retry returns the same record", async () => {
  const service = makeService();
  const intent = makeIntent("produce a tactical replay");
  const first = await service.openIntent({ workGraphId: "wg:fixture-1", intent });
  const retry = await service.openIntent({ workGraphId: "wg:fixture-1", intent });
  assert.deepEqual(retry, first);
});

test("openIntent with an explicit id but a different intent is a typed conflict", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:fixture-1", intent: makeIntent("goal a") });
  await assert.rejects(
    service.openIntent({ workGraphId: "wg:fixture-1", intent: makeIntent("goal b") }),
    (error: unknown) => error instanceof WorkGraphIntentConflictError,
  );
});

test("readWorkGraph of an unknown graph returns null", async () => {
  const service = makeService();
  assert.equal(await service.readWorkGraph("wg:unknown"), null);
});

test("appendNode is idempotent: duplicate call -> same node, no duplicate in graph", async () => {
  const service = makeService();
  const graph = await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  const input = {
    workGraphId: graph.workGraphId,
    nodeId: "node:1" as SportaId,
    kind: "run" as const,
    actor: agentActor,
  };
  const first = await service.appendNode(input);
  const retry = await service.appendNode(input);
  assert.deepEqual(retry, first);
  const stored = await service.readWorkGraph("wg:1");
  assert.equal(stored?.nodes.length, 1);
  const ledger = await service.readAppends("wg:1");
  assert.equal(ledger.length, 1);
  assert.equal(first.seq, 1);
});

test("appendNode auto ids are deterministic and seq stays monotonic (explicit nodeId carries idempotency)", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  const run = await service.appendNode({ workGraphId: "wg:1", kind: "run", actor: agentActor });
  const action = await service.appendNode({
    workGraphId: "wg:1",
    kind: "action",
    actor: agentActor,
  });
  const evidence = await service.appendNode({
    workGraphId: "wg:1",
    kind: "evidence",
    actor: agentActor,
  });
  assert.deepEqual([run.seq, action.seq, evidence.seq], [1, 2, 3]);
  assert.deepEqual(
    [run.nodeId, action.nodeId, evidence.nodeId],
    ["node:wg:1:1", "node:wg:1:2", "node:wg:1:3"],
  );
  const stored = await service.readWorkGraph("wg:1");
  assert.equal(stored?.nodes.length, 3);
});

test("appendNode with an existing nodeId but a different definition is a typed conflict", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  await service.appendNode({
    workGraphId: "wg:1",
    nodeId: "node:1",
    kind: "run",
    actor: agentActor,
  });
  await assert.rejects(
    service.appendNode({
      workGraphId: "wg:1",
      nodeId: "node:1",
      kind: "action",
      actor: agentActor,
    }),
    (error: unknown) => error instanceof WorkGraphNodeConflictError,
  );
});

test("appendNode with an unknown parent is a typed error", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  await assert.rejects(
    service.appendNode({
      workGraphId: "wg:1",
      kind: "action",
      parent: "node:missing",
      actor: agentActor,
    }),
    (error: unknown) => error instanceof WorkGraphNodeParentError,
  );
});

test("appendNode on an unknown graph is a typed error", async () => {
  const service = makeService();
  await assert.rejects(
    service.appendNode({ workGraphId: "wg:unknown", kind: "run", actor: agentActor }),
    (error: unknown) => error instanceof WorkGraphNotFoundError,
  );
});

test("status machine: agent run opens execution, user takeover pauses, agent resumes, outcome closes", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  await service.appendNode({ workGraphId: "wg:1", kind: "run", actor: agentActor });
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "executing");
  await service.appendNode({ workGraphId: "wg:1", kind: "action", actor: userActor });
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "awaiting-user");
  await service.appendNode({ workGraphId: "wg:1", kind: "action", actor: agentActor });
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "executing");
  await service.appendNode({ workGraphId: "wg:1", kind: "outcome", actor: agentActor });
  const closed = await service.readWorkGraph("wg:1");
  assert.equal(closed?.status, "closed");
});

test("manual takeover: user append keeps lineage (parent + seq) and records actor in the ledger", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  const run = await service.appendNode({ workGraphId: "wg:1", kind: "run", actor: agentActor });
  const userNode = await service.appendNode({
    workGraphId: "wg:1",
    kind: "action",
    parent: run.nodeId,
    actor: userActor,
  });
  assert.equal(userNode.parent, run.nodeId);
  assert.equal(userNode.seq, 2);
  const ledger = await service.readAppends("wg:1");
  assert.deepEqual(ledger[1]?.actor, userActor);
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "awaiting-user");
});

test("user append on a fresh open graph takes over before execution", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  await service.appendNode({ workGraphId: "wg:1", kind: "task", actor: userActor });
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "awaiting-user");
});

test("closed graphs reject work appends but accept post-closure evidence", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  await service.appendNode({ workGraphId: "wg:1", kind: "run", actor: agentActor });
  await service.appendNode({ workGraphId: "wg:1", kind: "outcome", actor: agentActor });
  await assert.rejects(
    service.appendNode({ workGraphId: "wg:1", kind: "run", actor: agentActor }),
    (error: unknown) => error instanceof WorkGraphStatusError,
  );
  const evidence = await service.appendNode({
    workGraphId: "wg:1",
    kind: "evidence",
    actor: agentActor,
  });
  assert.equal(evidence.kind, "evidence");
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "closed");
});

test("transitionStatus: legal edges apply, illegal skips are rejected, same-status is a no-op", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:1", intent: makeIntent("goal") });
  await assert.rejects(
    service.transitionStatus("wg:1", "escalated"),
    (error: unknown) => error instanceof WorkGraphStatusError,
  );
  await assert.rejects(
    service.transitionStatus("wg:1", "closed"),
    (error: unknown) => error instanceof WorkGraphStatusError,
  );
  await service.transitionStatus("wg:1", "executing");
  await service.transitionStatus("wg:1", "escalated");
  assert.equal((await service.readWorkGraph("wg:1"))?.status, "escalated");
  const unchanged = await service.transitionStatus("wg:1", "escalated");
  assert.equal(unchanged.status, "escalated");
  await service.transitionStatus("wg:1", "closed");
  await assert.rejects(
    service.transitionStatus("wg:1", "executing"),
    (error: unknown) => error instanceof WorkGraphStatusError,
  );
});

test("transitionStatus on an unknown graph is a typed error", async () => {
  const service = makeService();
  await assert.rejects(
    service.transitionStatus("wg:unknown", "executing"),
    (error: unknown) => error instanceof WorkGraphNotFoundError,
  );
});

test("fixture AgentRuntime seam: deterministic handle, typed simulated events, idempotent start", async () => {
  const runtime = new FixtureAgentRuntimeAdapter({ now });
  const organization = {
    organizationId: "org:fixture",
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
  };
  const handle = await runtime.startRun({
    workGraphId: "wg:1",
    organization,
    task: "render the replay",
  });
  const retryHandle = await runtime.startRun({
    workGraphId: "wg:1",
    organization,
    task: "render the replay",
  });
  assert.equal(retryHandle.runId, handle.runId);
  const events = await runtime.observeRun(handle.runId);
  assert.deepEqual(
    events.map((event) => event.type),
    ["started", "progress", "completed"],
  );
  assert.ok(events.every((event) => event.detail.includes("fixture simulation")));
  assert.ok(events.every((event) => event.runId === handle.runId));
  assert.deepEqual(await runtime.observeRun("run:unknown"), []);
});
