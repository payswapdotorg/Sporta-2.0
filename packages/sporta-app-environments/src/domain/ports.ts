/**
 * W9C — sporta-app-environments ports (domain layer — pure declarations).
 *
 * Every IO seam is an injected port, the sporta-work/marketplace precedent:
 * clocks, hashing, per-record stores, the app-target state read, and the
 * EXISTING boundaries this module composes THROUGH and never around —
 * `AgentRuntimeExecutionPort` / `WorkGraphPort` / `WorkGraphRefsPort` come
 * from @sporta/work (the ZCode substrate; there is no second runtime, lock
 * 37), and the artifact-revision seam is declared here as a minimal
 * structural port satisfied by the existing ArtifactGraphService (this
 * package declares no artifact authority of its own).
 *
 * No IO lives in this file — declarations only.
 */
import type {
  ArtifactRevisionRecord,
  ContentHash,
  Iso8601,
  PolicySet,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type {
  AgentRuntimeExecutionPort,
  WorkGraphPort,
  WorkGraphRefsPort,
} from "@sporta/work/contract";
import type {
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
} from "@sporta/app-environments/contract";

export type {
  AgentRuntimeExecutionPort,
  StartAgentRunInput,
  AgentRunHandle,
  AgentRunEvent,
  WorkGraphPort,
  WorkGraphRefsPort,
} from "@sporta/work/contract";

/** Injectable clock — record timestamps never use ambient time. */
export interface AppEnvironmentClock {
  now(): Iso8601;
}

/** Injectable hashing (adapters wrap node:crypto). */
export interface AppEnvironmentHashPort {
  /** sha256 over text (utf8), `sha256:<64 hex>`. */
  text(value: string): ContentHash;
  /** sha256 over a stable-stringified value (canonical JSON). */
  stable(value: unknown): ContentHash;
}

/** Descriptor store (registration + reads). */
export interface ApplicationDescriptorStorePort {
  save(descriptor: ApplicationEnvironmentDescriptor): void;
  byDescriptorId(descriptorId: SportaId): ApplicationEnvironmentDescriptor | null;
  byApplicationId(applicationId: SportaId): ApplicationEnvironmentDescriptor | null;
  list(): readonly ApplicationEnvironmentDescriptor[];
}

/** Attachment store (scoped grant records). */
export interface ApplicationAttachmentStorePort {
  save(attachment: ApplicationAttachment): void;
  byAttachmentId(attachmentId: SportaId): ApplicationAttachment | null;
  listByApplication(applicationId: SportaId): readonly ApplicationAttachment[];
}

/** Session store (bounded interaction sessions). */
export interface ApplicationSessionStorePort {
  save(session: ApplicationSession): void;
  bySessionId(sessionId: SportaId): ApplicationSession | null;
  listByAttachment(attachmentId: SportaId): readonly ApplicationSession[];
}

/** Append-only action audit store (immutable records, idempotent appends). */
export interface ApplicationActionAuditStorePort {
  append(record: ApplicationActionRecord): void;
  byActionRecordId(actionRecordId: SportaId): ApplicationActionRecord | null;
  listBySession(sessionId: SportaId): readonly ApplicationActionRecord[];
}

/**
 * The app-target state seam — the ADAPTER owns the real IO of reading the
 * attached application's observable state (real local files for a local
 * app). Observation only: reading never mutates the app (the app owns its
 * internal state — contract law 10). Unreadable state surfaces as the
 * typed `ApplicationTargetStateError`, never as empty evidence.
 */
export interface ApplicationTargetStatePort {
  /** Read the target's observable state: digest + structured observations. */
  readTargetState(targetIdentity: string): Promise<ApplicationTargetStateSnapshot>;
  /**
   * The real workspace path the agent acts on for this target (included in
   * the agent task directive so the real zcode-cli can use its file/
   * terminal tools; null when the target kind has no local path).
   */
  targetWorkspacePath(targetIdentity: string): string | null;
}

/** One honest observation of an attached app's state (REAL evidence). */
export interface ApplicationTargetStateSnapshot {
  /** Content digest of the real state bytes (sha256 through the hash port). */
  stateDigest: ContentHash;
  /** Structured observations (kind + detail) — effect evidence basis. */
  observations: readonly { kind: string; detail: string }[];
}

/**
 * The artifact-revision seam — a minimal structural port SATISFIED BY the
 * existing `ArtifactGraphService` (@sporta/artifacts). This package
 * declares the port; the composition root injects the real service. No
 * second artifact authority, no blob store of our own.
 */
export interface ApplicationArtifactRevisionPort {
  recordArtifact(input: {
    artifactId?: SportaId;
    kind: string;
    editability: "editable" | "derived-only" | "opaque";
    policy: PolicySet;
  }): Promise<{ artifactId: SportaId }>;
  commitRevision(input: {
    artifactId: SportaId;
    revisionId?: SportaId;
    parentRevisionId?: SportaId;
    contentHash: ContentHash;
    toolVersions: readonly string[];
    provenance: ProvenanceDescriptor;
    policy: PolicySet;
  }): Promise<ArtifactRevisionRecord>;
  lineage(artifactId: SportaId): Promise<readonly ArtifactRevisionRecord[]>;
}

/**
 * Constructor bundle for the app-action service: every external boundary
 * injected. `agentRuntime` is the EXISTING ZCode AgentRuntime execution
 * seam (@sporta/work) — the only process spawn path in this module.
 */
export interface AppActionBoundaryPorts {
  /** The existing ZCode agent/tool path (spawn via the work adapter). */
  agentRuntime: AgentRuntimeExecutionPort;
  /** App-target observation (real adapter IO). */
  targets: ApplicationTargetStatePort;
  /** WorkGraph append seam (existing @sporta/work service). */
  workGraphs: WorkGraphPort;
  /** WorkGraph artifact-revision ref seam (existing @sporta/work service). */
  workGraphRefs: WorkGraphRefsPort;
  /** Artifact Fabric revision seam (existing @sporta/artifacts service). */
  artifactRevisions: ApplicationArtifactRevisionPort;
}
