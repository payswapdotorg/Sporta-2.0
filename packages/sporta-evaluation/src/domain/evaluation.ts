/**
 * Evaluation report computation — pure and deterministic (see
 * packages/sporta-evaluation/SPEC.md). Basis honesty is the core rule:
 * every service-derived metric is "fixture"; "measured" appears only
 * when the caller explicitly asserts it on the intervention-cost input.
 */
import type {
  EvaluationMetric,
  EvaluationReportRecord,
  SportaId,
} from "@sporta/contracts/contract";
import type { EvaluateCandidatesInput } from "./ports.js";
import type { OrganizationCandidate } from "@sporta/organizations/contract";
import { fnv1aHex, stableStringify } from "./hash.js";
import { EvaluationCandidatesError } from "./errors.js";

/** Declared Wave 1 simulation constants (fixture-grade, not measured). */
const EVIDENCE_FULL_SCORE = 3;
const OUTPUT_FULL_BODIES = 4;
const TOOLING_FULL_TOOLS = 3;
const PREFERENCE_FULL_LEARNED = 3;
const PROVENANCE_FULL_EVIDENCE = 2;
const LATENCY_FULL_MS = 5_000;
const LATENCY_ZERO_MS = 60_000;
const COST_FULL = 1;
const COST_ZERO = 100;
const DETERMINISM_FIXTURE = 0.8;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function candidateIdFor(candidate: OrganizationCandidate): SportaId {
  return `${candidate.organization.organizationId}:${candidate.organization.version}`;
}

/** Per-candidate simulated values for every non-intervention axis. */
function candidateAxisValue(
  axis: Exclude<EvaluationMetric["axis"], "intervention-cost">,
  candidate: OrganizationCandidate,
): number {
  const record = candidate.organization;
  switch (axis) {
    case "intent-success":
      return Math.min(1, record.evidence.length / EVIDENCE_FULL_SCORE);
    case "output-quality":
      return Math.min(
        1,
        (record.agentBodies.length + record.workflowGraph.length) / OUTPUT_FULL_BODIES,
      );
    case "source-fidelity":
      return Math.min(1, record.toolGraph.length / TOOLING_FULL_TOOLS);
    case "preference-fit":
      return Math.min(1, record.learnedPreferences.length / PREFERENCE_FULL_LEARNED);
    case "latency":
      return record.budgets.latencyMsMax === undefined
        ? 0.5
        : clamp01(
            (LATENCY_ZERO_MS - record.budgets.latencyMsMax) / (LATENCY_ZERO_MS - LATENCY_FULL_MS),
          );
    case "resource-cost":
      return record.budgets.costMax === undefined
        ? 0.5
        : clamp01((COST_ZERO - record.budgets.costMax) / (COST_ZERO - COST_FULL));
    case "reliability":
      return record.fallbacks.length > 0 ? 1 : 0.5;
    case "determinism":
      return DETERMINISM_FIXTURE;
    case "provenance":
      return Math.min(1, record.evidence.length / PROVENANCE_FULL_EVIDENCE);
    case "rights-security-privacy":
      return record.policy.rights.holders.length > 0 && record.policy.rights.usages.length > 0
        ? 1
        : 0.5;
  }
}

const SIMULATED_AXES: readonly Exclude<EvaluationMetric["axis"], "intervention-cost">[] = [
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

/**
 * Compute the report. Deterministic and idempotent per input: the same
 * input produces the byte-identical record (same reportId). Metric
 * values are report-level means over candidates (frozen contract has no
 * per-candidate metric slot — documented limitation).
 */
export function computeEvaluationReport(input: EvaluateCandidatesInput): EvaluationReportRecord {
  if (input.candidates.length === 0) {
    throw new EvaluationCandidatesError("evaluation refused: no candidates to compare");
  }
  const candidateIds: SportaId[] = input.candidates.map((candidate) => candidateIdFor(candidate));
  const metrics: EvaluationMetric[] = SIMULATED_AXES.map((axis) => {
    const sum = input.candidates.reduce(
      (total, candidate) => total + candidateAxisValue(axis, candidate),
      0,
    );
    return { axis, value: sum / input.candidates.length, basis: "fixture" };
  });
  if (input.interventionCost !== undefined) {
    metrics.push({
      axis: "intervention-cost",
      value: input.interventionCost.manualInterventions,
      basis: input.interventionCost.basis ?? "fixture",
    });
  }
  return {
    reportId: `evaluation:${fnv1aHex(stableStringify(input))}`,
    candidateIds,
    metrics,
    evidence: [...input.evidence],
  };
}
