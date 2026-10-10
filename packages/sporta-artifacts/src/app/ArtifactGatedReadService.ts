import type { ArtifactRecord, ArtifactRevisionRecord, PolicySet } from "@sporta/contracts/contract";
import {
  ArtifactReadUnavailableError,
  ArtifactRetentionExpiredError,
  ArtifactRightsRefusalError,
} from "../domain/errors.js";
import {
  artifactRetentionExpired,
  artifactVisibleToUsage,
  resolveArtifactLineageLimit,
} from "../domain/reads.js";
import type {
  ArtifactGatedReadDeps,
  ArtifactGatedReadPort,
  ArtifactReadUsageContext,
  ReadArtifactInput,
  ReadLineageInput,
  ReadRevisionContentInput,
  ReadRevisionInput,
} from "../domain/reads.js";
/**
 * ArtifactGatedReadService — the wave-4 rights-gated artifact read seam
 * (app layer; ADR: docs/architecture/adr-wave4-c6-host.md, decision 1).
 *
 * Composes the frozen `ArtifactGraphPort` (record/revision/lineage
 * reads, unchanged) with an OPTIONAL `ArtifactBlobStorePort` (content
 * reads) behind the invariant-22 gate: every read is gated on the
 * RECORD's `PolicySet` — rights first (fail-closed on a bare, empty,
 * non-permitted or prohibited usage context), then retention (a purge
 * disposition past its date never resurrects).
 *
 * Surface law (documented in SPEC.md, Wave 4):
 * - DIRECT reads (revision / artifact-record / content) REFUSE with
 *   typed errors; `null` is reserved for genuinely unknown ids.
 * - The lineage LISTING excludes prohibited/expired revisions (honest
 *   absence, never an error); the chain may show gaps.
 * - The gate runs BEFORE any storage touch: a prohibited content read
 *   never reaches the blob store.
 */
export class ArtifactGatedReadService implements ArtifactGatedReadPort {
  private readonly deps: ArtifactGatedReadDeps;

  constructor(deps: ArtifactGatedReadDeps) {
    this.deps = deps;
  }

  async readRevision(input: ReadRevisionInput): Promise<ArtifactRevisionRecord | null> {
    const revision = await this.deps.graph.readRevision(input.revisionId);
    if (revision === null) return null; // honest null: unknown revision id
    this.assertReadable("revision", input.revisionId, revision.policy, input.usage);
    return revision;
  }

  async readArtifact(input: ReadArtifactInput): Promise<ArtifactRecord | null> {
    const readArtifact = this.deps.graph.readArtifact;
    if (readArtifact === undefined) {
      throw new ArtifactReadUnavailableError(
        "the artifact-record (manifest) read capability is not wired into this gated read seam",
        "manifest",
      );
    }
    const record = await readArtifact.call(this.deps.graph, input.artifactId);
    if (record === null) return null; // honest null: unknown artifact id
    this.assertReadable("artifact", input.artifactId, record.policy, input.usage);
    return record;
  }

  async lineage(input: ReadLineageInput): Promise<readonly ArtifactRevisionRecord[]> {
    const limit = resolveArtifactLineageLimit(input.limit);
    const chain = await this.deps.graph.lineage(input.artifactId);
    // The bound applies to the chain window (head-anchored: the newest
    // revisions are kept); the rights/retention gate then filters that
    // window, so a result MAY be shorter than the limit when prohibited
    // revisions occupy early window slots — the documented W3-B
    // page-vs-scan tradeoff, mirrored. Callers needing older visible
    // revisions raise the limit (capped at 500).
    const window = chain.slice(-limit);
    return window.filter((revision) => this.listable(revision, input.usage));
  }

  async readRevisionContent(input: ReadRevisionContentInput): Promise<Uint8Array | null> {
    const revision = await this.deps.graph.readRevision(input.revisionId);
    if (revision === null) return null; // honest null: unknown revision id
    // The gate precedes the storage touch: a prohibited or expired
    // content read NEVER reaches the blob store.
    this.assertReadable("revision", input.revisionId, revision.policy, input.usage);
    if (this.deps.blobs === undefined) {
      throw new ArtifactReadUnavailableError(
        "no blob store is wired into this gated read seam; revision content cannot be read",
        "content",
      );
    }
    // The content hash is trusted plumbing: read-time integrity
    // verification stays the store's law (typed errors propagate).
    return this.deps.blobs.read(revision.contentHash);
  }

  /** Direct-read law: rights first, then retention — both typed refusals. */
  private assertReadable(
    target: "artifact" | "revision",
    targetId: string,
    policy: PolicySet,
    usage?: ArtifactReadUsageContext,
  ): void {
    if (!artifactVisibleToUsage(policy.rights, usage)) {
      throw new ArtifactRightsRefusalError(
        `policy rights refuse this ${target} read (fail-closed: bare, empty, non-permitted or prohibited usage context)`,
        target,
        targetId,
      );
    }
    if (artifactRetentionExpired(policy.retention, this.deps.clock.now())) {
      throw new ArtifactRetentionExpiredError(
        `the ${target}'s retention policy has become effective (purge past its date); the read boundary does not resurrect purged content`,
        target,
        targetId,
      );
    }
  }

  /** Listing law: honest absence for prohibited or retention-expired revisions. */
  private listable(revision: ArtifactRevisionRecord, usage?: ArtifactReadUsageContext): boolean {
    return (
      artifactVisibleToUsage(revision.policy.rights, usage) &&
      !artifactRetentionExpired(revision.policy.retention, this.deps.clock.now())
    );
  }
}
