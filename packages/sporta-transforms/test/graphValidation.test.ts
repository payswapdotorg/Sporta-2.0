/**
 * W9A-1 / P9-01 — typed DAG validation tests.
 *
 * EVIDENCE CLASS: REAL (pure function verdicts over deterministic
 * fixture manifests — no process, no IO; every assertion observes the
 * frozen `TransformGraphValidation` shape).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateTransformPipelineManifest } from "../src/contract.js";
import {
  makeManifest,
  makeModelNode,
  makeTrimNode,
} from "./helpers.js";

const kinds = (validation: { valid: false }): string[] => validation.violations.map((item) => item.kind);

test("a valid single-node graph returns counts (fail-open only for valid graphs)", () => {
  const validation = validateTransformPipelineManifest(makeManifest([makeTrimNode()]));
  assert.deepEqual(validation, { valid: true, nodeCount: 1, edgeCount: 0 });
});

test("a valid two-node chain with a typed edge returns node/edge counts", () => {
  const first = makeTrimNode({ nodeId: "node:trim-1" });
  const second = makeTrimNode({ nodeId: "node:trim-2", componentRef: { kind: "deterministic-filter", digest: `sha256:${"b".repeat(64)}`, name: "other" } });
  const edges = [
    { from: { nodeId: "node:trim-1", port: "events" }, to: { nodeId: "node:trim-2", port: "events" } },
  ];
  const validation = validateTransformPipelineManifest(makeManifest([first, second], edges));
  assert.deepEqual(validation, { valid: true, nodeCount: 2, edgeCount: 1 });
});

test("duplicate node ids are a typed duplicate-node violation", () => {
  const validation = validateTransformPipelineManifest(
    makeManifest([makeTrimNode({ nodeId: "node:same" }), makeTrimNode({ nodeId: "node:same" })]),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.deepEqual(kinds(validation), ["duplicate-node"]);
    assert.match(validation.violations[0]?.detail ?? "", /node:same declared 2 times/);
  }
});

test("edges referencing unknown nodes are typed unknown-node violations", () => {
  const edges = [
    { from: { nodeId: "node:ghost", port: "events" }, to: { nodeId: "node:trim", port: "events" } },
  ];
  const validation = validateTransformPipelineManifest(makeManifest([makeTrimNode()], edges));
  assert.equal(validation.valid, false);
  if (!validation.valid) assert.deepEqual(kinds(validation), ["unknown-node"]);
});

test("edges referencing undeclared ports are typed unknown-port violations", () => {
  const edges = [
    { from: { nodeId: "node:model", port: "nope" }, to: { nodeId: "node:trim", port: "events" } },
  ];
  const validation = validateTransformPipelineManifest(makeManifest([makeTrimNode(), makeModelNode()], edges));
  assert.equal(validation.valid, false);
  if (!validation.valid) assert.deepEqual(kinds(validation), ["unknown-port"]);
});

test("edge endpoints must target input ports (output-to-output is unknown-port)", () => {
  const model = makeModelNode();
  const edges = [
    { from: { nodeId: "node:trim", port: "events" }, to: { nodeId: "node:model", port: "summary" } },
  ];
  const validation = validateTransformPipelineManifest(makeManifest([makeTrimNode(), model], edges));
  assert.equal(validation.valid, false);
  if (!validation.valid) assert.deepEqual(kinds(validation), ["unknown-port"]);
});

test("incompatible dataKinds across an edge are typed type-mismatch violations", () => {
  const model = makeModelNode();
  const edges = [
    { from: { nodeId: "node:trim", port: "events" }, to: { nodeId: "node:model", port: "events" } },
  ];
  const first = makeTrimNode();
  const validation = validateTransformPipelineManifest(
    makeManifest([first, { ...model, inputs: [{ name: "events", dataKind: "video/raw", required: true, cardinality: "single" }] }], edges),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) assert.deepEqual(kinds(validation), ["type-mismatch"]);
});

test("moving tags and malformed digests are typed unpinned-component violations", () => {
  for (const digest of ["latest", "main", "HEAD", "", "sha256:abc", "v1.2.3"]) {
    const validation = validateTransformPipelineManifest(
      makeManifest([makeTrimNode({ componentRef: { kind: "deterministic-filter", digest, name: "x" } })]),
    );
    assert.equal(validation.valid, false, `digest "${digest}" must be refused`);
    if (!validation.valid) assert.deepEqual(kinds(validation), ["unpinned-component"]);
  }
});

test("a componentRef kind differing from the node kind is unpinned-component", () => {
  const validation = validateTransformPipelineManifest(
    makeManifest([makeTrimNode({ componentRef: { kind: "script", digest: `sha256:${"c".repeat(64)}`, name: "x" } })]),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) assert.deepEqual(kinds(validation), ["unpinned-component"]);
});

test("cycles fail closed with a typed cycle violation naming the loop", () => {
  const first = makeTrimNode({ nodeId: "node:a" });
  const second = makeTrimNode({ nodeId: "node:b", componentRef: { kind: "deterministic-filter", digest: `sha256:${"d".repeat(64)}`, name: "other" } });
  const edges = [
    { from: { nodeId: "node:a", port: "events" }, to: { nodeId: "node:b", port: "events" } },
    { from: { nodeId: "node:b", port: "events" }, to: { nodeId: "node:a", port: "events" } },
  ];
  const validation = validateTransformPipelineManifest(makeManifest([first, second], edges));
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.equal(kinds(validation)[0], "cycle");
    assert.match(validation.violations[0]?.detail ?? "", /node:a -> node:b -> node:a/);
  }
});

test("missing required parameters (run-time values) fail closed as missing-parameter", () => {
  const validation = validateTransformPipelineManifest(makeManifest([makeTrimNode()]), {
    parameters: { "node:trim": { endMs: 2000 } },
  });
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.deepEqual(kinds(validation), ["missing-parameter"]);
    assert.match(validation.violations[0]?.detail ?? "", /missing required parameter startMs/);
  }
});

test("out-of-bounds and wrongly typed parameters fail closed as missing-parameter", () => {
  const below = validateTransformPipelineManifest(makeManifest([makeTrimNode()]), {
    parameters: { "node:trim": { startMs: -5, endMs: 100 } },
  });
  assert.equal(below.valid, false);
  if (!below.valid) assert.match(below.violations[0]?.detail ?? "", /below minimum/);

  const typed = validateTransformPipelineManifest(makeManifest([makeTrimNode()]), {
    parameters: { "node:trim": { startMs: "0", endMs: 100 } },
  });
  assert.equal(typed.valid, false);
  if (!typed.valid) assert.match(typed.violations[0]?.detail ?? "", /expects number, got string/);

  const above = validateTransformPipelineManifest(
    makeManifest([makeTrimNode({ parameterSchema: { startMs: { type: "number", required: true, minimum: 0, maximum: 100 }, endMs: { type: "number", required: true } } })]),
    { parameters: { "node:trim": { startMs: 500, endMs: 900 } } },
  );
  assert.equal(above.valid, false);
  if (!above.valid) assert.match(above.violations[0]?.detail ?? "", /above maximum/);
});

test("malformed parameter schemas fail closed even without run-time values", () => {
  const validation = validateTransformPipelineManifest(
    makeManifest([makeTrimNode({ parameterSchema: { startMs: { type: "durration" }, endMs: { type: "number" } } })]),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) assert.match(validation.violations[0]?.detail ?? "", /unsupported type/);
});

test("all violations are reported together in the deterministic kind order", () => {
  const dupA = makeTrimNode({ nodeId: "node:dup" });
  const dupB = makeTrimNode({ nodeId: "node:dup" });
  const unpinned = makeTrimNode({ nodeId: "node:unpinned", componentRef: { kind: "deterministic-filter", digest: "latest", name: "x" } });
  const edges = [
    { from: { nodeId: "node:dup", port: "events" }, to: { nodeId: "node:ghost", port: "events" } },
  ];
  const validation = validateTransformPipelineManifest(makeManifest([dupA, dupB, unpinned], edges), {
    parameters: { "node:dup": {} },
  });
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    const reported = kinds(validation);
    assert.ok(reported.includes("duplicate-node"));
    assert.ok(reported.includes("unknown-node"));
    assert.ok(reported.includes("unpinned-component"));
    assert.ok(reported.includes("missing-parameter"));
    // kind order is deterministic: duplicate-node before unknown-node before unpinned-component
    const indexes = ["duplicate-node", "unknown-node", "unpinned-component", "missing-parameter"].map((kind) => reported.indexOf(kind));
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), `violations must be kind-sorted: ${reported.join(",")}`);
  }
});

test("the same invalid graph always reports identical violations (determinism)", () => {
  const manifest = makeManifest([makeTrimNode({ nodeId: "node:dup" }), makeTrimNode({ nodeId: "node:dup" })]);
  const first = validateTransformPipelineManifest(manifest);
  const second = validateTransformPipelineManifest(manifest);
  assert.deepEqual(first, second);
});
