/**
 * sporta-app-environments ports (domain layer — pure declarations,
 * the sporta-work domain/ports.ts precedent).
 *
 * Every IO seam is an injected port: clocks, hashing, per-record
 * stores, the capability-invocation seam (the generic tool boundary
 * the ZCode agent path uses — like browser/terminal, never a second
 * runtime) and the verified-effect reconciliation sink (Artifact
 * Fabric + WorkGraph lineage, reached STRUCTURALLY so this module
 * never imports the fabric package — the architecture policy keeps
 * this module on contracts/work/policy only).
 *
 * No IO lives in this file — declarations only.
 */
import type {
  ContentHash,
  Iso8601,
  PolicySet,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type {
  ApplicationActionRecord,
  ApplicationCapability,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
  ApplicationAttachment,
} from "@sporta/app-environments/contract";

/** Injectable clock — record timestamps never use ambient time. */
export interface AppEnvironmentClock {
  now(): Iso8601;
}

/** Injectable hashing (adapters wrap node:crypto sha256). */
export interface AppEnvironmentHashPort {
  /** sha256 over utf8 text, `sha256:<64 hex>`. */
  text(value: string): ContentHash;
  /** sha256 over a stable-stringified value (canonical JSON). */
  stable(value: unknown): ContentHash;
}

/** Descriptor store (registry entries by descriptor id). */
export interface ApplicationDescriptorStorePort {
  save(descriptor: ApplicationEnvironmentDescriptor): void;
  byId(descriptorId: SportaId): ApplicationEnvironmentDescriptor | null;
  /** Latest registered descriptor for one application identity. */
  byApplication(applicationId: SportaId): ApplicationEnvironmentDescriptor | null;
  all(): readonly ApplicationEnvironmentDescriptor[];
}

/** Attachment store (scoped user grants; updated by the owning service only). */
export interface ApplicationAttachmentStorePort {
  save(attachment: ApplicationAttachment): void;
  byId(attachmentId: SportaId): ApplicationAttachment | null;
  listByApplication(applicationId: SportaId): readonly ApplicationAttachment[];
  listByScope(workspace: string): readonly ApplicationAttachment[];
}

/** Session store (bounded interaction sessions). */
export interface ApplicationSessionStorePort {
  save(session: ApplicationSession): void;
  byId(sessionId: SportaId): ApplicationSession | null;
  listByAttachment(attachmentId: SportaId): readonly ApplicationSession[];
}

/** Append-only action audit store — the durable evidence stream. */
export interface ApplicationActionAuditStorePort {
  append(record: ApplicationActionRecord): void;
  byId(actionRecordId: SportaId): ApplicationActionRecord | null;
  bySession(sessionId: SportaId): readonly ApplicationActionRecord[];
}

/** Effect evidence one invocation observed (before/after, sanitized). */
export interface ApplicationInvocationEffect {
  readonly kind: string;
  readonly beforeSummary: string;
  readonly afterSummary: string;
  readonly changed: boolean;
  /** Evidence bytes for the reconciliation sink (never into the audit record). */
  readonly evidenceBytes: Uint8Array;
}

/** Typed, honest outcome of one capability invocation (never fabricated). */
export type ApplicationCapabilityInvocationResult =
  | {
      status: "succeeded";
      /** Sanitized output references — hashes/ids, never raw payloads. */
      sanitizedOutputRefs: readonly string[];
      effect: ApplicationInvocationEffect | null;
      detail: string;
    }
  | {
      /** The target could not be reached/started — never "successful". */
      status: "disconnected";
      failureKind: string;
      detail: string;
    }
  | {
      /** The target ran and reported a real failure. */
      status: "failed";
      failureKind: string;
      detail: string;
    };

/**
 * The generic capability-invocation seam — the boundary the ZCode
 * agent path drives attached-app actions through (the browser/
 * terminal precedent: ONE generic surface, adapter-implemented, never
 * an app-specific shell). Adapters own ALL process/IO mechanics.
 */
export interface ApplicationCapabilityInvocationPort {
  /** REAL target probe (attach-time verification). */
  probeTarget(descriptor: ApplicationEnvironmentDescriptor): Promise<{
    reachable: boolean;
    detail: string;
  }>;
  invoke(input: {
    descriptor: ApplicationEnvironmentDescriptor;
    capability: ApplicationCapability;
    parameters: Readonly<Record<string, unknown>>;
  }): Promise<ApplicationCapabilityInvocationResult>;
}

/** Where a VERIFIED effect gets reconciled (immutable revision + ref). */
export interface ApplicationEffectSinkResult {
  readonly artifactId: SportaId;
  readonly revisionId: SportaId;
  /** The WorkGraph node the artifact-revision ref was appended to. */
  readonly appendedToNodeId: SportaId;
  /** The WorkGraph the lineage was reconciled onto (echoed for records). */
  readonly workGraphId: SportaId;
}

/**
 * The verified-effect reconciliation sink: commits the effect evidence
 * as an immutable artifact revision and appends the artifact-revision
 * ref onto the SAME WorkGraph the run used (P9-19). Declared
 * structurally so the product composition implements it with the REAL
 * Artifact Fabric + WorkGraph refs port — this module stays on its
 * declared dependencies (contracts/work/policy) without duplicating
 * the fabric API.
 */
export interface ApplicationEffectSinkPort {
  commitVerifiedEffect(input: {
    sessionId: SportaId;
    actionRecordId: SportaId;
    workGraphId: SportaId;
    effect: ApplicationInvocationEffect;
    provenance: ProvenanceDescriptor;
    policy: PolicySet;
  }): Promise<ApplicationEffectSinkResult>;
}

/** The app action request the agent/tool path submits. */
export interface ApplicationActionRequest {
  sessionId: SportaId;
  capabilityId: string;
  /** Actor that requested the action (agent/user/system). */
  actor: string;
  parameters: Readonly<Record<string, unknown>>;
  /**
   * Payload text bound for the app (screened for instruction
   * injection — app-influenced content can never expand grants).
   */
  payloadText?: string | null;
  /**
   * Explicit confirmation for high-impact classes (security law 5):
   * required when admission says requiresConfirmation.
   */
  confirmed?: boolean;
}

/** The full orchestration outcome of one action request. */
export interface ApplicationActionOutcome {
  /** The frozen typed admission decision (fail-closed ladder). */
  admission: import("@sporta/app-environments/contract").ApplicationActionAdmissionResult;
  /** The durable audit record (allowed OR denied — both are evidence). */
  record: ApplicationActionRecord;
}
