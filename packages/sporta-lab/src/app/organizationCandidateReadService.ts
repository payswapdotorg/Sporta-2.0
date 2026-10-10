/**
 * OrganizationCandidateReadService — Wave 3 read seam (ADR:
 * docs/architecture/adr-wave3-read-seams.md). Implements the contracts'
 * `OrganizationCandidateReadPort` EXACTLY: two bounded read-only queries
 * over the Lab's candidate population (the organizations registry
 * catalog + promotion history). No mutation surface.
 *
 * Package choice (recorded in docs/implementation/worker-a.md): the port
 * lives in `@sporta/lab` because the Lab is the package whose population
 * actually holds organization candidates (registry catalog entries);
 * sporta-evaluation is stateless (pure report computation) and holds no
 * population to read.
 */
import type {
  OrganizationCandidateQuery,
  OrganizationCandidateReadPort,
  OrganizationCandidateSummary,
  PromotionRecord,
  PromotionSummary,
  SportaId,
} from "@sporta/contracts/contract";
import type {
  OrganizationCatalogPort,
  OrganizationPromotionHistoryPort,
} from "@sporta/organizations/contract";
import { candidateIdFor } from "@sporta/organizations/contract";
import {
  boundResults,
  candidateSummaryOf,
  matchesCandidateQuery,
  matchesPromotionQuery,
  promotionSummaryOf,
} from "../domain/candidateReads.js";

export interface OrganizationCandidateReadServiceDeps {
  /**
   * Read access to the candidate population: the organizations registry
   * (catalog + immutable promotion history). `OrganizationRegistryService`
   * implements both ports. Read-only by construction: the deps expose no
   * mutation method.
   */
  catalog: OrganizationCatalogPort & OrganizationPromotionHistoryPort;
}

/** Read-only seam: bounded candidate + promotion reads for the product projection. */
export class OrganizationCandidateReadService implements OrganizationCandidateReadPort {
  private readonly catalog: OrganizationCandidateReadServiceDeps["catalog"];

  constructor(deps: OrganizationCandidateReadServiceDeps) {
    this.catalog = deps.catalog;
  }

  /**
   * Bounded candidate listing. Field-for-field per the contracts law
   * (exactly the five OrganizationCandidateSummary fields). Deterministic
   * order: (organizationId asc, version asc) — the registry store order.
   * Honest status mapping from the LATEST decision record per candidate:
   * candidate | promoted | rejected | rolled-back (see
   * domain/candidateReads.ts — all four states are producible since the
   * Wave 4 registry decision path).
   */
  async listOrganizationCandidates(
    query: OrganizationCandidateQuery,
  ): Promise<readonly OrganizationCandidateSummary[]> {
    const [entries, decisions] = await Promise.all([
      this.catalog.listVersions(),
      this.catalog.listPromotionRecords(),
    ]);
    // Latest decision per candidate: listPromotionRecords returns grant
    // order (store order; within one entry promotion before its
    // rollback), so a later record for the same candidateId overwrites
    // earlier ones — the map holds the CURRENT decision per candidate.
    const decisionByCandidate = new Map<SportaId, PromotionRecord>(
      decisions.map((decision) => [decision.candidateId, decision] as const),
    );
    const summaries = entries.map((entry) =>
      candidateSummaryOf(
        entry,
        decisionByCandidate.get(candidateIdFor(entry.record.organizationId, entry.record.version)),
      ),
    );
    return boundResults(summaries, matchesCandidateQuery, query);
  }

  /**
   * Bounded promotion listing. Mirrors the decision records' identity
   * fields (promotionId, candidateId, decision, decidedAt). Deterministic
   * order: registry store order (grant order per candidate). All three
   * decisions are producible since Wave 4: promoted, rejected,
   * rolled-back — the earlier promotion of a rolled-back candidate stays
   * listed as immutable history.
   */
  async listPromotions(query: OrganizationCandidateQuery): Promise<readonly PromotionSummary[]> {
    const promotions = await this.catalog.listPromotionRecords();
    const summaries = promotions.map(promotionSummaryOf);
    return boundResults(summaries, matchesPromotionQuery, query);
  }
}
