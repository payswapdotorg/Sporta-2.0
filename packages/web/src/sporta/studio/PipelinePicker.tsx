/**
 * PipelinePicker — the work area's pipeline strip (W11B-1/2): the
 * approved listings from `host.listListings()` (the marketplace READ
 * seam — no second marketplace authority). Published listings are
 * selectable; suspended listings stay honestly visible and explicitly
 * not-selectable (the W10A law: the suspended seed is never hidden).
 */
import type { StudioListingView } from "./studioPorts.js";
import { gradeLabel, priceLine } from "./marketplaceViews.js";

export function PipelinePicker({
  listings,
  loading,
  error,
  selectedListingId,
  onSelect,
}: {
  listings: readonly StudioListingView[] | null;
  loading: boolean;
  error: string | null;
  selectedListingId: string | null;
  onSelect: (listingId: string) => void;
}) {
  if (loading) return <p className="studio-loading">Loading pipelines…</p>;
  if (error !== null) {
    return (
      <p className="studio-refusal" role="alert">
        Pipelines failed to load: {error}
      </p>
    );
  }
  if (listings === null || listings.length === 0) {
    return (
      <p className="studio-empty">
        No pipelines available. Open the Marketplace to browse approved pipelines.
      </p>
    );
  }
  return (
    <ul className="studio-picker" aria-label="Pipeline selection">
      {listings.map((listing) => {
        const published = listing.status === "PUBLISHED";
        const selected = selectedListingId === listing.listingId;
        return (
          <li key={listing.listingId} className="studio-picker-item">
            <button
              type="button"
              className={
                selected ? "studio-pipeline studio-pipeline-selected" : "studio-pipeline"
              }
              disabled={!published}
              aria-pressed={selected}
              title={
                published
                  ? `${listing.title} v${listing.approvedVersion}`
                  : `${listing.title} is ${listing.status} — new runs are blocked`
              }
              onClick={() => onSelect(listing.listingId)}
            >
              <span className="studio-pipeline-title">{listing.title}</span>
              <span className="studio-pipeline-meta">
                v{listing.approvedVersion} · {listing.publisher} · {priceLine(listing.offer)}
              </span>
              <span className="studio-pipeline-meta">
                {listing.status} · grade {gradeLabel(listing.expectations.evidenceGrade)} · ~
                {String(listing.expectations.typicalLatencyMs)}ms
              </span>
            </button>
            {!published ? (
              <span className="studio-pipeline-blocked" role="note">
                {listing.status} — new runs blocked
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
