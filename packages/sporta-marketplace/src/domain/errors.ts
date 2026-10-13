/**
 * Typed sporta-marketplace errors (domain layer — pure, no IO).
 *
 * The compute-fallback precedent law: failures are typed records
 * with machine-readable refusal kinds, never stringly exceptions and
 * never silent defaults. Every service failure below carries the
 * refusing seam so callers and tests observe one vocabulary.
 */

/** Base class for all typed sporta-marketplace errors. */
export class MarketplaceError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** The typed submission/refusal family (W9B-1). */
export type TransformSubmissionRefusalKind =
  | "unknown-draft"
  | "draft-already-submitted"
  | "unknown-candidate"
  | "state-transition-illegal";

/** Draft registration, submission freeze or lifecycle transition failed. */
export class MarketplaceSubmissionError extends MarketplaceError {
  readonly refusalKind: TransformSubmissionRefusalKind;
  /** The draft/candidate id the refusal is about. */
  readonly subjectId: string | null;

  constructor(message: string, refusalKind: TransformSubmissionRefusalKind, subjectId: string | null = null) {
    super(message, `submission:${refusalKind}${subjectId === null ? "" : `:${subjectId}`}`);
    this.refusalKind = refusalKind;
    this.subjectId = subjectId;
  }
}

/** The typed human-review refusal family (W9B-1). */
export type TransformReviewRefusalKind =
  | "unknown-candidate"
  | "checks-not-run"
  | "automated-failures-present"
  | "missing-required-role"
  | "duplicate-role"
  | "malformed-signoff"
  | "illegal-outcome-for-state"
  | "policy-version-missing";

/** A review decision could not be recorded (fail-closed approval law). */
export class MarketplaceReviewError extends MarketplaceError {
  readonly refusalKind: TransformReviewRefusalKind;
  readonly candidateDigest: string | null;

  constructor(message: string, refusalKind: TransformReviewRefusalKind, candidateDigest: string | null = null) {
    super(message, `review:${refusalKind}`);
    this.refusalKind = refusalKind;
    this.candidateDigest = candidateDigest;
  }
}

/** The typed listing refusal family (W9B-2). */
export type TransformListingRefusalKind =
  | "unknown-listing"
  | "unknown-decision"
  | "decision-not-approved"
  | "candidate-not-approved"
  | "duplicate-release"
  | "version-conflict"
  | "listing-state-terminal";

/** Publication or listing state change failed; history is never touched. */
export class MarketplaceListingError extends MarketplaceError {
  readonly refusalKind: TransformListingRefusalKind;
  readonly listingId: string | null;

  constructor(message: string, refusalKind: TransformListingRefusalKind, listingId: string | null = null) {
    super(message, `listing:${refusalKind}${listingId === null ? "" : `:${listingId}`}`);
    this.refusalKind = refusalKind;
    this.listingId = listingId;
  }
}

/** The typed entitlement refusal family (W9B-3). */
export type TransformEntitlementRefusalKind =
  | "unknown-listing"
  | "listing-not-published"
  | "settlement-refused"
  | "unknown-entitlement"
  | "already-revoked";

/** Entitlement issuance, settlement or lifecycle change failed. */
export class MarketplaceEntitlementError extends MarketplaceError {
  readonly refusalKind: TransformEntitlementRefusalKind;
  readonly entitlementId: string | null;

  constructor(message: string, refusalKind: TransformEntitlementRefusalKind, entitlementId: string | null = null) {
    super(message, `entitlement:${refusalKind}${entitlementId === null ? "" : `:${entitlementId}`}`);
    this.refusalKind = refusalKind;
    this.entitlementId = entitlementId;
  }
}
