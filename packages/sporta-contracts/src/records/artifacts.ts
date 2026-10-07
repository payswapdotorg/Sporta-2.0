import type { SportaId, Iso8601, ContentHash, ProvenanceDescriptor } from "./primitives.js";
/**
 * Artifact & Editor records — Artifact, immutable revisions, EditDelta, EditorSession.
 */
import type { PolicySet } from "@sporta/policy/contract";

/** Durable, content-addressed work-product reference. */
export interface ArtifactRecord {
  artifactId: SportaId;
  kind: string;
  editability: "editable" | "derived-only" | "opaque";
  policy: PolicySet;
}

/** Immutable revision with lineage. Edits create revisions; history is preserved. */
export interface ArtifactRevisionRecord {
  revisionId: SportaId;
  artifactId: SportaId;
  parentRevisionId?: SportaId;
  contentHash: ContentHash;
  organizationVersion?: { organizationId: SportaId; version: number };
  toolVersions: readonly string[];
  provenance: ProvenanceDescriptor;
  policy: PolicySet;
}

/** Machine-readable difference between two revisions. */
export interface EditDeltaRecord {
  deltaId: SportaId;
  fromRevisionId: SportaId;
  toRevisionId: SportaId;
  editor: string;
  editorVersion: string;
  operations: readonly string[];
  provenance: ProvenanceDescriptor;
}

/** A bounded editing session (local, remote, embedded or external). */
export interface EditorSessionRecord {
  editorSessionId: SportaId;
  editorId: string;
  revisionId: SportaId;
  mode: "local" | "remote" | "embedded" | "external";
  /** 1 = export, 2 = round-trip, 3 = live/shared session. */
  integrationLevel: 1 | 2 | 3;
  openedAt: Iso8601;
  closedAt?: Iso8601;
  policy: PolicySet;
}
