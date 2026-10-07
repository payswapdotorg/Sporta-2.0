/**
 * sporta-evaluation public types and ports (declarations).
 *
 * Declarations live in this module-internal file; `src/contract.ts` is
 * the single public entrypoint re-exporting this surface (Wave 0
 * layout). The v1 surface moved here verbatim; the Wave 1 addition is
 * the optional honest `basis` label on InterventionCostInput.
 */
import type {
  EvaluationMetric,
  EvaluationReportRecord,
  SportaId,
} from "@sporta/contracts/contract";
import type { OrganizationCandidate } from "@sporta/organizations/contract";

/** Measured manual intervention cost for a candidate run. */
export interface InterventionCostInput {
  manualInterventions: number;
  userSeconds: number;
  /**
   * Honest provenance label for these numbers. Defaults to "fixture":
   * callers must explicitly assert "measured" ONLY for real measurements
   * (never for fixture/synthetic input — honest-evidence law).
   */
  basis?: EvaluationMetric["basis"];
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
