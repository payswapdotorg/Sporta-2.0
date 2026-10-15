/**
 * sporta-marketplace — submission, review, listing, entitlement and
 * suspension state for approved transform releases (P9 / Wave 0 TL freeze).
 *
 * Source of truth: docs/contracts/transform-marketplace.md.
 *
 * Sporta owns approval. A GitHub commit, Hugging Face repository, creator
 * claim or external platform status NEVER implies Sporta approval; public
 * listings resolve to reviewed immutable digests (lock invariants 26, 28).
 * Every first publication and every material update passes automated checks
 * plus human review before becoming public. Free and paid offerings share
 * equal gates; payments are provider adapters, never marketplace authority
 * (lock 29). Historical runs stay pinned to the exact release used; a new
 * version never rewrites old lineage (lock 35).
 */
import type {
  SportaId,
  Iso8601,
  ContentHash,
  PolicySet,
  ArtifactRevisionRecord,
} from "@sporta/contracts/contract";
export type {
  SportaId,
  Iso8601,
  ContentHash,
  PolicySet,
  ArtifactRevisionRecord,
} from "@sporta/contracts/contract";
import type {
  TransformPipelineManifest,
  TransformReleaseCandidate,
} from "@sporta/transforms/contract";
export type {
  TransformPipelineManifest,
  TransformReleaseCandidate,
} from "@sporta/transforms/contract";

/** Candidate review lifecycle (docs/contracts/transform-marketplace.md). */
export type TransformCandidateLifecycleState =
  | "DRAFT"
  | "SUBMITTED"
  | "AUTOMATED_CHECKS"
  | "HUMAN_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "CHANGES_REQUESTED"
  | "REJECTED";

/** Public listing lifecycle after approval. */
export type TransformListingState = "PUBLISHED" | "SUSPENDED" | "WITHDRAWN" | "SUPERSEDED";

/** Review decision outcome — the durable record of one review round. */
export type TransformReviewOutcome =
  | "approved"
  | "changes-requested"
  | "rejected"
  | "suspended"
  | "withdrawn";

/** One automated or human review decision tied to an exact release digest. */
export interface TransformReviewDecision {
  decisionId: SportaId;
  /** The exact candidate digest this decision certifies. */
  candidateDigest: ContentHash;
  pipelineId: SportaId;
  version: string;
  /** Automated check evidence: ids, outcomes and grades. */
  automatedChecks: readonly {
    checkId: string;
    outcome: "pass" | "fail" | "warn";
    evidenceKind: "measured" | "fixture";
  }[];
  /** Human review roles that signed off (product/rights/security). */
  humanReview: readonly { role: string; reviewer: string; reviewedAt: Iso8601 }[];
  outcome: TransformReviewOutcome;
  /** Policy version under which the decision was rendered. */
  policyVersion: string;
  decidedAt: Iso8601;
  rationale: string;
  /** Durable evidence references (benchmarks, reports, attestations). */
  evidenceRefs: readonly string[];
}

/** Free or paid offer terms attached to a listing. */
export interface TransformOfferTerms {
  kind: "free" | "paid-per-run" | "subscription";
  /** Price for paid terms; null for free (same gates either way, lock 29). */
  price: { amount: number; currency: string } | null;
  /** Provider-neutral settlement adapter reference; never the authority. */
  settlementProviderRef: string | null;
  /** Usage limits/expiry attached to the offer, if any. */
  usageLimits: { maxRuns: number | null; expiresAt: Iso8601 | null };
  termsLicense: string;
}

/** Marketplace listing for an approved immutable release. */
export interface TransformListing {
  listingId: SportaId;
  pipelineId: SportaId;
  /** Current approved immutable release this listing resolves to. */
  currentRelease: { version: string; releaseDigest: ContentHash; reviewedAt: Iso8601 };
  title: string;
  description: string;
  category: string;
  supportedFeedTypes: readonly string[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  publisher: string;
  status: TransformListingState;
  /** Historical approved versions remain listed for provenance (P9-09). */
  versionHistory: readonly { version: string; releaseDigest: ContentHash; changelog: string }[];
  offer: TransformOfferTerms;
  compatibility: readonly string[];
  support: string;
  /** Latency/resource expectations for feed-launch disclosure (P9-12). */
  expectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: "measured" | "fixture" | "declared";
  };
  /** Rights prerequisites the user must satisfy per invocation (P9-14). */
  rightsPrerequisites: readonly string[];
  policy: PolicySet;
}

/** Entitlement to invoke a release under free or paid terms. */
export interface TransformEntitlement {
  entitlementId: SportaId;
  /** Principal holding the entitlement (tenant/user). */
  principal: string;
  pipelineId: SportaId;
  version: string;
  releaseDigest: ContentHash;
  offerKind: "free" | "paid-per-run" | "subscription";
  /** Provider-neutral payment/settlement reference; not the authority. */
  settlementRef: string | null;
  /** Idempotency key for chargeable-run authorization retries (P9-11). */
  idempotencyKey: string;
  usageLimits: { maxRuns: number | null; usedRuns: number; expiresAt: Iso8601 | null };
  status: "active" | "revoked" | "expired";
  grantedAt: Iso8601;
  revokedAt: Iso8601 | null;
}

/** Suspension record — stops new runs, never falsifies history (P9-10). */
export interface TransformSuspensionRecord {
  suspensionId: SportaId;
  listingId: SportaId;
  pipelineId: SportaId;
  version: string;
  reason: string;
  suspendedAt: Iso8601;
  suspendedBy: string;
  /** Historical runs stay pinned and readable; only new selection stops. */
  effect: "block-new-runs";
}

