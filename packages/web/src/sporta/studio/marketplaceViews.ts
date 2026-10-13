/**
 * Marketplace view-models (PURE — no react, no IO; W9C-8).
 *
 * Projections of the @sporta/marketplace read shapes (review
 * decision, listing, launch disclosure) into the studio views. The
 * input types are structural mirrors of the frozen marketplace
 * records — compat is proven in the studio battery tests by feeding
 * REAL w9b records through these projectors.
 */
import type {
  StudioDisclosureView,
  StudioEvidenceGrade,
  StudioListingView,
  StudioReviewStatus,
} from "./studioPorts.js";

/** Structural mirror of TransformReviewDecision (input shape). */
export interface StudioReviewDecisionShape {
  outcome: string;
  policyVersion: string;
  decidedAt: string;
  rationale: string;
  humanReview: readonly { role: string; reviewer: string; reviewedAt: string }[];
  automatedChecks: readonly {
    checkId: string;
    outcome: "pass" | "fail" | "warn";
    evidenceKind: "measured" | "fixture";
  }[];
}

/** Structural mirror of TransformListing (input shape). */
export interface StudioListingShape {
  listingId: string;
  pipelineId: string;
  title: string;
  publisher: string;
  status: string;
  currentRelease: { version: string; releaseDigest: string; reviewedAt: string };
  category: string;
  supportedFeedTypes: readonly string[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  compatibility: readonly string[];
  offer: {
    kind: "free" | "paid-per-run" | "subscription";
    price: { amount: number; currency: string } | null;
    termsLicense: string;
  };
  expectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: "measured" | "fixture" | "declared";
  };
  rightsPrerequisites: readonly string[];
  versionHistory: readonly { version: string; releaseDigest: string; changelog: string }[];
}

/** Structural mirror of TransformLaunchDisclosure (input shape). */
export interface StudioDisclosureShape {
  listingId: string;
  publisher: string;
  approvedVersion: string;
  releaseDigest: string;
  terms: StudioListingShape["offer"];
  rightsPrerequisites: readonly string[];
  dependencies: readonly { kind: string; name: string; digest: string; license: string }[];
  outputs: readonly string[];
  limitations: readonly string[];
  cost: { amount: number; currency: string } | null;
  latencyExpectations: StudioListingShape["expectations"];
  evidenceGrade: "measured" | "fixture" | "declared";
  reviewedAt: string;
  legalNotice: string;
}

/** Project one review decision into the studio view (roles sorted). */
export function projectReviewStatus(
  decision: StudioReviewDecisionShape,
): StudioReviewStatus {
  return {
    outcome: decision.outcome,
    decidedAt: decision.decidedAt,
    policyVersion: decision.policyVersion,
    rationale: decision.rationale,
    reviewerRoles: decision.humanReview.map((entry) => entry.role).sort(),
    automatedChecks: decision.automatedChecks.map((check) => ({
      checkId: check.checkId,
      outcome: check.outcome,
      evidenceKind: check.evidenceKind,
    })),
  };
}

/** Whether a review status carries ALL three required signoff roles (P9-08). */
export function reviewFullySigned(status: StudioReviewStatus): boolean {
  return (
    status.reviewerRoles.includes("product") &&
    status.reviewerRoles.includes("rights") &&
    status.reviewerRoles.includes("security")
  );
}

/** Project one listing into the studio view (approved release front). */
export function projectListing(listing: StudioListingShape): StudioListingView {
  return {
    listingId: listing.listingId,
    pipelineId: listing.pipelineId,
    title: listing.title,
    publisher: listing.publisher,
    status: listing.status,
    approvedVersion: listing.currentRelease.version,
    releaseDigest: listing.currentRelease.releaseDigest,
    category: listing.category,
    supportedFeedTypes: [...listing.supportedFeedTypes],
    expectedOutputs: [...listing.expectedOutputs],
    limitations: [...listing.limitations],
    offer: { kind: listing.offer.kind, price: listing.offer.price },
    compatibility: [...listing.compatibility],
    expectations: { ...listing.expectations },
    rightsPrerequisites: [...listing.rightsPrerequisites],
    versionHistory: listing.versionHistory.map((entry) => ({ ...entry })),
  };
}

/** Only PUBLISHED listings are selectable (the honest filter). */
export function selectableListings(
  listings: readonly StudioListingShape[],
): readonly StudioListingView[] {
  return listings.filter((listing) => listing.status === "PUBLISHED").map(projectListing);
}

/** Project one launch disclosure (the P9-12 pre-launch surface). */
export function projectDisclosure(disclosure: StudioDisclosureShape): StudioDisclosureView {
  return {
    listingId: disclosure.listingId,
    publisher: disclosure.publisher,
    approvedVersion: disclosure.approvedVersion,
    releaseDigest: disclosure.releaseDigest,
    terms: { ...disclosure.terms },
    rightsPrerequisites: [...disclosure.rightsPrerequisites],
    dependencies: disclosure.dependencies.map((dependency) => ({ ...dependency })),
    outputs: [...disclosure.outputs],
    limitations: [...disclosure.limitations],
    cost: disclosure.cost === null ? null : { ...disclosure.cost },
    latencyExpectations: { ...disclosure.latencyExpectations },
    evidenceGrade: disclosure.evidenceGrade,
    reviewedAt: disclosure.reviewedAt,
    legalNotice: disclosure.legalNotice,
  };
}

/** The price line the UI shows (free is explicit, never hidden). */
export function priceLine(offer: { kind: string; price: { amount: number; currency: string } | null }): string {
  if (offer.price === null) return "Free";
  return `${offer.price.amount.toFixed(2)} ${offer.price.currency} per run`;
}

/** Grade badge label (the honesty law: fixture is labeled, never "real"). */
export function gradeLabel(grade: StudioEvidenceGrade): string {
  switch (grade) {
    case "measured":
      return "MEASURED";
    case "fixture":
      return "FIXTURE";
    case "declared":
      return "DECLARED";
  }
}
