/** Typed evaluation domain errors. */

/** evaluateCandidates refused: no candidates to compare. */
export class EvaluationCandidatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationCandidatesError";
  }
}
