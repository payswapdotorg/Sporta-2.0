/**
 * Wave-3 learning read seam tests (LearningArtifactReadPort on
 * LearningIntakeService).
 *
 * EVIDENCE CLASS: fixture — in-memory store and fixture work graphs; the
 * read-seam LOGIC under test is production code.
 *
 * Project law: node:test + tsx only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  IntentSpec,
  LearningArtifactReadPort,
  PolicySet,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import { LearningIntakeService } from "../src/app/learningIntake.js";
import { LearningConsentRefusedError } from "../src/domain/errors.js";

function fixturePolicySet(): PolicySet {
  return {
    rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

function fixtureIntent(scopes: readonly string[]): IntentSpec {
  return {
    goal: "produce a tactical replay",
    constraints: [],
    artifactRequirements: ["tactical-board-video"],
    learningPolicy: { scopes, requireConsent: true },
    policy: fixturePolicySet(),
  };
}

function fixtureWorkGraph(workGraphId: string, scopes: readonly string[]): WorkGraphRecord {
  return {
    workGraphId,
    intent: fixtureIntent(scopes),
    nodes: [{ nodeId: "task:1", kind: "task", seq: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "closed",
  };
}

const ALL_SCOPES = [
  "preference",
  "workflow",
  "tool-selection",
  "organization-composition",
  "capability",
  "knowledge",
];

class FakeWorkGraphPort implements WorkGraphPort {
  writeCalls = 0;
  constructor(private readonly graphs: ReadonlyMap<string, WorkGraphRecord>) {}
  async openIntent(): Promise<never> {
    this.writeCalls += 1;
    throw new Error("intake must not open intents");
  }
  async readWorkGraph(workGraphId: string): Promise<WorkGraphRecord | null> {
    return this.graphs.get(workGraphId) ?? null;
  }
  async appendNode(): Promise<never> {
    this.writeCalls += 1;
    throw new Error("intake must not append nodes");
  }
}

function makeIntake(graphs: readonly WorkGraphRecord[]): LearningIntakeService {
  return new LearningIntakeService({
    workGraphs: new FakeWorkGraphPort(new Map(graphs.map((graph) => [graph.workGraphId, graph]))),
  });
}

test("the intake satisfies the frozen LearningArtifactReadPort shape (additive)", () => {
  const intake = makeIntake([fixtureWorkGraph("wg:1", ALL_SCOPES)]);
  const seam: LearningArtifactReadPort = intake;
  assert.equal(typeof seam.listLearningArtifacts, "function");
});

test("listLearningArtifacts returns field-for-field summaries in consent order", async () => {
  const intake = makeIntake([
    fixtureWorkGraph("wg:1", ALL_SCOPES),
    fixtureWorkGraph("wg:2", ALL_SCOPES),
  ]);
  const first = await intake.recordConsent({
    workGraphId: "wg:1",
    userId: "user:operator",
    scopes: ["workflow", "organization-composition"],
    decision: "granted",
  });
  const second = await intake.recordConsent({
    workGraphId: "wg:2",
    userId: "user:operator",
    scopes: ["preference"],
    decision: "granted",
  });
  assert.deepEqual(await intake.listLearningArtifacts({}), [
    {
      learningArtifactId: first.learningArtifactId,
      class: first.class,
      scope: first.scope,
      status: first.status,
    },
    {
      learningArtifactId: second.learningArtifactId,
      class: second.class,
      scope: second.scope,
      status: second.status,
    },
  ]);
});

test("listLearningArtifacts filters by learningArtifactId, scope and status", async () => {
  const intake = makeIntake([
    fixtureWorkGraph("wg:1", ALL_SCOPES),
    fixtureWorkGraph("wg:2", ALL_SCOPES),
  ]);
  const first = await intake.recordConsent({
    workGraphId: "wg:1",
    userId: "user:operator",
    scopes: ["workflow"],
    decision: "granted",
  });
  await intake.recordConsent({
    workGraphId: "wg:2",
    userId: "user:operator",
    scopes: ["preference"],
    decision: "granted",
  });

  const byId = await intake.listLearningArtifacts({ learningArtifactId: first.learningArtifactId });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.learningArtifactId, first.learningArtifactId);

  assert.equal((await intake.listLearningArtifacts({ scope: "user" })).length, 2);
  assert.deepEqual(await intake.listLearningArtifacts({ scope: "tenant" }), []);
  assert.equal((await intake.listLearningArtifacts({ status: "candidate" })).length, 2);
  assert.deepEqual(await intake.listLearningArtifacts({ status: "promoted" }), []);
});

test("listLearningArtifacts default limit is capped at 50, hard cap 200 (bounded-query law)", async () => {
  const graphs = Array.from({ length: 205 }, (_, index) =>
    fixtureWorkGraph(`wg:limit-${index}`, ALL_SCOPES),
  );
  const intake = makeIntake(graphs);
  for (let index = 0; index < 205; index += 1) {
    await intake.recordConsent({
      workGraphId: `wg:limit-${index}`,
      userId: "user:operator",
      scopes: ["workflow"],
      decision: "granted",
    });
  }
  assert.equal((await intake.listLearningArtifacts({})).length, 50);
  assert.equal((await intake.listLearningArtifacts({ limit: 3 })).length, 3);
  assert.equal((await intake.listLearningArtifacts({ limit: 500 })).length, 200);
});

test("listLearningArtifacts is empty before any consent and never writes through the work port", async () => {
  const graphs = [fixtureWorkGraph("wg:1", ALL_SCOPES)];
  const fake = new FakeWorkGraphPort(new Map(graphs.map((graph) => [graph.workGraphId, graph])));
  const intake = new LearningIntakeService({ workGraphs: fake });
  assert.deepEqual(await intake.listLearningArtifacts({}), []);
  await intake.listLearningArtifacts({ limit: 10 });
  await intake.listLearningArtifacts({ status: "candidate" });
  assert.equal(fake.writeCalls, 0, "the read seam never writes through the work graph port");
  await assert.rejects(
    () =>
      intake.recordConsent({
        workGraphId: "wg:1",
        userId: "user:operator",
        scopes: ["workflow"],
        decision: "denied",
      }),
    LearningConsentRefusedError,
  );
  assert.deepEqual(
    await intake.listLearningArtifacts({}),
    [],
    "denied consent still lists nothing",
  );
});
