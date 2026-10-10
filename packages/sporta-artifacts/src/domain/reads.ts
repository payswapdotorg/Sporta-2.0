import type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  Iso8601,
  RetentionPolicy,
  RightsScope,
  SportaId,
} from "@sporta/contracts/contract";
import type { ArtifactBlobStorePort, ArtifactClock, ArtifactGraphPort } from "./ports.js";
import { ArtifactReadQueryError } from "./errors.js";
/**
 * Wave-4 artifact-plane rights-gated reads (domain layer — pure).
 *
 * Implements the TL-serialized wave-4 decision
 * (docs/architecture/adr-wave4-c6-host.md, decision 1): the artifact
 * read seam gains an OPTIONAL caller-declared usage context mirroring
 * the ratified W3-B `EditorSessionHistoryUsageContext` pattern
 * (`packages/sporta-editors/src/domain/history.ts`); a bare input
 * declares no usages and the gate is FAIL-CLOSED. Retention propagates
 * exactly as `@sporta/policy` defines it (decision 2): the
 * `RetentionPolicy` vocabulary — `disposition` retain/archive/purge and
 * `retainUntil` ("ISO-8601 date after which the disposition applies") —
 * is CONSUMED here, never extended.
 *
 * Surface law (the W3-B page-vs-scan tradeoff, mirrored for artifacts):
 * - DIRECT read surfaces (`readRevision`, `readArtifact`,
 *   `readRevisionContent`) refuse prohibited reads with TYPED errors —
 *   never silent filtering where a direct read is requested. Honest
 *   `null` is reserved for genuinely unknown ids.
 * - LISTING surfaces (`lineage`) exclude prohibited/expired revisions
 *   (honest absence, never an error) — the chain may therefore show
 *   gaps: a returned `parentRevisionId` may reference a revision the
 *   caller was not permitted to see.
 * - The frozen v1 port surfaces (`ArtifactGraphPort.readRevision`/
 *   `lineage`, `ArtifactBlobStorePort.read`) are the internal storage
 *   plumbing and stay UNCHANGED (the additive law: existing wiring
 *   compiles and behaves identically). Rights enforcement lands at this
 *   wave-4 read seam; product planes consume the gated seam.
 */

/** Default page size for a gated lineage read (bounded-query law). */
export const ARTIFACT_LINEAGE_DEFAULT_LIMIT = 50;

/** Hard ceiling on any single gated lineage read, explicit limit included. */
export const ARTIFACT_LINEAGE_MAX_LIMIT = 500;

/**
 * The caller's usage context for an artifact-plane rights-gated read
 * (invariant 22 — rights propagate through artifacts). Usage classes
 * mirror the `RightsScope.usages`/`prohibitions` vocabulary. Per-package
 * duplication of the W3-B type is the ratified wave-4 ownership law
 * (no new shared contracts type).
 */
export interface ArtifactReadUsageContext {
  /** Usage classes the caller is permitted to exercise. */
  readonly usages: readonly string[];
}

/** Input for the gated revision (direct) read. */
export interface ReadRevisionInput {
  readonly revisionId: SportaId;
  /**
   * Caller's usage context. A direct read whose usage context is absent,
   * empty, not permitted, or prohibited is a TYPED refusal.
   */
  readonly usage?: ArtifactReadUsageContext;
}

/** Input for the gated artifact-record (manifest) read. */
export interface ReadArtifactInput {
  readonly artifactId: SportaId;
  /** Caller's usage context — same fail-closed law as revision reads. */
  readonly usage?: ArtifactReadUsageContext;
}

/** Input for the gated lineage (listing) read. */
export interface ReadLineageInput {
  readonly artifactId: SportaId;
  /**
   * Caller's usage context. Prohibited/expired revisions are simply NOT
   * returned (honest absence, never an error); a bare context lists
   * nothing.
   */
  readonly usage?: ArtifactReadUsageContext;
  /** Optional result bound: default 50, hard-capped at 500. */
  readonly limit?: number;
}

/** Input for the gated revision-content (blob) read. */
export interface ReadRevisionContentInput {
  readonly revisionId: SportaId;
  /**
   * Caller's usage context. Content-addressed blobs carry no PolicySet;
   * the rights boundary for content is the REVISION record that
   * references the content hash — this gate runs BEFORE any storage
   * touch.
   */
  readonly usage?: ArtifactReadUsageContext;
}

/**
 * The rights-gated artifact read seam. Implementations MUST gate every
 * method on the record's `PolicySet` (rights first, then retention) —
 * see `ArtifactGatedReadService` (app layer) for the composition.
 */
