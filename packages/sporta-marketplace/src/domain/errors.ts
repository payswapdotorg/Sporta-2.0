/**
 * Typed sporta-marketplace errors (domain — pure).
 *
 * The compute-fallback precedent law: every failure is a typed record
 * with a machine-readable refusal kind — never stringly, never a silent
 * default, never a fabricated success. One error family per aggregate;
 * `refusalKind` is the stable, auditable vocabulary used by tests and
 * logs.
 */
import type {
  TransformCandidateLifecycleState,
  TransformListingState,
} from "@sporta/marketplace/contract";

/** Base class for all typed sporta-marketplace errors. */
export class MarketplaceError extends Error {
  /** Machine-readable refusal kind (stable vocabulary). */
  readonly refusalKind: string;

  constructor(message: string, refusalKind: string) {
    super(message);
    this.name = new.target.name;
    this.refusalKind = refusalKind;
  }
}

/** Illegal candidate-lifecycle transition (explicit table, never ambient). */
export class TransformLifecycleError extends MarketplaceError {
  readonly from: TransformCandidateLifecycleState | TransformListingState;
  readonly to: TransformCandidateLifecycleState | TransformListingState;

  constructor(
    message: string,
    from: TransformCandidateLifecycleState | TransformListingState,
    to: TransformCandidateLifecycleState | TransformListingState,
  ) {
    super(message, `lifecycle:${from}->${to}`);
    this.from = from;
    this.to = to;
  }
}

/**
 * A SUBMITTED+ candidate was mutated, or a different digest was
 * submitted for an already-frozen (pipeline, version) (P9-09: the
 * changed candidate must be a NEW candidate at a NEW version).
 */
export class TransformCandidateImmutableError extends MarketplaceError {
  readonly candidateId: string;
  readonly frozenDigest: string | null;
  readonly observedDigest: string | null;

  constructor(
    message: string,
    candidateId: string,
    frozenDigest: string | null,
    observedDigest: string | null = null,
  ) {
    super(message, `candidate-immutable:${candidateId}`);
    this.candidateId = candidateId;
    this.frozenDigest = frozenDigest;
    this.observedDigest = observedDigest;
  }
}

/** The automated check lane refuses advancement (gate failure). */
export class TransformCheckLaneError extends MarketplaceError {
  readonly failedCheckIds: readonly string[];

  constructor(message: string, failedCheckIds: readonly string[]) {
    super(message, `automated-gate-failed:${failedCheckIds.join("+")}`);
    this.failedCheckIds = failedCheckIds;
  }
}

/** Human review decision refused (typed reasons below). */
export class TransformReviewError extends MarketplaceError {
  constructor(message: string, refusalKind: string) {
    super(message, `review:${refusalKind}`);
  }
}

/** Listing operation refused (typed reasons below). */
export class TransformListingError extends MarketplaceError {
  constructor(message: string, refusalKind: string) {
    super(message, `listing:${refusalKind}`);
  }
}

/** Decision digest does not byte-equal the frozen candidate digest. */
export class TransformReleaseDigestMismatchError extends MarketplaceError {
  readonly decisionId: string;
  readonly candidateDigest: string;
  readonly decisionDigest: string;

  constructor(
    message: string,
    decisionId: string,
    candidateDigest: string,
    decisionDigest: string,
  ) {
    super(message, "release-digest-mismatch");
    this.decisionId = decisionId;
    this.candidateDigest = candidateDigest;
    this.decisionDigest = decisionDigest;
  }
}

/** A version at or below the current release was offered for publish (P9-09). */
export class TransformVersionRegressionError extends MarketplaceError {
  readonly listingId: string;
  readonly currentVersion: string;
  readonly offeredVersion: string;

  constructor(message: string, listingId: string, currentVersion: string, offeredVersion: string) {
    super(message, "version-regression");
    this.listingId = listingId;
    this.currentVersion = currentVersion;
    this.offeredVersion = offeredVersion;
  }
}

/** Settlement refused — NO entitlement is issued (P9-11). */
export class TransformSettlementRefusedError extends MarketplaceError {
  readonly settlementId: string | null;
  readonly idempotencyKey: string;

  constructor(message: string, idempotencyKey: string, settlementId: string | null = null) {
    super(message, "settlement-refused");
    this.idempotencyKey = idempotencyKey;
    this.settlementId = settlementId;
  }
}

/** The manifest read port could not resolve the pinned manifest. */
export class TransformManifestUnresolvedError extends MarketplaceError {
  readonly pipelineId: string;
  readonly version: string;
  readonly manifestDigest: string;

  constructor(message: string, pipelineId: string, version: string, manifestDigest: string) {
    super(message, `manifest-unresolved:${pipelineId}:${version}`);
    this.pipelineId = pipelineId;
    this.version = version;
    this.manifestDigest = manifestDigest;
  }
}

/** Unknown record id (stores keep honest nulls, services refuse typed). */
export class TransformUnknownRecordError extends MarketplaceError {
  constructor(message: string, recordKind: string, recordId: string) {
    super(message, `unknown-${recordKind}:${recordId}`);
  }
}
