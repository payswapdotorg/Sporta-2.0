/**
 * Marketplace ports (domain — pure interfaces; adapters implement).
 *
 * Every IO seam is an injected port: clocks, hashing, the manifest read
 * seam (the TL-serialized transform-manifest store), and the per-record
 * stores. The domain and app layers never touch ambient time, real
 * hashing or persistence; fixtures in the adapters layer are labeled.
 */
import type {
  ContentHash,
  Iso8601,
  SportaId,
  TransformEntitlement,
  TransformListing,
  TransformPipelineManifest,
  TransformReviewDecision,
  TransformSuspensionRecord,
} from "@sporta/marketplace/contract";
import type { TransformCandidateRecord } from "./lifecycle.js";

/** Injectable clock — record timestamps never use ambient time. */
export interface MarketplaceClock {
  now(): Iso8601;
}

/** Injectable hashing (adapters wrap node:crypto). */
export interface MarketplaceHashPort {
  /** sha256 over text (utf8), `sha256:<64 hex>`. */
  text(value: string): ContentHash;
  /** sha256 over a stable-stringified value (canonical JSON). */
  stable(value: unknown): ContentHash;
}

/**
 * The manifest read seam: resolves the pinned manifest for a candidate.
 * The product-side manifest store is a TL seam; tests inject a fixture
 * source. Unresolvable manifests are honest nulls — callers refuse
 * typed, never guess.
 */
export interface TransformManifestReadPort {
  read(
    pipelineId: SportaId,
    version: string,
    manifestDigest: ContentHash,
  ): TransformPipelineManifest | null;
}

/** Candidate store (append/update by the owning service only). */
export interface CandidateStorePort {
  save(record: TransformCandidateRecord): void;
  byId(candidateId: SportaId): TransformCandidateRecord | null;
  byPipelineAndVersion(pipelineId: SportaId, version: string): TransformCandidateRecord | null;
  listByPipeline(pipelineId: SportaId): readonly TransformCandidateRecord[];
}

/** Review-decision store (append-only, durable re-reads). */
export interface DecisionStorePort {
  append(decision: TransformReviewDecision): void;
  byId(decisionId: SportaId): TransformReviewDecision | null;
  byCandidate(candidateDigest: ContentHash): readonly TransformReviewDecision[];
}

/** Listing store (one listing per pipeline, currentRelease + history). */
export interface ListingStorePort {
  save(listing: TransformListing): void;
  byId(listingId: SportaId): TransformListing | null;
  byPipeline(pipelineId: SportaId): TransformListing | null;
}

/** Entitlement store. */
export interface EntitlementStorePort {
  save(entitlement: TransformEntitlement): void;
  byId(entitlementId: SportaId): TransformEntitlement | null;
  byPrincipalAndRelease(principal: string, releaseDigest: ContentHash): TransformEntitlement | null;
  listByPrincipal(principal: string): readonly TransformEntitlement[];
}

/** Suspension-record store (append-only history, never dropped). */
export interface SuspensionStorePort {
  append(record: TransformSuspensionRecord): void;
  byListing(listingId: SportaId): readonly TransformSuspensionRecord[];
}

/**
 * Additive listing-state event: the durable provenance (who/when/why)
 * of withdrawal and supersession transitions — no silent state loss
 * (P9-10). Suspension provenance additionally writes the frozen
 * `TransformSuspensionRecord`.
 */
export interface TransformListingStateEvent {
  readonly eventId: SportaId;
  readonly listingId: SportaId;
  readonly pipelineId: SportaId;
  readonly kind: "suspended" | "withdrawn" | "superseded";
  readonly version: string;
  readonly reason: string;
  readonly actor: string;
  readonly at: Iso8601;
  readonly effect: "block-new-runs";
}

/** Listing-state-event store (append-only history, never dropped). */
export interface ListingStateEventStorePort {
  append(event: TransformListingStateEvent): void;
  byListing(listingId: SportaId): readonly TransformListingStateEvent[];
}
