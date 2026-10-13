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
import type { TransformPipelineManifest, TransformReleaseCandidate } from "@sporta/transforms/contract";
export type { TransformPipelineManifest, TransformReleaseCandidate } from "@sporta/transforms/contract";

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
