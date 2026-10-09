/**
 * Wave-3 escalation read-seam helpers (domain layer — pure).
 *
 * The bounded-query law (ADR: docs/architecture/adr-wave3-read-seams.md):
 * read seams list with optional filters + a limit; no unbounded reads.
 * Limits are capped by a hard maximum so a caller cannot request an
 * unbounded scan; an unset limit gets the bounded default.
 *
 * Summaries mirror the canonical records field-for-field
 * (ArenaEscalationRecord / ArenaResultRecord) — never fewer fields; the
 * shapes are the frozen contracts types (records/readSeams.ts).
 */
import type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  EscalationResultSummary,
  EscalationSummary,
} from "@sporta/contracts/contract";

/** Default bounded-read limit for escalation/result seam queries. */
export const ESCALATION_READ_DEFAULT_LIMIT = 50;

/** Hard cap: no seam query lists more than this many records. */
export const ESCALATION_READ_MAX_LIMIT = 200;

/** Effective bounded limit for one seam query (never unbounded). */
export function escalationReadLimit(requested: number | undefined): number {
  if (requested === undefined) {
    return ESCALATION_READ_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(requested, 0), ESCALATION_READ_MAX_LIMIT);
}

/** Field-for-field escalation summary (the frozen contracts shape). */
export function escalationSummaryOf(record: ArenaEscalationRecord): EscalationSummary {
  return {
    escalationId: record.escalationId,
    gapId: record.gapId,
    workGraphId: record.workGraphId,
    sessionMode: record.sessionMode,
    lifecycle: record.lifecycle,
  };
}

/** Field-for-field arena-result summary (the frozen contracts shape). */
export function resultSummaryOf(record: ArenaResultRecord): EscalationResultSummary {
  return {
    resultId: record.resultId,
    escalationId: record.escalationId,
    resultType: record.resultType,
    validated: record.validated,
  };
}
