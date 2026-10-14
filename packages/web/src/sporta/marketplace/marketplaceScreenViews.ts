/**
 * Marketplace + My-Pipelines screen view-models (W11C — PURE, no react,
 * no IO; the studio marketplaceViews.ts precedent, re-declared in THIS
 * lane's root because studio/** is Worker B's and the state-owner law
 * forbids cross-lane imports of mutable presentation roots).
 *
 * Every projection is a pure function over the structural mirror shapes;
 * grade labels render the record's own grade verbatim (UI-15: never
 * inflated, fixture labeled).
 */
import type {
  CreatorPipelineRecord,
  MarketplaceListingShape,
  MarketplaceListingDetail,
  MarketplaceRecordGrade,
  MarketplaceReviewShape,
} from "./marketplaceScreenPorts.js";

/** The listing states a public marketplace surface shows honestly. */
export type ListingStateClass =
  | "published"
  | "suspended"
  | "withdrawn"
  | "superseded"
  | "unknown";

/** Classify a listing state (unknown states stay visible, never hidden). */
export function listingStateClass(status: string): ListingStateClass {
  switch (status) {
    case "PUBLISHED":
      return "published";
    case "SUSPENDED":
      return "suspended";
    case "WITHDRAWN":
      return "withdrawn";
    case "SUPERSEDED":
      return "superseded";
    default:
      return "unknown";
  }
}

/** The price line the screen shows (free is explicit, never hidden). */
export function offerPriceLine(offer: MarketplaceListingShape["offer"]): string {
  if (offer.price === null) return "Free";
  return `${offer.price.amount.toFixed(2)} ${offer.price.currency} per run`;
}

/** The record grade badge label — the record's own grade, verbatim. */
export function recordGradeLabel(grade: MarketplaceRecordGrade): string {
  switch (grade) {
    case "measured":
      return "MEASURED";
    case "fixture":
      return "FIXTURE";
    case "declared":
      return "DECLARED";
  }
}

/** Grade badge class (state must not depend on color alone — text label too). */
export function recordGradeClass(grade: MarketplaceRecordGrade): string {
  return `sporta-grade-${grade}`;
}

/** Whether the review carries ALL three required signoff roles (P9-08). */
export function reviewFullySigned(review: MarketplaceReviewShape): boolean {
  return (
    review.reviewerRoles.includes("product") &&
    review.reviewerRoles.includes("rights") &&
    review.reviewerRoles.includes("security")
  );
}

/** Review summary line (roles + automated checks, compact and honest). */
export function reviewSummaryLine(review: MarketplaceReviewShape): string {
  const checks = review.automatedChecks
    .map((check) => `${check.checkId}:${check.outcome}`)
    .join(", ");
  return `${review.outcome} — roles ${review.reviewerRoles.join(", ")}` +
    (reviewFullySigned(review) ? " (all three signoffs)" : " (INCOMPLETE SIGNOFF)") +
    (checks.length > 0 ? ` · checks ${checks}` : "");
}

/** One public listing card (the marketplace browse view-model). */
export interface ListingCardView {
  listingId: string;
  pipelineId: string;
  title: string;
  publisher: string;
  status: string;
  stateClass: ListingStateClass;
  approvedVersion: string;
  releaseDigestHead: string;
  priceLine: string;
  gradeLabel: string;
  gradeClass: string;
  category: string;
  outputs: readonly string[];
}

/** Project a listing into its browse card (pure). */
export function listingCard(listing: MarketplaceListingShape): ListingCardView {
  return {
    listingId: listing.listingId,
    pipelineId: listing.pipelineId,
    title: listing.title,
    publisher: listing.publisher,
    status: listing.status,
    stateClass: listingStateClass(listing.status),
    approvedVersion: listing.approvedVersion,
    releaseDigestHead: listing.releaseDigest.slice(0, 19) + "…",
    priceLine: offerPriceLine(listing.offer),
    gradeLabel: recordGradeLabel(listing.expectations.evidenceGrade),
    gradeClass: recordGradeClass(listing.expectations.evidenceGrade),
    category: listing.category,
    outputs: [...listing.expectedOutputs],
  };
}

