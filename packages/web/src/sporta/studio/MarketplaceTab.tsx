/**
 * MarketplaceTab — listing/review-status/sample-preview view (W9C-8).
 *
 * BUILD-VERIFIED/UNTESTED (the SportaPanel honesty law): compiled by
 * `pnpm exec tsc -b packages/web`; the pure view-models it consumes
 * are battery-tested (app-environments test/studioViews.test.ts).
 */
import { useEffect, useState } from "react";
import type {
  StudioListingView,
  StudioReviewStatus,
  StudioSamplePreviewView,
  TransformStudioHostPort,
} from "./studioPorts.js";
import { gradeLabel, priceLine, reviewFullySigned } from "./marketplaceViews.js";

export function MarketplaceTab({
  host,
  onError,
}: {
  host: TransformStudioHostPort;
  onError: (message: string | null) => void;
}) {
  const [listings, setListings] = useState<readonly StudioListingView[] | null>(null);
  const [reviews, setReviews] = useState<Record<string, StudioReviewStatus | null>>({});
  const [previews, setPreviews] = useState<Record<string, StudioSamplePreviewView | null>>({});

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const raw = await host.listListings();
        const published = raw.filter((listing) => listing.status === "PUBLISHED");
        setListings(published);
        const reviewEntries: [string, StudioReviewStatus | null][] = [];
        const previewEntries: [string, StudioSamplePreviewView | null][] = [];
        for (const listing of published) {
          reviewEntries.push([
            listing.listingId,
            await host.readReviewStatus(listing.pipelineId, listing.approvedVersion),
          ]);
          previewEntries.push([
            listing.listingId,
            await host.readSamplePreview(listing.pipelineId, listing.approvedVersion),
          ]);
        }
        if (disposed) return;
        setReviews(Object.fromEntries(reviewEntries));
        setPreviews(Object.fromEntries(previewEntries));
        onError(null);
      } catch (cause) {
        if (!disposed) onError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [host, onError]);

  if (listings === null) {
    return <p className="studio-loading">Loading listings…</p>;
  }
  return (
    <section className="studio-section" aria-label="Marketplace listings and review status">
      <h2>Marketplace</h2>
      {listings.length === 0 ? (
        <p className="studio-empty">No published listings.</p>
      ) : (
        listings.map((listing) => (
          <ListingArticle
            key={listing.listingId}
            listing={listing}
            review={reviews[listing.listingId] ?? null}
            preview={previews[listing.listingId] ?? null}
          />
        ))
      )}
    </section>
  );
}

function ListingArticle({
  listing,
  review,
  preview,
}: {
  listing: StudioListingView;
  review: StudioReviewStatus | null;
  preview: StudioSamplePreviewView | null;
}) {
  return (
    <article className="studio-listing">
      <h3>{listing.title}</h3>
      <p className="studio-listing-meta">
        {listing.publisher} · v{listing.approvedVersion} · {priceLine(listing.offer)} ·
        grade {gradeLabel(listing.expectations.evidenceGrade)}
      </p>
      <p className="studio-listing-meta">
        Status {listing.status} · release {listing.releaseDigest.slice(0, 19)}… ·
        typical latency {listing.expectations.typicalLatencyMs}ms
      </p>
      <h4>Outputs</h4>
      <ul>
        {listing.expectedOutputs.map((output) => (
          <li key={output}>{output}</li>
        ))}
      </ul>
      <h4>Limitations</h4>
      <ul>
        {listing.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
      <h4>Rights prerequisites</h4>
      <ul>
        {listing.rightsPrerequisites.map((prerequisite) => (
          <li key={prerequisite}>{prerequisite}</li>
        ))}
      </ul>
      <h4>Review status</h4>
      {review === null ? (
        <p className="studio-empty">No review decision recorded.</p>
      ) : (
        <p>
          {review.outcome} at {review.decidedAt} under {review.policyVersion} —
          roles {review.reviewerRoles.join(", ")}{" "}
          {reviewFullySigned(review) ? "(all three signoffs)" : "(INCOMPLETE SIGNOFF)"} ·
          checks {review.automatedChecks.map((check) => `${check.checkId}: ${check.outcome}`).join(", ")}
        </p>
      )}
      <h4>Sample preview</h4>
      {preview === null ? (
        <p className="studio-empty">No sample preview available.</p>
      ) : (
        <p>
          {preview.inputSummary} → {preview.outputSummary} ·{" "}
          {preview.semanticEvidence} · grade {gradeLabel(preview.evidenceGrade)}
        </p>
      )}
    </article>
  );
}
