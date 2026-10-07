/**
 * EvaluationService — app-layer implementation of EvaluationPort. Owns no
 * state and takes no dependencies: evaluateCandidates is a pure
 * deterministic computation over the input (see src/domain/evaluation.ts).
 */
import type { EvaluationReportRecord } from "@sporta/contracts/contract";
import type { EvaluateCandidatesInput, EvaluationPort } from "../domain/ports.js";
import { computeEvaluationReport } from "../domain/evaluation.js";

export class EvaluationService implements EvaluationPort {
  async evaluateCandidates(input: EvaluateCandidatesInput): Promise<EvaluationReportRecord> {
    return computeEvaluationReport(input);
  }
}
