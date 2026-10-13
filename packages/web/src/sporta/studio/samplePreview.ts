/**
 * Sample-preview view-model (PURE — no react, no IO; W9C-8).
 * Projects a transform-run-manifest-shaped record (the structural
 * mirror of @sporta/transforms TransformRunManifest) into the sample
 * preview the studio shows next to a listing — outputs, semantic
 * evidence and the honest fidelity grade, labeled.
 */
import type { StudioSamplePreviewView } from "./studioPorts.js";

/** Structural mirror of TransformRunManifest (input shape). */
export interface StudioRunManifestShape {
  runManifestId: string;
  release: { pipelineId: string; version: string; releaseDigest: string };
  outputs: readonly { artifactRevisionId: string; semanticEvidence: string }[];
  semanticFidelity: { grade: "measured" | "fixture" | "declared"; note: string };
}

/** Project one run manifest + its sample feed summary into the view. */
export function projectSamplePreview(
  run: StudioRunManifestShape,
  inputSummary: string,
): StudioSamplePreviewView {
  const outputCount = run.outputs.length;
  return {
    pipelineId: run.release.pipelineId,
    version: run.release.version,
    inputSummary,
    outputSummary:
      outputCount === 0
        ? "no output revisions"
        : `${outputCount} output revision${outputCount === 1 ? "" : "s"} (${run.outputs
            .map((output) => output.artifactRevisionId)
            .join(", ")})`,
    semanticEvidence:
      run.outputs.length === 0
        ? run.semanticFidelity.note
        : `${run.semanticFidelity.note} — ${run.outputs[0]?.semanticEvidence ?? ""}`.trim(),
    evidenceGrade: run.semanticFidelity.grade,
  };
}
