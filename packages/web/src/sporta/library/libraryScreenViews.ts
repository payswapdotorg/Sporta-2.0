/**
 * Library screen view-models (W11C — PURE). Projections of the artifact
 * mirror shapes: revision lineage rows (root-first, immutable history —
 * never an overwritable file list), editability labels, provenance and
 * export availability. The record's own fields render verbatim (UI-15).
 */
import type {
  LibraryArtifactDetail,
  LibraryArtifactShape,
  LibraryRevisionShape,
} from "./libraryScreenPorts.js";
import type { ScreenBacking } from "../marketplace/marketplaceScreenPorts.js";

/** The editability label (product language, record value verbatim too). */
export function editabilityLabel(editability: LibraryArtifactShape["editability"]): string {
  switch (editability) {
    case "editable":
      return "Editable project";
    case "derived-only":
      return "Derived output (not directly editable)";
    case "opaque":
      return "Opaque asset";
  }
}

/** One lineage row (a revision as the Library shows it). */
export interface RevisionRowView {
  revisionId: string;
  contentHashHead: string;
  parentRevisionId: string | null;
  depth: number;
  isHead: boolean;
  tools: string;
  provenanceLine: string;
  organizationLine: string | null;
}

/** Project the lineage into rows (root first; head marked). */
export function revisionRows(
  revisions: readonly LibraryRevisionShape[],
): readonly RevisionRowView[] {
  const head = revisions.length > 0 ? revisions[revisions.length - 1] : undefined;
  const headId = head?.revisionId ?? null;
  return revisions.map((revision, index) => ({
    revisionId: revision.revisionId,
    contentHashHead: revision.contentHash.slice(0, 19) + "…",
    parentRevisionId: revision.parentRevisionId ?? null,
    depth: index,
    isHead: revision.revisionId === headId,
    tools: revision.toolVersions.join(", ") || "no tool versions recorded",
    provenanceLine: `${revision.provenance.sourceKind} ${revision.provenance.sourceRef} @ ${revision.provenance.capturedAt}` +
      (revision.provenance.confidence !== undefined
        ? ` (confidence ${revision.provenance.confidence})`
        : ""),
    organizationLine:
      revision.organizationVersion === undefined
        ? null
        : `${revision.organizationVersion.organizationId} v${revision.organizationVersion.version}`,
  }));
}

/** The lineage summary (source → release provenance chain, one line). */
export function lineageSummaryLine(detail: LibraryArtifactDetail): string {
  if (detail.lineageNote !== null) return detail.lineageNote;
  const sources = [
    ...new Set(
      detail.revisions.map((revision) => `${revision.provenance.sourceKind}:${revision.provenance.sourceRef}`),
    ),
  ];
  return sources.length > 0 ? sources.join(" → ") : "no provenance recorded";
}

/** Export availability (honest: the content-read seam is not wired here). */
export function exportAvailability(
  backing: ScreenBacking,
  _detail: LibraryArtifactDetail,
): { available: boolean; reason: string } {
  if (backing === "fixture") {
    return {
      available: false,
      reason:
        "Export is disabled on the fixture host: artifact content reads are a real-FS blob seam that cannot execute in the browser bundle. The REAL gated content read is proven in the node battery (see the worker report).",
    };
  }
  return {
    available: false,
    reason:
      "Export is disabled: an artifact-content read/export seam is not exposed on the composition's screen surface at this SHA (the artifact fabric records are). Recorded in NEXT DEPENDENCIES.",
  };
}

/** Disabled/mutating-action reasons (every visible action honest). */
export const LIBRARY_DISABLED_REASONS = {
  deleteRevision:
    "Delete is unavailable by design: Library history is immutable — edits create revisions, history is never overwritten (the Artifact Fabric lineage law).",
} as const;
