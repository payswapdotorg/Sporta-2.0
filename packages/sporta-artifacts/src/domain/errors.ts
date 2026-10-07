import type { SportaId } from "@sporta/contracts/contract";
/**
 * Typed sporta-artifacts errors (domain layer — pure, no IO).
 *
 * Integrity failures are always typed errors, never silent corruption.
 */

/** Base class for all typed sporta-artifacts errors. */
export class ArtifactError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** Parent-chain integrity violation (see SPEC.md for the four cases). */
export class LineageIntegrityError extends ArtifactError {
  /** The refusal reason code, e.g. "parent-not-found". */
  readonly reason:
    | "artifact-has-revisions"
    | "parent-not-found"
    | "parent-foreign-artifact"
    | "parent-already-has-child";

  constructor(message: string, reason: string) {
    super(message, reason);
    this.reason = reason as LineageIntegrityError["reason"];
  }
}

/** A revision was committed for an artifact that was never recorded. */
export class UnknownArtifactError extends ArtifactError {
  readonly artifactId: SportaId;

  constructor(message: string, artifactId: string) {
    super(message, `unknown-artifact:${artifactId}`);
    this.artifactId = artifactId;
  }
}

/** Stored content does not hash to its content address. */
export class ArtifactIntegrityError extends ArtifactError {
  constructor(message: string, contentHash: string) {
    super(message, `integrity:${contentHash}`);
  }
}

/** Requested content hash is not present in the blob store. */
export class ArtifactBlobNotFoundError extends ArtifactError {
  constructor(message: string, contentHash: string) {
    super(message, `blob-not-found:${contentHash}`);
  }
}
