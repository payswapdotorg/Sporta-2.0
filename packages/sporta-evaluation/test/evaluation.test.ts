import { test } from "node:test";
import assert from "node:assert/strict";
import { EvaluationCandidatesError, EvaluationService } from "../src/contract.js";
import type { EvaluateCandidatesInput } from "../src/contract.js";
import type { OrganizationCandidate } from "@sporta/organizations/contract";
import type {
  EvaluationMetric,
  IntentSpec,
  OrganizationVersionRecord,
} from "@sporta/contracts/contract";

function makeIntent(): IntentSpec {
  return {
    goal: "produce a tactical replay",
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

function makeCandidate(
  organizationId: string,
  overrides: Partial<OrganizationVersionRecord> = {},
): OrganizationCandidate {
  return {
    organization: {
      organizationId,
      version: 1,
      intentProfile: "sports-replay",
      roleGraph: ["role:1"],
      agentBodies: ["body:1"],
      cognitiveSubstrates: ["substrate:1"],
      toolGraph: ["tool:1"],
      workflowGraph: ["workflow:1"],
      environmentProfile: "local",
      fallbacks: ["fallback:1"],
      budgets: { latencyMsMax: 5_000, costMax: 1 },
      learnedPreferences: ["pref:1"],
      evidence: ["ev:1", "ev:2", "ev:3"],
      policy: makeIntent().policy,
      ...overrides,
    },
    rationale: "fixture candidate",
    evidence: ["ev:1"],
  };
}

const SIMULATED_AXES: readonly EvaluationMetric["axis"][] = [
  "intent-success",
  "output-quality",
  "source-fidelity",
  "preference-fit",
  "latency",
  "resource-cost",
  "reliability",
  "determinism",
  "provenance",
  "rights-security-privacy",
];

const service = new EvaluationService();

test("report includes intervention-cost when the input provides it", async () => {
  const report = await service.evaluateCandidates({
    candidates: [makeCandidate("org:alpha"), makeCandidate("org:beta")],
    evidence: ["ev:report"],
    interventionCost: { manualInterventions: 2, userSeconds: 140 },
  });
  const intervention = report.metrics.find((metric) => metric.axis === "intervention-cost");
  assert.notEqual(intervention, undefined);
  assert.equal(intervention?.value, 2);
  assert.deepEqual(report.candidateIds, ["org:alpha:1", "org:beta:1"]);
  assert.deepEqual(report.evidence, ["ev:report"]);
});

test("without intervention-cost input the axis is absent; simulated axes are present", async () => {
  const report = await service.evaluateCandidates({
    candidates: [makeCandidate("org:alpha")],
    evidence: [],
  });
  assert.equal(
    report.metrics.find((metric) => metric.axis === "intervention-cost"),
    undefined,
  );
  assert.deepEqual(
    report.metrics.map((metric) => metric.axis),
    SIMULATED_AXES,
  );
});

test("basis honesty: simulated metrics are fixture; fixture input is never auto-labeled measured", async () => {
  const report = await service.evaluateCandidates({
    candidates: [makeCandidate("org:alpha")],
    evidence: [],
    interventionCost: { manualInterventions: 3, userSeconds: 200 },
  });
  const simulated = report.metrics.filter((metric) => metric.axis !== "intervention-cost");
  assert.ok(simulated.length > 0);
  assert.ok(simulated.every((metric) => metric.basis === "fixture"));
  const intervention = report.metrics.find((metric) => metric.axis === "intervention-cost");
  assert.equal(intervention?.basis, "fixture");
});

test("basis honesty: measured is an explicit opt-in for real measurements only", async () => {
  const report = await service.evaluateCandidates({
    candidates: [makeCandidate("org:alpha")],
    evidence: [],
    interventionCost: { manualInterventions: 1, userSeconds: 30, basis: "measured" },
  });
  const intervention = report.metrics.find((metric) => metric.axis === "intervention-cost");
  assert.equal(intervention?.basis, "measured");
});

test("reports are deterministic and idempotent per input (same reportId)", async () => {
  const input: EvaluateCandidatesInput = {
    candidates: [makeCandidate("org:alpha"), makeCandidate("org:beta")],
    evidence: ["ev:1"],
    interventionCost: { manualInterventions: 2, userSeconds: 60 },
  };
  const first = await service.evaluateCandidates(input);
  const second = await service.evaluateCandidates(input);
  assert.deepEqual(second, first);
  assert.equal(second.reportId, first.reportId);
  assert.match(first.reportId, /^evaluation:[0-9a-f]{8}$/);
});

test("metric values are report-level means over candidates (deterministic)", async () => {
  const strong = makeCandidate("org:strong", { evidence: ["ev:1", "ev:2", "ev:3"] });
  const weak = makeCandidate("org:weak", { evidence: [] });
  const report = await service.evaluateCandidates({ candidates: [strong, weak], evidence: [] });
  const intentSuccess = report.metrics.find((metric) => metric.axis === "intent-success");
  // strong: min(1, 3/3) = 1, weak: 0/3 = 0 -> mean 0.5
  assert.equal(intentSuccess?.value, 0.5);
  const reliability = report.metrics.find((metric) => metric.axis === "reliability");
  // both declare fallbacks -> 1
  assert.equal(reliability?.value, 1);
});

test("evaluating zero candidates is a typed refusal", async () => {
  await assert.rejects(
    service.evaluateCandidates({ candidates: [], evidence: [] }),
    (error: unknown) => error instanceof EvaluationCandidatesError,
  );
});