/** Disclosure fact rows (the launch-disclosure fields, P9-12 order). */
export function disclosureRows(
  disclosure: NonNullable<MarketplaceListingDetail["disclosure"]>,
): readonly { label: string; value: string }[] {
  const price =
    disclosure.terms.price === null
      ? "Free"
      : `${disclosure.terms.price.amount.toFixed(2)} ${disclosure.terms.price.currency} per run`;
  return [
    { label: "Publisher", value: disclosure.publisher },
    { label: "Approved version", value: disclosure.approvedVersion },
    { label: "Release", value: disclosure.releaseDigest.slice(0, 19) + "…" },
    { label: "Terms", value: `${price} · license ${disclosure.terms.termsLicense}` },
    {
      label: "Cost",
      value: disclosure.cost === null ? "none beyond terms" : `${disclosure.cost.amount} ${disclosure.cost.currency}`,
    },
    {
      label: "Latency expectation",
      value: `~${disclosure.latencyExpectations.typicalLatencyMs}ms · ${disclosure.latencyExpectations.declaredThroughput} · ${recordGradeLabel(disclosure.latencyExpectations.evidenceGrade)}`,
    },
    {
      label: "Rights prerequisites",
      value: disclosure.rightsPrerequisites.length > 0 ? disclosure.rightsPrerequisites.join("; ") : "none declared",
    },
    { label: "Outputs", value: disclosure.outputs.join(", ") },
    {
      label: "Limitations",
      value: disclosure.limitations.length > 0 ? disclosure.limitations.join("; ") : "none declared",
    },
    {
      label: "Dependencies",
      value:
        disclosure.dependencies.map((d) => `${d.name} (${d.kind}, ${d.license})`).join(", ") || "none",
    },
    { label: "Evidence grade", value: recordGradeLabel(disclosure.evidenceGrade) },
    { label: "Reviewed at", value: disclosure.reviewedAt },
  ];
}

/** The creator viewpoint classification (pure, over record status). */
export function creatorStateFor(status: string): CreatorPipelineRecord["creatorState"] {
  switch (status) {
    case "PUBLISHED":
      return "released";
    case "SUSPENDED":
      return "suspended";
    case "WITHDRAWN":
      return "withdrawn";
    case "SUPERSEDED":
      return "superseded";
    case "DRAFT":
      return "draft";
    case "SUBMITTED":
      return "submitted";
    case "CHANGES_REQUESTED":
      return "changes-requested";
    default:
      return "draft";
  }
}

/** Project a listing into the creator's record row (pure). */
export function creatorRecordFromListing(
  listing: MarketplaceListingShape,
): CreatorPipelineRecord {
  return {
    listingId: listing.listingId,
    pipelineId: listing.pipelineId,
    title: listing.title,
    publisher: listing.publisher,
    status: listing.status,
    creatorState: creatorStateFor(listing.status),
    origin: "record",
    approvedVersion: listing.approvedVersion,
    reviewedAt: null,
    note: null,
  };
}

/** The creator-facing label of a record's state (do not lean on color). */
export function creatorStateLabel(state: CreatorPipelineRecord["creatorState"]): string {
  switch (state) {
    case "released":
      return "Released";
    case "suspended":
      return "Suspended";
    case "withdrawn":
      return "Withdrawn";
    case "superseded":
      return "Superseded";
    case "draft":
      return "Draft";
    case "submitted":
      return "Submitted for review";
    case "changes-requested":
      return "Changes requested";
  }
}

/** Disabled-action reasons (the work-order law: disabled WITH a reason). */
export const MARKETPLACE_DISABLED_REASONS = {
  openInStudio:
    "Open in Studio is disabled: the product shell (navigation) is not wired at this wave — the studio host port exposes no navigation write. Recorded in the worker report under NEXT DEPENDENCIES.",
  submitForReview:
    "Submit for review is disabled: candidate submission is a marketplace write service, not a screen read model — the screen port surface exposes no submission write. Recorded in NEXT DEPENDENCIES.",
  withdraw:
    "Withdraw is disabled: withdrawal is a listing-state write, not part of the screen read model. Recorded in NEXT DEPENDENCIES.",
} as const;
