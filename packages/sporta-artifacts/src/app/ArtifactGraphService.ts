import type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  Iso8601,
  SportaId,
} from "@sporta/contracts/contract";
import { LineageIntegrityError, UnknownArtifactError } from "../domain/errors.js";
import { buildLineageIndex, chainOrder, checkParent } from "../domain/lineage.js";
import type {
  ArtifactClock,
  ArtifactGraphPort,
  CommitRevisionInput,
  RecordArtifactInput,
} from "../domain/ports.js";
/**
 * ArtifactGraphService — the in-memory Artifact Fabric (fixture-grade).
 *
 * The single owner of artifact identity and revision lineage. Revisions
 * are immutable and append-only; retries are idempotent; validation
 * always precedes mutation (see SPEC.md).
 */

const REFUSAL_MESSAGES: Record<string, string> = {
  "artifact-has-revisions":
    "parentRevisionId is required for a non-first revision (lineage is a chain)",
  "parent-not-found": "parentRevisionId does not reference an existing revision",
  "parent-foreign-artifact": "parentRevisionId belongs to a different artifact",
  "parent-already-has-child":
    "parent revision already has a child revision (lineage forks are refused)",
};

export class ArtifactGraphService implements ArtifactGraphPort {
  private readonly clock: ArtifactClock;
  private readonly artifacts = new Map<SportaId, ArtifactRecord>();
  private readonly revisions = new Map<SportaId, ArtifactRevisionRecord>();
  private readonly committedAtLedger = new Map<SportaId, Iso8601>();
  private nextSequence = 0;

  constructor(clock: ArtifactClock) {
    this.clock = clock;
  }

  async recordArtifact(input: RecordArtifactInput): Promise<ArtifactRecord> {
    const artifactId = input.artifactId ?? this.mintId("art");
    const existing = this.artifacts.get(artifactId);
    if (existing !== undefined) return existing; // idempotent: first write wins
    const record: ArtifactRecord = {
      artifactId,
      kind: input.kind,
      editability: input.editability,
      policy: input.policy,
    };
    this.artifacts.set(artifactId, record);
    return record;
  }

  async commitRevision(input: CommitRevisionInput): Promise<ArtifactRevisionRecord> {
    const revisionId = input.revisionId ?? this.mintId("rev");
    const existing = this.revisions.get(revisionId);
    if (existing !== undefined) return existing; // idempotent: first write wins

    if (!this.artifacts.has(input.artifactId)) {
      throw new UnknownArtifactError(
        `cannot commit a revision for an unknown artifact ${input.artifactId}`,
        input.artifactId,
      );
    }
    const index = buildLineageIndex(input.artifactId, this.listAllRevisions());
    const check = checkParent(index, input.artifactId, input.parentRevisionId);
    if (!check.ok) {
      throw new LineageIntegrityError(
        REFUSAL_MESSAGES[check.reason] ?? "lineage integrity violation",
        check.reason,
      );
    }

    const record: ArtifactRevisionRecord = {
      revisionId,
      artifactId: input.artifactId,
      ...(input.parentRevisionId !== undefined ? { parentRevisionId: input.parentRevisionId } : {}),
      contentHash: input.contentHash,
      ...(input.organizationVersion !== undefined
        ? { organizationVersion: input.organizationVersion }
        : {}),
      toolVersions: [...input.toolVersions],
      provenance: input.provenance,
      policy: input.policy,
    };
    this.revisions.set(revisionId, record);
    this.committedAtLedger.set(revisionId, this.clock.now());
    return record;
  }

  async readRevision(revisionId: SportaId): Promise<ArtifactRevisionRecord | null> {
    return this.revisions.get(revisionId) ?? null;
  }

  async lineage(artifactId: SportaId): Promise<readonly ArtifactRevisionRecord[]> {
    if (!this.artifacts.has(artifactId)) return [];
    return chainOrder(buildLineageIndex(artifactId, this.listAllRevisions()));
  }

  /** Additive accessor: when a revision was committed (injected clock). */
  committedAt(revisionId: SportaId): Iso8601 | null {
    return this.committedAtLedger.get(revisionId) ?? null;
  }

  /** Additive accessor: an artifact record by id (or null). */
  readArtifact(artifactId: SportaId): ArtifactRecord | null {
    return this.artifacts.get(artifactId) ?? null;
  }

  private listAllRevisions(): ArtifactRevisionRecord[] {
    return [...this.revisions.values()];
  }

  private mintId(prefix: string): SportaId {
    this.nextSequence += 1;
    return `${prefix}:${this.nextSequence}`;
  }
}
