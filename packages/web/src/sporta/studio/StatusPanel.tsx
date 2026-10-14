/**
 * StatusPanel — the Status/output stage (W11B-2): the admission's
 * pinned release + entitlement, the preview run's measured evidence at
 * the point of use, and the links into Worker C's runs/library screens
 * (the run history and artifact-lineage authorities — the studio never
 * duplicates them). A refusal stays a refusal here too: the typed
 * reason + detail render verbatim, never replaced by success copy.
 */
import { gradeLabel } from "./marketplaceViews.js";
import type { StudioSamplePreviewView } from "./studioPorts.js";
import type { WorkbenchFlowState } from "./workbench.js";

export function StatusPanel({
  flow,
  preview,
  onOpenRuns,
  onOpenLibrary,
}: {
  flow: WorkbenchFlowState;
  preview: StudioSamplePreviewView | null;
  onOpenRuns: () => void;
  onOpenLibrary: () => void;
}) {
  if (flow.launchStage === "idle" || flow.launchStage === "disclosure" || flow.launchStage === "awaiting-confirmation") {
    return (
      <section className="studio-context-card" aria-label="Run status and output">
        <h3>Status &amp; output</h3>
        <p className="studio-empty">No launch confirmed yet — status appears after the admission runs.</p>
      </section>
    );
  }
  if (flow.launchStage === "refused") {
    return (
      <section className="studio-context-card" aria-label="Run status and output">
        <h3>Status &amp; output</h3>
        <div className="studio-admission studio-admission-refused" role="alert">
          <h4>Refused — nothing ran</h4>
          <p>
            The admission refused the launch (see the Launch panel for the typed reason and detail).
            No run executed and no output was produced — the refusal IS the status.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="studio-context-card" aria-label="Run status and output">
      <h3>Status &amp; output</h3>
      <div className="studio-admission studio-admission-ok" role="status">
        <h4>Admitted</h4>
        <p>
          The approved release was pinned for the run (see the Launch panel for the digest and
          entitlement).
        </p>
      </div>
      <h4>Evidence at the point of use</h4>
      {preview === null ? (
        <p className="studio-empty">
          No sample-preview evidence is loaded for this pipeline — the run's own evidence lands in
          Runs and Library.
        </p>
      ) : (
        <p className="studio-preview-evidence">
          {preview.outputSummary} · {preview.semanticEvidence} · grade{" "}
          {gradeLabel(preview.evidenceGrade)} ({preview.evidenceGrade})
        </p>
      )}
      <div className="studio-status-links">
        <button type="button" className="studio-link" onClick={onOpenRuns}>
          Open Runs
          <span className="studio-link-purpose">run history, per-step evidence, typed failures</span>
        </button>
        <button type="button" className="studio-link" onClick={onOpenLibrary}>
          Open Library
          <span className="studio-link-purpose">output assets, revisions, provenance lineage</span>
        </button>
      </div>
    </section>
  );
}
