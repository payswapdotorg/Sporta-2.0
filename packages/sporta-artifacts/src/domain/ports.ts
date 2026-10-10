import type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  ContentHash,
  Iso8601,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
/**
 * sporta-artifacts ports and operational types (domain layer — pure).
 *
 * These declarations are re-exported through src/contract.ts, the single
 * public entrypoint; the shapes are the frozen v1 surface plus additive
 * Wave 1 types.
 */

/** Injectable clock; record timestamps come only from here. */
export interface ArtifactClock {
  now(): Iso8601;
}

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
  /**
   * Additive (wave 4), OPTIONAL so every existing port implementation
   * keeps compiling (the optional-deps law): the manifest read — the
   * artifact record itself. The single state owner
   * `ArtifactGraphService` provides it via its v1 additive accessor
   * (sync; `await` handles both return grades). The rights-gated read
   * seam (`ArtifactGatedReadPort`) consumes this capability; when a
   * minimal implementation omits it, gated manifest reads are a typed
   * `ArtifactReadUnavailableError`, never a silent pass.
   */
  readArtifact?(artifactId: SportaId): Promise<ArtifactRecord | null> | ArtifactRecord | null;
}

/** Hash of raw bytes (hex sha-256). Adapters provide the implementation. */
export type ArtifactContentHashFn = (content: Uint8Array) => ContentHash;

/**
 * Content-addressed blob storage. Implementations MUST verify integrity
 * on every read: stored content that does not hash back to its content
 * address is a typed `ArtifactIntegrityError`, never silent corruption.
 */
export interface ArtifactBlobStorePort {
  put(content: Uint8Array): Promise<ContentHash>;
  read(contentHash: ContentHash): Promise<Uint8Array>;
}
