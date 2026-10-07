import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleIntent, examplePolicySet, exampleProvenance } from "../src/contract.example.js";
import type { IntentSpec, PolicySet, ProvenanceDescriptor } from "../src/contract.js";

test("example policy set is structurally valid", () => {
  const policy: PolicySet = examplePolicySet;
  assert.equal(policy.privacy.visibility, "tenant");
  assert.equal(policy.rights.usages.length > 0, true);
  assert.equal(policy.retention.disposition, "retain");
  assert.ok(!policy.rights.prohibitions.includes("render"));
});

test("example intent satisfies the IntentSpec contract", () => {
  const intent: IntentSpec = exampleIntent;
  assert.equal(typeof intent.goal, "string");
  assert.equal(intent.learningPolicy.requireConsent, true);
  assert.deepEqual(intent.artifactRequirements, ["tactical-board-video"]);
  assert.equal(intent.policy.privacy.visibility, "tenant");
});

test("example provenance carries source and timestamp", () => {
  const provenance: ProvenanceDescriptor = exampleProvenance;
  assert.equal(provenance.sourceKind, "authorized-source");
  assert.ok(!Number.isNaN(Date.parse(provenance.capturedAt)));
  assert.ok(
    provenance.confidence !== undefined && provenance.confidence >= 0 && provenance.confidence <= 1,
  );
});
