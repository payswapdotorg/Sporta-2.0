/**
 * In-memory marketplace stores (adapters layer) — EVIDENCE CLASS:
 * FIXTURE. Deterministic JSON-cloning fixtures that prove SEMANTICS
 * (immutability, append-only history, idempotency), never durability.
 * A real persistence adapter implements the same ports later.
 */
import type {
  SportaId,
  ContentHash,
  TransformEntitlement,
  TransformListing,
  TransformReviewDecision,
  TransformSuspensionRecord,
} from "@sporta/marketplace/contract";
import type {
  CandidateStorePort,
  DecisionStorePort,
  EntitlementStorePort,
  ListingStateEventStorePort,
  ListingStorePort,
  SuspensionStorePort,
  TransformListingStateEvent,
} from "../domain/ports.js";
import type { CheckLaneStorePort, TransformCheckLaneRecord } from "../domain/checks.js";
import type { TransformCandidateRecord } from "../domain/lifecycle.js";

/** Structural clone (records are frozen-shaped; clone-on-save/read). */
function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Candidate store: one slot per (pipelineId, version). */
export class InMemoryCandidateStore implements CandidateStorePort {
  private readonly byIdIndex = new Map<SportaId, TransformCandidateRecord>();
  private readonly byVersionIndex = new Map<string, TransformCandidateRecord>();

  save(record: TransformCandidateRecord): void {
    this.byIdIndex.set(record.candidateId, clone(record));
    this.byVersionIndex.set(`${record.pipelineId}@${record.version}`, clone(record));
  }

  byId(candidateId: SportaId): TransformCandidateRecord | null {
    return clone(this.byIdIndex.get(candidateId) ?? null);
  }

  byPipelineAndVersion(pipelineId: SportaId, version: string): TransformCandidateRecord | null {
    return clone(this.byVersionIndex.get(`${pipelineId}@${version}`) ?? null);
  }

  listByPipeline(pipelineId: SportaId): readonly TransformCandidateRecord[] {
    return [...this.byIdIndex.values()]
      .filter((record) => record.pipelineId === pipelineId)
      .map((record) => clone(record))
      .sort((a, b) => a.version.localeCompare(b.version));
  }
}

/** Decision store: append-only per candidate digest. */
export class InMemoryDecisionStore implements DecisionStorePort {
  private readonly byIdIndex = new Map<SportaId, TransformReviewDecision>();
  private readonly byDigest = new Map<ContentHash, TransformReviewDecision[]>();

  append(decision: TransformReviewDecision): void {
    const existing = this.byIdIndex.get(decision.decisionId);
    if (existing !== undefined) return; // durable re-record stays first-write
    this.byIdIndex.set(decision.decisionId, clone(decision));
    const list = this.byDigest.get(decision.candidateDigest) ?? [];
    list.push(clone(decision));
    this.byDigest.set(decision.candidateDigest, list);
  }

  byId(decisionId: SportaId): TransformReviewDecision | null {
    return clone(this.byIdIndex.get(decisionId) ?? null);
  }

  byCandidate(candidateDigest: ContentHash): readonly TransformReviewDecision[] {
    return (this.byDigest.get(candidateDigest) ?? []).map((decision) => clone(decision));
  }
}

/** Check-lane store: latest lane per candidate and per digest. */
export class InMemoryCheckLaneStore implements CheckLaneStorePort {
  private readonly byCandidateIndex = new Map<SportaId, TransformCheckLaneRecord>();
  private readonly byDigestIndex = new Map<ContentHash, TransformCheckLaneRecord>();

  append(record: TransformCheckLaneRecord): void {
    this.byCandidateIndex.set(record.candidateId, clone(record));
    this.byDigestIndex.set(record.candidateDigest, clone(record));
  }

  byCandidate(candidateId: SportaId): TransformCheckLaneRecord | null {
    return clone(this.byCandidateIndex.get(candidateId) ?? null);
  }

  byCandidateDigest(candidateDigest: ContentHash): TransformCheckLaneRecord | null {
    return clone(this.byDigestIndex.get(candidateDigest) ?? null);
  }
}

/** Listing store: one listing per pipeline. */
export class InMemoryListingStore implements ListingStorePort {
  private readonly byIdIndex = new Map<SportaId, TransformListing>();
  private readonly byPipelineIndex = new Map<SportaId, TransformListing>();

  save(listing: TransformListing): void {
    this.byIdIndex.set(listing.listingId, clone(listing));
    this.byPipelineIndex.set(listing.pipelineId, clone(listing));
  }

  byId(listingId: SportaId): TransformListing | null {
    return clone(this.byIdIndex.get(listingId) ?? null);
  }

  byPipeline(pipelineId: SportaId): TransformListing | null {
    return clone(this.byPipelineIndex.get(pipelineId) ?? null);
  }
}

/** Entitlement store. */
export class InMemoryEntitlementStore implements EntitlementStorePort {
  private readonly byIdIndex = new Map<SportaId, TransformEntitlement>();
  private readonly byPrincipal = new Map<string, TransformEntitlement[]>();

  save(entitlement: TransformEntitlement): void {
    this.byIdIndex.set(entitlement.entitlementId, clone(entitlement));
    const list = (this.byPrincipal.get(entitlement.principal) ?? []).filter(
      (item) => item.entitlementId !== entitlement.entitlementId,
    );
    list.push(clone(entitlement));
    this.byPrincipal.set(entitlement.principal, list);
  }

  byId(entitlementId: SportaId): TransformEntitlement | null {
    return clone(this.byIdIndex.get(entitlementId) ?? null);
  }

  byPrincipalAndRelease(
    principal: string,
    releaseDigest: ContentHash,
  ): TransformEntitlement | null {
    const list = this.byPrincipal.get(principal) ?? [];
    const found = list.find((item) => item.releaseDigest === releaseDigest);
    return clone(found ?? null);
  }

  listByPrincipal(principal: string): readonly TransformEntitlement[] {
    return (this.byPrincipal.get(principal) ?? []).map((item) => clone(item));
  }
}

/** Suspension-record store (append-only). */
export class InMemorySuspensionStore implements SuspensionStorePort {
  private readonly byListingIndex = new Map<SportaId, TransformSuspensionRecord[]>();

  append(record: TransformSuspensionRecord): void {
    const list = this.byListingIndex.get(record.listingId) ?? [];
    list.push(clone(record));
    this.byListingIndex.set(record.listingId, list);
  }

  byListing(listingId: SportaId): readonly TransformSuspensionRecord[] {
    return (this.byListingIndex.get(listingId) ?? []).map((record) => clone(record));
  }
}

/** Listing-state-event store (append-only; withdrawal/supersession provenance). */
export class InMemoryListingStateEventStore implements ListingStateEventStorePort {
  private readonly byListingIndex = new Map<SportaId, TransformListingStateEvent[]>();

  append(event: TransformListingStateEvent): void {
    const list = this.byListingIndex.get(event.listingId) ?? [];
    list.push(clone(event));
    this.byListingIndex.set(event.listingId, list);
  }

  byListing(listingId: SportaId): readonly TransformListingStateEvent[] {
    return (this.byListingIndex.get(listingId) ?? []).map((event) => clone(event));
  }
}
