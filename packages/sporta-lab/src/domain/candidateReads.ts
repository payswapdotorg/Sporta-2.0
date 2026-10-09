/**
 * Candidate/promotion read-seam derivation — pure mapping of registry
 * catalog entries + promotion history to the Wave 3 read-seam summaries
 * (ADR: docs/architecture/adr-wave3-read-seams.md).
 *
 * HONEST STATE MAPPING (documented, never coerced):
 * - registry entry, unpromoted        → status "candidate"
 * - registry entry, promoted          → status "promoted"
 * - "rejected" / "rolled-back"        → NOT PRODUCIBLE by the current
 *   population: the v1 registry has no rejection or rollback decision
 *   path (worker-A wave-1 report, NEXT DEPENDENCIES; only decision
 *   "promoted" exists). Queries filtering for those statuses return an
 *   honest `[]` — no state is silently relabeled.
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

/** Candidate status of one catalog entry (honest two-state mapping, see file header). */
export function candidateStatusOf(entry: OrganizationCatalogEntry): "candidate" | "promoted" {
  return entry.promoted ? "promoted" : "candidate";
}

/**
 * One candidate summary. `promotion` MUST be the promotion record of a
 * promoted entry (registry invariant: promoted ⇒ promotion record exists);
 * the guard is a typed refusal, not a silent fallback.
 */
export function candidateSummaryOf(
  entry: OrganizationCatalogEntry,
  promotion?: PromotionRecord,
): OrganizationCandidateSummary {
  const { record } = entry;
  const candidateId = candidateIdFor(record.organizationId, record.version);
  if (entry.promoted) {
    if (promotion === undefined) {
      throw new LabCandidateQueryError(
        `registry invariant violated: ${candidateId} is promoted but has no promotion record`,
      );
    }
    return {
      candidateId,
      organizationId: record.organizationId,
      version: record.version,
      status: "promoted",
      basis: `promotion record ${promotion.promotionId}`,
    };
  }
  return {
    candidateId,
    organizationId: record.organizationId,
    version: record.version,
    status: "candidate",
    basis: "unpromoted registry draft",
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
 * decision; "candidate" honestly matches nothing (a never-promoted
 * version has no promotion record at all).
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
