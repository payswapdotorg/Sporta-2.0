/**
 * PreviewPanel — the Preview-stage context (W11B-2): the composed
 * sample-preview seam (`host.readSamplePreview` — a REAL run of the
 * seeded pipeline when the headless composition drives the studio,
 * measured carry-forward evidence and all) + the review status read.
 * The evidence grade shows at the point of use; an honest null (a
 * pipeline that declares no sample) is a stated state, never a
 * fabricated preview.
 */
import { gradeLabel, reviewFullySigned } from "./marketplaceViews.js";
import type { StudioListingView, StudioReviewStatus, StudioSamplePreviewView } from "./studioPorts.js";

export function PreviewPanel({
  listing,
  preview,
  loading,
  error,
  review,
}: {
  listing: StudioListingView | null;
  preview: StudioSamplePreviewView | null;
  loading: boolean;
  error: string | null;
  review: StudioReviewStatus | null;
}) {
  return (
    <section className="studio-context-card" aria-label="Sample preview and review status">
      <h3>Preview</h3>
      {listing === null ? (
        <p className="studio-empty">Select a pipeline to see its sample preview.</p>
      ) : loading ? (
        <p className="studio-loading">Running the sample preview…</p>
      ) : error !== null ? (
        <p className="studio-refusal" role="alert">
          Preview failed: {error}
        </p>
      ) : preview === null ? (
        <p className="studio-empty">
          No sample preview available for {listing.title} v{listing.approvedVersion} — the pipeline
          declares none.
        </p>
      ) : (
        <div className="studio-preview">
          <p className="studio-preview-io">
            <span className="studio-preview-label">Input</span> {preview.inputSummary}
          </p>
          <p className="studio-preview-io">
            <span className="studio-preview-label">Output</span> {preview.outputSummary}
          </p>
          <p className="studio-preview-evidence">{preview.semanticEvidence}</p>
          <p className="studio-badges">
            <span className={`studio-badge studio-badge-grade-${preview.evidenceGrade}`}>
              grade {gradeLabel(preview.evidenceGrade)} ({preview.evidenceGrade})
            </span>
          </p>
        </div>
      )}
      <h4>Review status</h4>
      {review === null ? (
        <p className="studio-empty">No review decision recorded for this pipeline version.</p>
      ) : (
        <p className="studio-review">
          {review.outcome} at {review.decidedAt} under {review.policyVersion} — roles{" "}
          {review.reviewerRoles.join(", ")}{" "}
          {reviewFullySigned(review) ? "(all three signoffs)" : "(INCOMPLETE SIGNOFF)"} · checks{" "}
          {review.automatedChecks
            .map((check) => `${check.checkId}: ${check.outcome} (${check.evidenceKind})`)
            .join(", ")}
        </p>
      )}
    </section>
  );
}
