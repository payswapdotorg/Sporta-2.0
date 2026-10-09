import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryWorkGraphStore,
  WorkGraphNodeKindError,
  WorkGraphNodeNotFoundError,
  WorkGraphNotFoundError,
  WorkGraphService,
  WorkGraphStatusError,
} from "../src/contract.js";
import type { IntentSpec, SportaId, WorkGraphNode } from "@sporta/contracts/contract";

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

/** A graph with one run node, executing (the escalation-legal state). */
async function makeExecutingGraph(service: WorkGraphService): Promise<SportaId> {
  await service.openIntent({ workGraphId: "wg:refs", intent: makeIntent("goal") });
  await service.appendNode({
    workGraphId: "wg:refs",
    nodeId: "node:own",
    kind: "run",
    actor: agentActor,
  });
  return "node:own";
}

function nodeOf(
  service: WorkGraphService,
  workGraphId: SportaId,
  nodeId: SportaId,
): Promise<WorkGraphNode | undefined> {
  return service
    .readWorkGraph(workGraphId)
    .then((graph) => graph?.nodes.find((node) => node.nodeId === nodeId));
}

test("escalateGap appends capability-gap + escalation refs on the owning node and escalates", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  const graph = await service.escalateGap({
    workGraphId: "wg:refs",
    nodeId,
    gapId: "gap:1",
    escalationId: "esc:1",
  });
  assert.equal(graph.status, "escalated");
  const node = await nodeOf(service, "wg:refs", nodeId);
  assert.deepEqual(node?.refs, [
    { kind: "capability-gap", refId: "gap:1" },
    { kind: "escalation", refId: "esc:1" },
  ]);
});

test("escalateGap is idempotent: retry changes nothing (no duplicate refs, same record)", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  const input = {
    workGraphId: "wg:refs" as SportaId,
    nodeId,
    gapId: "gap:1",
    escalationId: "esc:1",
  };
  const first = await service.escalateGap(input);
  const retry = await service.escalateGap(input);
  assert.deepEqual(retry, first);
  const node = await nodeOf(service, "wg:refs", nodeId);
  assert.equal(node?.refs?.length, 2);
});

test("escalateGap on an open graph refuses the skip and leaves no partial refs", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:open", intent: makeIntent("goal") });
  await assert.rejects(
    service.escalateGap({
      workGraphId: "wg:open",
      nodeId: "node:none",
      gapId: "gap:1",
      escalationId: "esc:1",
    }),
    (error: unknown) => error instanceof WorkGraphStatusError,
  );
  const graph = await service.readWorkGraph("wg:open");
  assert.equal(graph?.status, "open");
  assert.deepEqual(graph?.nodes, []);
});

test("escalateGap with an unknown node is a typed error (status edge still legal)", async () => {
  const service = makeService();
  await makeExecutingGraph(service);
  await assert.rejects(
    service.escalateGap({
      workGraphId: "wg:refs",
      nodeId: "node:missing",
      gapId: "gap:1",
      escalationId: "esc:1",
    }),
    (error: unknown) => error instanceof WorkGraphNodeNotFoundError,
  );
  const graph = await service.readWorkGraph("wg:refs");
  assert.equal(graph?.status, "executing");
});

test("escalateGap on an unknown graph is a typed error", async () => {
  const service = makeService();
  await assert.rejects(
    service.escalateGap({
      workGraphId: "wg:unknown",
      nodeId: "node:own",
      gapId: "gap:1",
      escalationId: "esc:1",
    }),
    (error: unknown) => error instanceof WorkGraphNotFoundError,
  );
});