export interface ArtifactGatedReadPort {
  /** Direct revision read: honest `null` for unknown ids, typed refusals otherwise. */
  readRevision(input: ReadRevisionInput): Promise<ArtifactRevisionRecord | null>;
  /** Direct artifact-record (manifest) read: honest `null` for unknown ids. */
  readArtifact(input: ReadArtifactInput): Promise<ArtifactRecord | null>;
  /** Bounded lineage listing: honest absence for prohibited/expired revisions. */
  lineage(input: ReadLineageInput): Promise<readonly ArtifactRevisionRecord[]>;
  /**
   * Direct revision-content read: the revision's PolicySet gates the
   * blob read (gate precedes storage). Honest `null` for unknown
   * revision ids; blob integrity failures propagate as the store's
   * typed errors.
   */
  readRevisionContent(input: ReadRevisionContentInput): Promise<Uint8Array | null>;
}

/** Constructor wiring for ArtifactGatedReadService. */
export interface ArtifactGatedReadDeps {
  /** The artifact graph behind the seam (the frozen v1 port, unchanged). */
  readonly graph: ArtifactGraphPort;
  /**
   * OPTIONAL blob store: present ⇒ gated revision-content reads are
   * served (real bytes, read-time integrity verified); absent ⇒ content
   * reads are a typed `ArtifactReadUnavailableError` (graceful
   * degradation, never a silent pass).
   */
  readonly blobs?: ArtifactBlobStorePort;
  /** The clock retention expiry is measured against (injected, never ambient). */
  readonly clock: ArtifactClock;
}

/**
 * Resolve a lineage limit into a positive page bound: default 50 when
 * absent, hard-capped at 500, malformed values refused with a typed
 * error (a bounded seam never guesses what a non-positive bound meant).
 */
export function resolveArtifactLineageLimit(limit?: number): number {
  if (limit === undefined) return ARTIFACT_LINEAGE_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ArtifactReadQueryError(
      `limit must be a positive integer, got ${String(limit)}`,
      String(limit),
    );
  }
  return Math.min(limit, ARTIFACT_LINEAGE_MAX_LIMIT);
}

/**
 * Invariant-22 read gate (the W3-B `sessionVisibleToUsage` law,
 * mirrored for artifact-plane records): may a record be surfaced to a
 * caller whose usage context is `usage`?
 *
 * Law (fail-closed): a record is visible iff AT LEAST ONE declared
 * usage is affirmatively permitted by the record's `PolicySet.rights`
 * AND NO declared usage is prohibited. A missing or empty usage context
 * is NEVER visible — the gate cannot affirm any permission. Holders
 * are not evaluated here: the seam gates on usage classes only;
 * holder-bound authorization is a policy-domain concern above this
 * port.
 */
export function artifactVisibleToUsage(
  rights: RightsScope,
  usage?: ArtifactReadUsageContext,
): boolean {
  if (usage === undefined || usage.usages.length === 0) return false;
  const permitted = usage.usages.some((candidate) => rights.usages.includes(candidate));
  const prohibited = usage.usages.some((candidate) => rights.prohibitions.includes(candidate));
  return permitted && !prohibited;
}

/**
 * Retention law (wave-4 decision 2 — typed exactly by the
 * `@sporta/policy` vocabulary, never extended): has a record's purge
 * decision become effective as of `now`?
 *
 * - `retain`/`archive` dispositions never expire at the read boundary:
 *   the policy vocabulary types no read refusal for them (archive is a
 *   storage-tier decision, not a read prohibition).
 * - `purge` expires once `retainUntil` — "ISO-8601 date AFTER WHICH
 *   the disposition applies" — is strictly in the past. At the exact
 *   boundary instant the disposition has not yet applied.
 * - FAIL-CLOSED: a purge decision with no `retainUntil` (no deferral
 *   date the seam could affirm) or with an unparseable one is treated
 *   as already effective — a read seam must not resurrect content the
 *   policy says to purge on a technicality.
 * - `retainRuns` (run-count retention) is carried verbatim but NOT
 *   evaluated: this plane owns no run ledger, so an honest run count
 *   does not exist here (typed in the wave-4 NEXT DEPENDENCIES).
 */
export function artifactRetentionExpired(retention: RetentionPolicy, now: Iso8601): boolean {
  if (retention.disposition !== "purge") return false;
  if (retention.retainUntil === undefined) return true;
  const boundary = Date.parse(retention.retainUntil);
  const current = Date.parse(now);
  if (Number.isNaN(boundary) || Number.isNaN(current)) return true;
  return current > boundary;
}
