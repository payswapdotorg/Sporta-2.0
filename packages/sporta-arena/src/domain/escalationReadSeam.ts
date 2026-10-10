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
 *
 * Wave-4 W4C-2 (ADR: docs/architecture/adr-wave4-c6-host.md, invariant 22
 * — C6 rights propagation on the read plane): the caller-declared usage
 * context + the pure visibility gate + the additive list-input extension,
 * mirroring the W3-B editors' `sessionVisibleToUsage` pattern. The gate
 * runs against the record's `policy: PolicySet` (already carried on every
 * ArenaEscalationRecord); ArenaResultRecord carries no policy of its own —
 * its parent escalation's PolicySet governs (the escalation carried policy
 * to the Arena boundary; the same policy governs the way back).
 */
import type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  EscalationQuery,
  EscalationResultQuery,
  EscalationResultSummary,
  EscalationSummary,
  PolicySet,
  RightsScope,
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

/**
 * The caller's usage context for a rights-gated arena read (invariant 22
 * — rights propagate through every plane; this is the read boundary's
 * half). Usage classes mirror `RightsScope.usages`/`prohibitions`
 * vocabulary, exactly like the W3-B editors' seam.
 */
export interface ArenaReadUsageContext {
  /** Usage classes the caller declares it will exercise. */
  readonly usages: readonly string[];
}

/**
 * The escalation-list input this package's read seam accepts: the frozen
 * contracts `EscalationQuery` PLUS an additive caller usage context. A
 * bare contracts query remains structurally valid input — it simply
 * declares no usage, and the gate is NOT applied (additive-only law:
 * absent usage context ⇒ the pre-wave-4 behavior, proven by the
 * unchanged wave-3 baselines).
 */
export interface EscalationListInput extends EscalationQuery {
  /** Caller's usage context; prohibited records are excluded from listings. */
  readonly usage?: ArenaReadUsageContext;
}

/**
 * The result-list input: the frozen contracts `EscalationResultQuery` PLUS
 * the additive caller usage context (same law as EscalationListInput).
 */
export interface EscalationResultListInput extends EscalationResultQuery {
  /** Caller's usage context; results of prohibited escalations are excluded. */
  readonly usage?: ArenaReadUsageContext;
}

/**
 * Invariant-22 read gate: may an arena record be read for a caller whose
 * usage context is `usage`?
 *
 * Law (fail-closed, mirroring W3-B `sessionVisibleToUsage`): a record is
 * visible iff AT LEAST ONE declared usage is affirmatively permitted by
 * the record's PolicySet rights AND NO declared usage is prohibited. A
 * missing or empty usage context can affirm nothing — the gate returns
 * false (callers that pass no context bypass the gate entirely at the
 * service boundary; callers that pass an EMPTY one see nothing).
 *
 * Holders are not evaluated here: this gate is over usage classes only;
 * holder-bound authorization is a policy-domain concern above this port.
 */
export function arenaRecordVisibleToUsage(
  rights: RightsScope,
  usage?: ArenaReadUsageContext,
): boolean {
  if (usage === undefined || usage.usages.length === 0) return false;
  const permitted = usage.usages.some((candidate) => rights.usages.includes(candidate));
  const prohibited = usage.usages.some((candidate) => rights.prohibitions.includes(candidate));
  return permitted && !prohibited;
}

/** Gate over a full PolicySet (the shape arena records actually carry). */
export function arenaPolicyPermitsUsage(
  policy: PolicySet,
  usage?: ArenaReadUsageContext,
): boolean {
  return arenaRecordVisibleToUsage(policy.rights, usage);
}
