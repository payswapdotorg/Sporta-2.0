/**
 * sporta-evaluation — evidence-backed comparison of organization candidates.
 *
 * User intervention cost is a first-class signal (invariant 18). No
 * single benchmark metric is sufficient for promotion.
 */
import type {
  EvaluationMetric,
  EvaluationReportRecord,
  SportaId,
} from "@sporta/contracts/contract";
import type { OrganizationCandidate } from "@sporta/organizations/contract";

export type { EvaluationMetric, EvaluationReportRecord } from "@sporta/contracts/contract";

/** Measured manual intervention cost for a candidate run. */
export interface InterventionCostInput {
  manualInterventions: number;
  userSeconds: number;
}

/** Input for comparing candidates. */
export interface EvaluateCandidatesInput {
  candidates: readonly OrganizationCandidate[];
  evidence: readonly SportaId[];
  interventionCost?: InterventionCostInput;
}

/** The evaluation port. Reports are immutable evidence records. */
export interface EvaluationPort {
  evaluateCandidates(input: EvaluateCandidatesInput): Promise<EvaluationReportRecord>;
}
