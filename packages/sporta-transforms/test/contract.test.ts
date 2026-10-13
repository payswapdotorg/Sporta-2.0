import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exampleTransformPipelineManifest,
  exampleTransformNode,
  exampleTransformReleaseCandidate,
  exampleTransformRunManifest,
  exampleTransformStepResult,
  exampleTransformGraphValidation,
} from "../src/contract.example.js";
import type {
  TransformPipelineManifest,
  TransformNode,
  TransformReleaseCandidate,
  TransformRunManifest,
  TransformStepResult,
  TransformGraphValidation,
} from "../src/contract.js";

test("example transform node satisfies the TransformNode contract", () => {
  const node: TransformNode = exampleTransformNode;
  assert.equal(node.kind, "deterministic-filter");
  assert.equal(node.sandbox.networkEgress, "denied");
  assert.equal(node.sandbox.hostSecretAccess, false);
  assert.equal(node.resources.timeoutMs > 0, true);
  assert.equal(node.componentRef.digest.length > 0, true);
});

test("example pipeline manifest satisfies the manifest contract", () => {
  const manifest: TransformPipelineManifest = exampleTransformPipelineManifest;
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.semantics.declaredChanges.length > 0, true);
  assert.equal(manifest.expectations.evidenceGrade, "fixture");
  assert.equal(manifest.policy.privacy.visibility, "tenant");
});

test("example release candidate is digest-pinned", () => {
  const candidate: TransformReleaseCandidate = exampleTransformReleaseCandidate;
  assert.equal(candidate.manifestDigest.length > 0, true);
  assert.ok(candidate.contentHashes.length >= 1);
});

test("example run manifest pins release digests and a non-secret config hash", () => {
  const run: TransformRunManifest = exampleTransformRunManifest;
  assert.equal(run.release.releaseDigest.length > 0, true);
  assert.equal(run.componentDigests.length, 1);
  assert.equal(run.configHash.length > 0, true);
  assert.deepEqual(run.grantedApplicationCapabilities, []);
});

test("example step result reports typed failure honestly", () => {
  const step: TransformStepResult = exampleTransformStepResult;
  assert.equal(step.status, "typed-failure");
  assert.equal(step.resourceUse.outputBytes, 0);
  assert.ok(step.detail.length > 0);
});

test("example validation outcome is fail-closed with typed violations", () => {
  const validation: TransformGraphValidation = exampleTransformGraphValidation;
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.equal(validation.violations[0].kind, "type-mismatch");
  }
});
