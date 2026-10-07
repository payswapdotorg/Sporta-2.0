/**
 * sporta-artifacts — the Artifact Fabric.
 *
 * Durable, content-addressed, lineage-preserving artifact objects.
 * Workers may be ephemeral; canonical artifacts may not be. Execution
 * loss must never destroy canonical user work.
 */
import type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  ContentHash,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";

export type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  EditDeltaRecord,
} from "@sporta/contracts/contract";

/** Input for recording an artifact. `artifactId` provides idempotency. */
export interface RecordArtifactInput {
  artifactId?: SportaId;
  kind: string;
  editability: ArtifactRecord["editability"];
  policy: ArtifactRecord["policy"];
}

/** Input for committing a revision. `revisionId` provides idempotency. */
export interface CommitRevisionInput {
  artifactId: SportaId;
  revisionId?: SportaId;
  parentRevisionId?: SportaId;
  contentHash: ContentHash;
  organizationVersion?: ArtifactRevisionRecord["organizationVersion"];
  toolVersions: readonly string[];
  provenance: ProvenanceDescriptor;
  policy: ArtifactRevisionRecord["policy"];
}

/**
 * The Artifact Graph port. Revisions are immutable and append-only;
 * history is never overwritten. Lineage queries return revision order.
 */
export interface ArtifactGraphPort {
  recordArtifact(input: RecordArtifactInput): Promise<ArtifactRecord>;
  commitRevision(input: CommitRevisionInput): Promise<ArtifactRevisionRecord>;
  readRevision(revisionId: SportaId): Promise<ArtifactRevisionRecord | null>;
  lineage(artifactId: SportaId): Promise<readonly ArtifactRevisionRecord[]>;
}