test("recordArenaResult appends the arena-result ref and resolves an escalated graph to executing", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  await service.escalateGap({
    workGraphId: "wg:refs",
    nodeId,
    gapId: "gap:1",
    escalationId: "esc:1",
  });
  const graph = await service.recordArenaResult({
    workGraphId: "wg:refs",
    nodeId,
    resultId: "res:1",
  });
  assert.equal(graph.status, "executing");
  const node = await nodeOf(service, "wg:refs", nodeId);
  assert.deepEqual(node?.refs, [
    { kind: "capability-gap", refId: "gap:1" },
    { kind: "escalation", refId: "esc:1" },
    { kind: "arena-result", refId: "res:1" },
  ]);
});

test("recordArenaResult on a non-escalated graph appends the ref without a status change", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  const graph = await service.recordArenaResult({
    workGraphId: "wg:refs",
    nodeId,
    resultId: "res:late",
  });
  assert.equal(graph.status, "executing");
  const node = await nodeOf(service, "wg:refs", nodeId);
  assert.deepEqual(node?.refs, [{ kind: "arena-result", refId: "res:late" }]);
});

test("recordArenaResult is idempotent after resolution (retry appends nothing)", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  await service.escalateGap({
    workGraphId: "wg:refs",
    nodeId,
    gapId: "gap:1",
    escalationId: "esc:1",
  });
  const input = { workGraphId: "wg:refs" as SportaId, nodeId, resultId: "res:1" };
  const first = await service.recordArenaResult(input);
  const retry = await service.recordArenaResult(input);
  assert.deepEqual(retry, first);
  const node = await nodeOf(service, "wg:refs", nodeId);
  assert.equal(node?.refs?.length, 3);
});

test("commitArtifactRevision appends the artifact-revision ref on an artifact node (idempotent)", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:art", intent: makeIntent("goal") });
  await service.appendNode({
    workGraphId: "wg:art",
    nodeId: "node:artifact",
    kind: "artifact",
    actor: agentActor,
  });
  const first = await service.commitArtifactRevision({
    workGraphId: "wg:art",
    nodeId: "node:artifact",
    revisionId: "rev:1",
  });
  const retry = await service.commitArtifactRevision({
    workGraphId: "wg:art",
    nodeId: "node:artifact",
    revisionId: "rev:1",
  });
  assert.deepEqual(retry, first);
  assert.deepEqual(first.refs, [{ kind: "artifact-revision", refId: "rev:1" }]);
  const graph = await service.readWorkGraph("wg:art");
  assert.equal(graph?.status, "executing");
});

test("commitArtifactRevision on a non-artifact node is a typed kind error", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  await assert.rejects(
    service.commitArtifactRevision({ workGraphId: "wg:refs", nodeId, revisionId: "rev:1" }),
    (error: unknown) => error instanceof WorkGraphNodeKindError,
  );
});

test("refs accumulate in append order across operations and are never rewritten", async () => {
  const service = makeService();
  const nodeId = await makeExecutingGraph(service);
  await service.escalateGap({
    workGraphId: "wg:refs",
    nodeId,
    gapId: "gap:1",
    escalationId: "esc:1",
  });
  await service.recordArenaResult({ workGraphId: "wg:refs", nodeId, resultId: "res:1" });
  await service.recordArenaResult({ workGraphId: "wg:refs", nodeId, resultId: "res:2" });
  const node = await nodeOf(service, "wg:refs", nodeId);
  assert.deepEqual(
    node?.refs?.map((ref) => [ref.kind, ref.refId]),
    [
      ["capability-gap", "gap:1"],
      ["escalation", "esc:1"],
      ["arena-result", "res:1"],
      ["arena-result", "res:2"],
    ],
  );
});

test("v1 graphs without refs stay valid: plain appends never fabricate a refs array", async () => {
  const service = makeService();
  await service.openIntent({ workGraphId: "wg:v1", intent: makeIntent("goal") });
  const node = await service.appendNode({
    workGraphId: "wg:v1",
    nodeId: "node:v1-run",
    kind: "run",
    actor: agentActor,
  });
  assert.equal("refs" in node, false);
  const graph = await service.readWorkGraph("wg:v1");
  assert.ok(graph?.nodes.every((candidate) => candidate.refs === undefined));
});
