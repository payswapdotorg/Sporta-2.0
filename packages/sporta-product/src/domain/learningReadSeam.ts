/**
 * Wave-3 learning read-seam helpers (domain layer — pure).
 *
 * The bounded-query law (ADR: docs/architecture/adr-wave3-read-seams.md):
 * read seams list with optional filters + a limit; limits are capped by a
 * hard maximum; an unset limit gets the bounded default.
 *
 * Summaries mirror LearningArtifactRecord field-for-field — never fewer
 * fields; the shape is the frozen contracts type (records/readSeams.ts).
 */
import type { LearningArtifactRecord, LearningArtifactSummary } from "@sporta/contracts/contract";

/** Default bounded-read limit for learning-artifact seam queries. */
export const LEARNING_READ_DEFAULT_LIMIT = 50;

/** Hard cap: no seam query lists more than this many records. */
export const LEARNING_READ_MAX_LIMIT = 200;

/** Effective bounded limit for one seam query (never unbounded). */
export function learningReadLimit(requested: number | undefined): number {
  if (requested === undefined) {
    return LEARNING_READ_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(requested, 0), LEARNING_READ_MAX_LIMIT);
}

/** Field-for-field learning-artifact summary (the frozen contracts shape). */
export function learningArtifactSummaryOf(record: LearningArtifactRecord): LearningArtifactSummary {
  return {
    learningArtifactId: record.learningArtifactId,
    class: record.class,
    scope: record.scope,
    status: record.status,
  };
}
