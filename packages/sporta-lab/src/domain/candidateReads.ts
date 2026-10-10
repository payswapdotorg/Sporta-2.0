/**
 * Candidate/promotion read-seam derivation — pure mapping of registry
 * catalog entries + promotion/decision history to the Wave 3 read-seam
 * summaries (ADR: docs/architecture/adr-wave3-read-seams.md).
 *
 * HONEST STATE MAPPING (documented, never coerced):
 * - registry entry, no decision record        → status "candidate"
 * - latest decision record "promoted"        → status "promoted"
 * - latest decision record "rejected"        → status "rejected"
 * - latest decision record "rolled-back"     → status "rolled-back"
 *
 * Since Wave 4 (ADR wave-4) all four states are PRODUCIBLE: the
 * organizations registry gained the rejection/rollback decision path
 * (rejectCandidate / rollbackPromotion), so the honest empty arrays the
 * seam used to return for rejected/rolled-back queries became real
 * data. The latest decision record per candidate is the CURRENT state
 * (the registry returns records in grant order — promotion before its
 * rollback — so the last record for a candidateId is the current one);
 * the earlier promotion record of a rolled-back candidate stays
 * visible in listPromotions as immutable history.
 *
 * Bounded-query law: filters apply first, the capped limit last; the
 * default limit is 50 and 50 is also the hard cap (a larger request is
 * capped — documented ADR behavior); a non-positive or non-integer limit
 * is a typed refusal.
 */
import type {
  OrganizationCandidateQuery,
  OrganizationCandidateSummary,
  PromotionRecord,
  PromotionSummary,
  SportaId,
} from "@sporta/contracts/contract";
import type { OrganizationCatalogEntry } from "@sporta/organizations/contract";
import { candidateIdFor } from "@sporta/organizations/contract";
import { LabCandidateQueryError } from "./errors.js";

/** Default bounded-read size (ADR: "limit required default capped"). */
export const DEFAULT_CANDIDATE_LIMIT = 50;
/** Hard cap: no read ever returns more than this many rows. */
export const MAX_CANDIDATE_LIMIT = 50;

/**
 * Effective limit for one query. Undefined → default; above the cap →
 * capped; non-positive or non-integer → typed refusal (no silent
 * coercion of malformed input).
 */
export function boundCandidateLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_CANDIDATE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new LabCandidateQueryError(
      `invalid limit: ${limit} (limit must be a positive integer; bounded reads never coerce malformed input)`,
    );
  }
  return Math.min(limit, MAX_CANDIDATE_LIMIT);
}

/** The organizationId of a canonical `<orgId>:<version>` candidateId (inverse of candidateIdFor). */
export function organizationOfCandidateId(candidateId: SportaId): SportaId | null {
  const index = candidateId.lastIndexOf(":");
  return index <= 0 ? null : (candidateId.slice(0, index) as SportaId);
}

/** Candidate status carried by a decision record (contracts union). */
export type CandidateStatus = OrganizationCandidateSummary["status"];

/**
 * Candidate status of one catalog entry given its LATEST decision record
 * (see file header): the decision IS the current state; an entry without
 * any decision record is an undecided draft ("candidate"). The promoted
 * boolean is kept only as the registry-invariant guard in
 * candidateSummaryOf (promoted ⇒ a promotion record exists).
 */
export function candidateStatusOf(
  entry: OrganizationCatalogEntry,
  decision?: PromotionRecord,
): CandidateStatus {
  if (decision !== undefined) return decision.decision;
  return entry.promoted ? "promoted" : "candidate";
}

/**
 * One candidate summary. `decision` MUST be the LATEST decision record
 * of the entry (registry invariant: promoted ⇒ promotion record exists —
 * the guard is a typed refusal, not a silent fallback). Basis strings
 * stay minimal-by-design and deterministic: the promotion path keeps the
 * Wave 3 wording; the Wave 4 decision records reference their own record
 * id.
 */
export function candidateSummaryOf(
  entry: OrganizationCatalogEntry,
  decision?: PromotionRecord,
): OrganizationCandidateSummary {
  const { record } = entry;
  const candidateId = candidateIdFor(record.organizationId, record.version);
  if (decision === undefined) {
    if (entry.promoted) {
      throw new LabCandidateQueryError(
        `registry invariant violated: ${candidateId} is promoted but has no promotion record`,
      );
    }
    return {
      candidateId,
      organizationId: record.organizationId,
      version: record.version,
      status: "candidate",
      basis: "unpromoted registry draft",
    };
  }
  const basis =
    decision.decision === "promoted"
      ? `promotion record ${decision.promotionId}`
      : `decision record ${decision.promotionId}`;
  return {
    candidateId,
    organizationId: record.organizationId,
    version: record.version,
    status: decision.decision,
    basis,
  };
}

/** Promotion summary — mirrors the PromotionRecord's identity fields. */
export function promotionSummaryOf(record: PromotionRecord): PromotionSummary {
  return {
    promotionId: record.promotionId,
    candidateId: record.candidateId,
    decision: record.decision,
    decidedAt: record.decidedAt,
  };
}

/** Does one candidate summary match the query's filters? */
export function matchesCandidateQuery(
  summary: OrganizationCandidateSummary,
  query: OrganizationCandidateQuery,
): boolean {
  if (query.organizationId !== undefined && summary.organizationId !== query.organizationId) {
    return false;
  }
  if (query.candidateId !== undefined && summary.candidateId !== query.candidateId) {
    return false;
  }
  if (query.status !== undefined && summary.status !== query.status) {
    return false;
  }
  return true;
}

/**
 * Does one promotion summary match the query's filters? The shared status
 * union maps onto decisions: promoted/rejected/rolled-back filter by
 * decision; "candidate" honestly matches nothing (a never-decided
 * version has no decision record at all).
 */
export function matchesPromotionQuery(
  summary: PromotionSummary,
  query: OrganizationCandidateQuery,
): boolean {
  if (query.candidateId !== undefined && summary.candidateId !== query.candidateId) {
    return false;
  }
  if (query.organizationId !== undefined) {
    const organizationId = organizationOfCandidateId(summary.candidateId);
    if (organizationId !== query.organizationId) return false;
  }
  if (query.status !== undefined) {
    if (query.status === "candidate") return false;
    if (summary.decision !== query.status) return false;
  }
  return true;
}

/** Filter + bound: apply the query filters, then take the capped limit. */
export function boundResults<T>(
  rows: readonly T[],
  matches: (row: T, query: OrganizationCandidateQuery) => boolean,
  query: OrganizationCandidateQuery,
): readonly T[] {
  const limit = boundCandidateLimit(query.limit);
  return rows.filter((row) => matches(row, query)).slice(0, limit);
}
