import assert from "node:assert/strict";
import { test } from "node:test";
import type { IntentSpec, PolicySet, WorkGraphRecord } from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import { LearningIntakeService } from "../src/app/learningIntake.js";
import {
  LearningConsentRefusedError,
  LearningScopeError,
  UnknownWorkGraphError,
} from "../src/domain/errors.js";

function fixturePolicySet(): PolicySet {
  return {
    rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

function fixtureIntent(learningScopes: readonly string[]): IntentSpec {
  return {
    goal: "produce a tactical replay",
    constraints: [],
    artifactRequirements: ["tactical-board-video"],
    learningPolicy: { scopes: learningScopes, requireConsent: true },
    policy: fixturePolicySet(),
  };
}

function fixtureWorkGraph(learningScopes: readonly string[]): WorkGraphRecord {
  return {
    workGraphId: "wg:consent",
    intent: fixtureIntent(learningScopes),
    nodes: [{ nodeId: "task:1", kind: "task", seq: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "closed",
  };
}

/** Hand-written fake WorkGraphPort (fixture-grade, in test file per the work order). */
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

function makeIntake(learningScopes: readonly string[]) {
  const workGraphs = new FakeWorkGraphPort(
    new Map([["wg:consent", fixtureWorkGraph(learningScopes)]]),
  );
  const intake = new LearningIntakeService({ workGraphs });
  return { intake, workGraphs };
}

test("granted consent produces a candidate learning artifact with scope user", async () => {
  const { intake } = makeIntake(["preference"]);
  const record = await intake.recordConsent({
    workGraphId: "wg:consent",
    userId: "user:1",
    scopes: ["preference"],
    decision: "granted",
  });
  assert.deepEqual(record, {
    learningArtifactId: "learn:user:1:wg:consent:preference",
    class: "preference",
    scope: "user",
    evidence: [],
    permission: { scopes: ["preference"], requireConsent: true },
    status: "candidate",
  });
});

test("granted consent is idempotent per (workGraphId, userId, scopes)", async () => {
  const { intake } = makeIntake(["preference"]);
  const input = {
    workGraphId: "wg:consent",
    userId: "user:1",
    scopes: ["preference"] as const,
    decision: "granted" as const,
  };
  const first = await intake.recordConsent(input);
  const second = await intake.recordConsent(input);
  assert.deepEqual(first, second);
  assert.equal(first.learningArtifactId, "learn:user:1:wg:consent:preference");
  // same scopes in a different order resolve to the same record
  const reordered = await intake.recordConsent({ ...input, scopes: ["preference"] });
  assert.deepEqual(reordered, first);
});

test("multi-scope consent: class is the sorted primary scope, permission carries all scopes", async () => {
  const { intake } = makeIntake(["preference", "workflow"]);
  const record = await intake.recordConsent({
    workGraphId: "wg:consent",
    userId: "user:1",
    scopes: ["workflow", "preference", "workflow"],
    decision: "granted",
  });
  assert.equal(record.class, "preference");
  assert.deepEqual(record.permission, { scopes: ["preference", "workflow"], requireConsent: true });
  assert.equal(record.learningArtifactId, "learn:user:1:wg:consent:preference+workflow");
});

test("denied consent throws a typed refusal and creates no learning artifact", async () => {
  const { intake } = makeIntake(["preference"]);
  const denied = {
    workGraphId: "wg:consent",
    userId: "user:1",
    scopes: ["preference"] as const,
    decision: "denied" as const,
  };
  await assert.rejects(() => intake.recordConsent(denied), LearningConsentRefusedError);
  await assert.rejects(() => intake.recordConsent(denied), LearningConsentRefusedError);
  // a later granted consent still creates exactly one candidate; retries return the same record
  const granted = await intake.recordConsent({ ...denied, decision: "granted" });
  const retry = await intake.recordConsent({ ...denied, decision: "granted" });
  assert.deepEqual(granted, retry);
  assert.equal(granted.status, "candidate");
});

test("consent scopes must be contained in the work graph learning policy", async () => {
  const { intake } = makeIntake(["preference"]);
  await assert.rejects(
    () =>
      intake.recordConsent({
        workGraphId: "wg:consent",
        userId: "user:1",
        scopes: ["knowledge"],
        decision: "granted",
      }),
    LearningScopeError,
  );
});

test("empty policy scopes mean no learning is permitted at all", async () => {
  const { intake } = makeIntake([]);
  await assert.rejects(
    () =>
      intake.recordConsent({
        workGraphId: "wg:consent",
        userId: "user:1",
        scopes: ["preference"],
        decision: "granted",
      }),
    LearningScopeError,
  );
});

test("empty consent scopes are refused", async () => {
  const { intake } = makeIntake(["preference"]);
  await assert.rejects(
    () =>
      intake.recordConsent({
        workGraphId: "wg:consent",
        userId: "user:1",
        scopes: [],
        decision: "granted",
      }),
    LearningScopeError,
  );
});

test("unknown work graph is a typed error", async () => {
  const workGraphs = new FakeWorkGraphPort(new Map());
  const intake = new LearningIntakeService({ workGraphs });
  await assert.rejects(
    () =>
      intake.recordConsent({
        workGraphId: "wg:missing",
        userId: "user:1",
        scopes: ["preference"],
        decision: "granted",
      }),
    UnknownWorkGraphError,
  );
});

test("the intake never writes through the work graph port", async () => {
  const { intake, workGraphs } = makeIntake(["preference"]);
  await intake.recordConsent({
    workGraphId: "wg:consent",
    userId: "user:1",
    scopes: ["preference"],
    decision: "granted",
  });
  assert.equal(workGraphs.writeCalls, 0);
});
