/**
 * sporta-evaluation — evidence-backed comparison of organization candidates.
 *
 * User intervention cost is a first-class signal (invariant 18). No
 * single benchmark metric is sufficient for promotion.
 *
 * Single public entrypoint. Declarations live in module-internal files
 * (src/domain/*, src/app/*) and are re-exported here — the Wave 0
 * layout. The v1 surface below is unchanged; the Wave 1 addition is the
 * optional honest `basis` label on InterventionCostInput plus the
 * service constructor re-export.
 */
export type { EvaluationMetric, EvaluationReportRecord } from "@sporta/contracts/contract";

export type {
  InterventionCostInput,
  EvaluateCandidatesInput,
  EvaluationPort,
} from "./domain/ports.js";

export { EvaluationCandidatesError } from "./domain/errors.js";

export { EvaluationService } from "./app/evaluationService.js";
