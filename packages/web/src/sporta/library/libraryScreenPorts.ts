/**
 * Library screen ports (W11C — SCREEN-PORTS.md: "artifact revisions +
 * lineage: the artifact fabric reads through the existing ports |
 * `@sporta/artifacts/contract`").
 *
 * TYPE-ONLY module. The shapes are STRUCTURAL MIRRORS of the frozen
 * `ArtifactRecord` / `ArtifactRevisionRecord` / `ProvenanceDescriptor`
 * records (the marketplaceViews.ts mirror precedent) so the REAL
 * ArtifactGraphService records satisfy them without this lane importing
 * the artifact implementation modules. Compat is proven in the node
 * battery by projecting REAL committed revisions through the views.
 *
 * State-owner law: the lane owns NO artifact store; immutable history
 * is never collapsed into an overwritable file list (the product UI
 * contract's Library law). An artifact-content/export read seam on the
 * composition is NEXT DEPENDENCIES.
 */
import type { ScreenBacking } from "../marketplace/marketplaceScreenPorts.js";

/** Structural mirror of ProvenanceDescriptor (the fields the screen shows). */
export interface LibraryProvenanceShape {
  sourceKind: string;
  sourceRef: string;
  capturedAt: string;
  confidence?: number;
}

/** Structural mirror of ArtifactRecord. */
export interface LibraryArtifactShape {
  artifactId: string;
  kind: string;
  editability: "editable" | "derived-only" | "opaque";
}

/** Structural mirror of ArtifactRevisionRecord. */
export interface LibraryRevisionShape {
  revisionId: string;
  artifactId: string;
  parentRevisionId?: string;
  contentHash: string;
  organizationVersion?: { organizationId: string; version: number };
  toolVersions: readonly string[];
  provenance: LibraryProvenanceShape;
}

/** One artifact with its full immutable revision lineage. */
export interface LibraryArtifactDetail {
  artifact: LibraryArtifactShape;
  /** Revisions in lineage order (root first — history is preserved). */
  revisions: readonly LibraryRevisionShape[];
  /** The run/pipeline references the provenance carries (lineage). */
  lineageNote: string | null;
}

/**
 * The library screen port (screen id "library"). An artifact-read seam
 * on the composition does not exist at this SHA — the adapter surfaces
 * the typed refusal; the fixture host carries demo records; the node
 * battery projects REAL ArtifactGraphService records through the views.
 */
export interface LibraryScreenPort {
  readonly backing: ScreenBacking;
  /** Artifact summaries (editable/derived-only/opaque shown honestly). */
  listArtifacts(): Promise<readonly LibraryArtifactShape[]>;
  /** Full revision lineage for one artifact (typed errors propagate). */
  readArtifact(artifactId: string): Promise<LibraryArtifactDetail>;
}
