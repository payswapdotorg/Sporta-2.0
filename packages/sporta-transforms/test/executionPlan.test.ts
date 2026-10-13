/**
 * W9A-2 — graph resolution and bounded execution plan tests.
 *
 * EVIDENCE CLASS: REAL (pure resolver verdicts over deterministic
 * fixture manifests — typed refusals observed as thrown records).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TransformExecutionPlanError,
  TransformGraphValidationError,
  resolveTransformExecutionPlan,
} from "../src/contract.js";
import {
  makeManifest,
  makeModelNode,
  makeStore,
  makeTrimNode,
} from "./helpers.js";

const store = makeStore();

function digest(seed: string): string {
  return `sha256:${seed.repeat(64).slice(0, 64)}`;
}

test("a single-node DAG resolves to one deterministic-process step with default budget", () => {
  const plan = resolveTransformExecutionPlan(makeManifest([makeTrimNode()]), store, {
    parameters: { "node:trim": { startMs: 0, endMs: 5000 } },
  });
  assert.equal(plan.pipelineId, "pipe:test");
  assert.equal(plan.steps.length, 1);
  assert.deepEqual(plan.steps[0], {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    lane: "deterministic-process",
    dependsOn: [],
  });
  assert.deepEqual(plan.budget, { maxSteps: 1, declaredSteps: 1 });
});

test("chain order is topological: a -> b -> c plans in chain order with dependsOn", () => {
  const a = makeTrimNode({ nodeId: "node:a" });
  const b = makeTrimNode({ nodeId: "node:b" });
  const c = makeTrimNode({ nodeId: "node:c" });
  const edges = [
    { from: { nodeId: "node:b", port: "events" }, to: { nodeId: "node:c", port: "events" } },
    { from: { nodeId: "node:a", port: "events" }, to: { nodeId: "node:b", port: "events" } },
  ];
  const plan = resolveTransformExecutionPlan(makeManifest([c, b, a], edges), store, {
    parameters: {
      "node:a": { startMs: 0, endMs: 100 },
      "node:b": { startMs: 0, endMs: 100 },
      "node:c": { startMs: 0, endMs: 100 },
    },
  });
  assert.deepEqual(plan.steps.map((step) => step.nodeId), ["node:a", "node:b", "node:c"]);
  assert.deepEqual(plan.steps[2]?.dependsOn, ["node:b"]);
});

test("independent nodes plan in declaration order (deterministic tie-break)", () => {
  const b = makeTrimNode({ nodeId: "node:b" });
  const a = makeTrimNode({ nodeId: "node:a" });
  const first = resolveTransformExecutionPlan(makeManifest([a, b]), store);
  const second = resolveTransformExecutionPlan(makeManifest([a, b]), store);
  assert.deepEqual(first.steps.map((step) => step.nodeId), ["node:a", "node:b"]);
  assert.deepEqual(first, second, "identical manifests resolve to identical plans");
});

test("step-budget overflow is a typed refusal, never a loop", () => {
  const b = makeTrimNode({ nodeId: "node:b" });
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([makeTrimNode(), b]), store, { maxSteps: 1 }),
    (error: unknown) => {
      assert.ok(error instanceof TransformExecutionPlanError);
      assert.equal(error.refusalKind, "step-budget-overflow");
      assert.match(error.message, /needs 2 steps/);
      return true;
    },
  );
});

test("an unresolvable pinned component is a typed unresolvable-pinned-dependency refusal", () => {
  const unknown = makeTrimNode({
    componentRef: { kind: "deterministic-filter", digest: `sha256:${"9".repeat(64)}`, name: "no-such-component" },
  });
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([unknown]), store),
    (error: unknown) => {
      assert.ok(error instanceof TransformExecutionPlanError);
      assert.equal(error.refusalKind, "unresolvable-pinned-dependency");
      assert.equal(error.nodeId, "node:trim");
      return true;
    },
  );
});

test("a pinned digest that does not match the stored component is unresolvable", () => {
  const wrongDigest = makeTrimNode({
    componentRef: { kind: "deterministic-filter", digest: `sha256:${"7".repeat(64)}`, name: "json-event-stream-trim" },
  });
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([wrongDigest]), store),
    (error: unknown) => {
      assert.ok(error instanceof TransformExecutionPlanError);
      assert.equal(error.refusalKind, "unresolvable-pinned-dependency");
      return true;
    },
  );
});

test("container and worker sandbox profiles are typed sandbox-unsupported refusals", () => {
  for (const kind of ["container", "worker"] as const) {
    const node = makeTrimNode({ sandbox: { kind, networkEgress: "denied", hostSecretAccess: false } });
    assert.throws(
      () => resolveTransformExecutionPlan(makeManifest([node]), store),
      (error: unknown) => {
        assert.ok(error instanceof TransformExecutionPlanError);
        assert.equal(error.refusalKind, "sandbox-unsupported");
        return true;
      },
      `sandbox ${kind} must be refused`,
    );
  }
});

test("sandbox none is refused for non-trusted kinds and allowed for sporta-capability nodes", () => {
  const untrusted = makeTrimNode({ sandbox: { kind: "none", networkEgress: "denied", hostSecretAccess: false } });
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([untrusted]), store),
    (error: unknown) => {
      assert.ok(error instanceof TransformExecutionPlanError);
      assert.equal(error.refusalKind, "sandbox-unsupported");
      return true;
    },
  );
  const capability = makeTrimNode({
    nodeId: "node:capability",
    kind: "sporta-capability",
    componentRef: { kind: "sporta-capability", digest: digest("e"), name: "existing-capability" },
    sandbox: { kind: "none", networkEgress: "denied", hostSecretAccess: false },
    parameterSchema: {},
  });
  const plan = resolveTransformExecutionPlan(makeManifest([capability]), store);
  assert.equal(plan.steps[0]?.lane, "capability-lane-deferred");
});

test("host secret access and network egress requests are refused (sandbox law)", () => {
  const secretNode = makeTrimNode({
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: { explicitlyGranted: ["VAULT_TOKEN"] } },
  });
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([secretNode]), store),
    (error: unknown) => {
      assert.ok(error instanceof TransformExecutionPlanError);
      assert.match(error.message, /host secret/);
      return true;
    },
  );
  const networkNode = makeTrimNode({
    sandbox: { kind: "process", networkEgress: "allowlisted", hostSecretAccess: false },
  });
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([networkNode]), store),
    (error: unknown) => {
      assert.ok(error instanceof TransformExecutionPlanError);
      assert.match(error.message, /network egress/);
      return true;
    },
  );
});

test("an invalid graph throws the typed validation error before any resolution", () => {
  const a = makeTrimNode({ nodeId: "node:a" });
  const b = makeTrimNode({ nodeId: "node:b" });
  const edges = [
    { from: { nodeId: "node:a", port: "events" }, to: { nodeId: "node:b", port: "events" } },
    { from: { nodeId: "node:b", port: "events" }, to: { nodeId: "node:a", port: "events" } },
  ];
  assert.throws(
    () => resolveTransformExecutionPlan(makeManifest([a, b], edges), store),
    (error: unknown) => {
      assert.ok(error instanceof TransformGraphValidationError);
      assert.equal(error.validation.violations[0]?.kind, "cycle");
      return true;
    },
  );
});

test("resource projection sums declared envelopes and places nodes by class", () => {
  const a = makeTrimNode({ resources: { timeoutMs: 1000, maxOutputBytes: 100, cpuClass: "light", memoryMiB: 64 } });
  const b = makeTrimNode({
    nodeId: "node:b",
    resources: { timeoutMs: 2000, maxOutputBytes: 350, cpuClass: "heavy", memoryMiB: 512 },
  });
  const plan = resolveTransformExecutionPlan(makeManifest([a, b]), store);
  assert.equal(plan.resources.totalMaxOutputBytes, 450);
  assert.deepEqual(
    plan.resources.placement.map((entry) => [entry.nodeId, entry.cpuClass, entry.memoryMiB]),
    [
      ["node:trim", "light", 64],
      ["node:b", "heavy", 512],
    ],
  );
});

test("model nodes plan onto the model-adapter lane", () => {
  const plan = resolveTransformExecutionPlan(makeManifest([makeModelNode()]), store);
  assert.deepEqual(plan.steps[0], {
    nodeId: "node:model",
    kind: "model",
    lane: "model-adapter",
    dependsOn: [],
  });
});