/** Typed admission outcome for a feed-launch selection (fail-closed). */
export type TransformListingSelectionResult =
  | {
      admitted: true;
      listingId: SportaId;
      releaseDigest: ContentHash;
      entitlementId: SportaId;
    }
  | {
      admitted: false;
      reason:
        | "listing-not-published"
        | "no-entitlement"
        | "entitlement-revoked"
        | "entitlement-expired"
        | "usage-limit-exhausted"
        | "rights-prerequisites-unsatisfied"
        | "suspended";
      detail: string;
    };

// ============================================================================
// Wave 9 (Worker B) — additive implementations BEHIND the frozen types
// (frozen block above untouched; names appended, surface stays green).
// ============================================================================

// W9B-1 — candidate lifecycle, immutability and material-change law.
export type { TransformCandidateRecord, TransformMaterialChangeKind } from "./domain/lifecycle.js";
export {
  advanceCandidate,
  advanceListing,
  classifyCandidateMaterialChange,
  compareVersions,
  draftCandidateRecord,
} from "./domain/lifecycle.js";

// W9B-1 — the automated check lane (explicit registry, typed outcomes).
export type {
  CheckLaneStorePort,
  TransformAutomatedCheckResult,
  TransformCheckDefinition,
  TransformCheckLaneInput,
  TransformCheckLaneRecord,
  TransformCheckRole,
  TransformDependencySignal,
} from "./domain/checks.js";
export {
  TRANSFORM_AUTOMATED_CHECK_REGISTRY,
  failedGateCheckIds,
  runDeclaredChecks,
} from "./domain/checks.js";

// W9B-3 — provider-neutral settlement port (payments are adapters only).
export type {
  SettlementPort,
  TransformSettlementRecord,
  TransformSettlementRequest,
  TransformSettlementResult,
} from "./domain/paymentPort.js";
export { settlementIdempotencyKeyPreimage } from "./domain/paymentPort.js";

// W9B-4 — rights snapshot law + typed launch disclosure (P9-12/14/16).
export type { TransformRightsSnapshot } from "./domain/rights.js";
export { isWellFormedRightsSnapshot, rightsPrerequisitesSatisfied } from "./domain/rights.js";
export type { TransformLaunchDisclosure } from "./domain/disclosure.js";
export { TRANSFORM_LAUNCH_LEGAL_NOTICE, buildLaunchDisclosure } from "./domain/disclosure.js";

// Domain ports, typed errors and stable-id helpers.
export type {
  CandidateStorePort,
  DecisionStorePort,
  EntitlementStorePort,
  ListingStateEventStorePort,
  ListingStorePort,
  MarketplaceClock,
  MarketplaceHashPort,
  SuspensionStorePort,
  TransformListingStateEvent,
  TransformManifestReadPort,
} from "./domain/ports.js";
export {
  MarketplaceError,
  TransformCandidateImmutableError,
  TransformCheckLaneError,
  TransformLifecycleError,
  TransformListingError,
  TransformManifestUnresolvedError,
  TransformReleaseDigestMismatchError,
  TransformReviewError,
  TransformSettlementRefusedError,
  TransformUnknownRecordError,
  TransformVersionRegressionError,
} from "./domain/errors.js";
export { idFromDigest, stableStringify } from "./domain/stable.js";

// App services (submission/check lane, review, listing, entitlement,
// fail-closed admission).
export type {
  CheckLaneSignalsInput,
  StartDraftInput,
  SubmissionServiceDeps,
} from "./app/submissionService.js";
export { SubmissionService } from "./app/submissionService.js";
// W12 — the creator-side enumeration read (composition seam; frozen port untouched).
export type {
  CandidateEnumerationPort,
  CreatorCandidateQueryServiceDeps,
} from "./app/creatorQueryService.js";
export { CreatorCandidateQueryService } from "./app/creatorQueryService.js";
export type {
  HumanReviewEntryInput,
  RecordReviewDecisionInput,
  ReviewServiceDeps,
} from "./app/reviewService.js";
export { REQUIRED_REVIEW_ROLES, ReviewService } from "./app/reviewService.js";
export type { ListingServiceDeps, PublishApprovedReleaseInput } from "./app/listingService.js";
export { ListingService } from "./app/listingService.js";
export type { EntitlementServiceDeps } from "./app/entitlementService.js";
export { EntitlementService } from "./app/entitlementService.js";
export type {
  FeedLaunchAdmissionServiceDeps,
  SelectForLaunchInput,
} from "./app/feedLaunchAdmissionService.js";
export { FeedLaunchAdmissionService } from "./app/feedLaunchAdmissionService.js";

// Adapters — REAL hash/clock; clearly-labeled FIXTURE settlement,
// manifest source and in-memory stores.
export { Sha256MarketplaceHash, sha256Text } from "./adapters/hash.js";
export { FixedClock, systemClockNow } from "./adapters/clock.js";
export { FixtureSettlementAdapter } from "./adapters/fixtureSettlement.js";
export { FixtureManifestSource } from "./adapters/fixtureManifestSource.js";
export {
  InMemoryCandidateStore,
  InMemoryCheckLaneStore,
  InMemoryDecisionStore,
  InMemoryEntitlementStore,
  InMemoryListingStateEventStore,
  InMemoryListingStore,
  InMemorySuspensionStore,
} from "./adapters/inMemoryMarketplaceStore.js";
