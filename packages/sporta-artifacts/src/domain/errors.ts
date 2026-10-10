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

/** What kind of gated read surface refused (invariant 22, wave 4). */
export type ArtifactReadTarget = "artifact" | "revision";

/**
 * A rights-gated DIRECT read was refused (invariant 22 — rights
 * propagate through the artifact plane; this is the wave-4 read gate).
 * Listings never throw this — they exclude prohibited records with
 * honest absence instead. A bare, empty, non-permitted or prohibited
 * usage context fails closed into this refusal.
 */
export class ArtifactRightsRefusalError extends ArtifactError {
  readonly target: ArtifactReadTarget;
  readonly targetId: SportaId;

  constructor(message: string, target: string, targetId: string) {
    super(message, `rights-refused:${target}:${targetId}`);
    this.target = target as ArtifactReadTarget;
    this.targetId = targetId;
  }
}

/**
 * A gated read was refused because the record's retention policy has
 * become effective: a `purge` disposition past its `retainUntil` (or
 * with no affirmable deferral date). The read boundary never resurrects
 * content the policy says to purge.
 */
export class ArtifactRetentionExpiredError extends ArtifactError {
  readonly target: ArtifactReadTarget;
  readonly targetId: SportaId;

  constructor(message: string, target: string, targetId: string) {
    super(message, `retention-expired:${target}:${targetId}`);
    this.target = target as ArtifactReadTarget;
    this.targetId = targetId;
  }
}

/** A gated lineage query is malformed (e.g. a non-positive limit). */
export class ArtifactReadQueryError extends ArtifactError {
  constructor(message: string, detail: string) {
    super(message, `read-query:${detail}`);
  }
}

/** Which gated read capability was not wired into the seam. */
export type ArtifactReadCapability = "manifest" | "content";

/**
 * A gated read was refused because the capability it needs is not
 * wired (no blob store for content reads, no manifest-read capability
 * on the graph). Typed and honest — never a silent pass.
 */
export class ArtifactReadUnavailableError extends ArtifactError {
  readonly capability: ArtifactReadCapability;

  constructor(message: string, capability: string) {
    super(message, `read-unavailable:${capability}`);
    this.capability = capability as ArtifactReadCapability;
  }
}
