/**
 * sporta-app-environments — generic application attachments, scoped
 * capability grants and action audit (P9 / Wave 0 TL freeze).
 *
 * Source of truth: docs/contracts/application-environment.md.
 *
 * A user can attach a local, remote, browser-hosted, native or
 * service-backed application to a Sporta workspace/run so the EXISTING
 * ZCode AgentRuntime can use its declared capabilities — like browser and
 * terminal. ZCode stays the single runtime/tool/session/permission
 * authority; there is no Sporta runtime and no app-specific shell surface
 * (lock invariants 30-31, 37). Observation never implies mutation.
 * Grants are user-consented, least-privilege, scoped, expiring and
 * revocable. App outputs are untrusted content; instructions inside app
 * content can never expand permissions.
 */
import type {
  SportaId,
  Iso8601,
  ContentHash,
  PolicySet,
  ProvenanceDescriptor,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
export type {
  SportaId,
  Iso8601,
  ContentHash,
  PolicySet,
  ProvenanceDescriptor,
  WorkGraphRecord,
} from "@sporta/contracts/contract";

/** Independent capability classes — granting one never grants another. */
export type ApplicationCapabilityClass =
  | "observe"
  | "control"
  | "semantic-binding"
  | "file-transfer"
  | "network-access";

/** Where the attached application runs / is reached from. */
export type ApplicationTargetKind =
  | "local"
  | "remote"
  | "browser-hosted"
  | "native"
  | "service";

/** A typed action an attached app exposes (declared by its adapter). */
export interface ApplicationCapability {
  capabilityId: string;
  capabilityClass: ApplicationCapabilityClass;
  /** Human-readable action name. */
  action: string;
  /** Typed inputs/outputs (opaque data kinds, like transform ports). */
  inputs: readonly { name: string; dataKind: string; required: boolean }[];
  outputs: readonly { name: string; dataKind: string }[];
  /** Declared side effects; empty for pure observation. */
  sideEffects: readonly string[];
  /** Permissions required beyond the capability class itself. */
  requiredPermissions: readonly string[];
  /** Typed failure modes the capability can produce. */
  failures: readonly string[];
}

/** Descriptor of an attachable application environment. */
export interface ApplicationEnvironmentDescriptor {
  descriptorId: SportaId;
  /** Stable Sporta application id (opaque). */
  applicationId: SportaId;
  /** Adapter/provider id; implementation detail never imported by UI. */
  providerAdapterId: string;
  appVersion: string;
  targetKind: ApplicationTargetKind;
  /** Identity of the concrete target instance the user verified. */
  targetIdentity: string;
  /** Workspace binding (tenant/workspace/run scope of attachment). */
  workspaceBinding: { tenant: string; workspace: string };
  /** The catalog of capabilities this app exposes. */
  capabilities: readonly ApplicationCapability[];
  /** Launch/connection requirements (declared, checked at attach time). */
  launchRequirements: readonly string[];
  /** Data classes the app touches — for disclosure and policy checks. */
  dataClasses: readonly string[];
  /** Network needs; denied by default (lock invariant 32 analog). */
  networkNeeds: "none" | "narrow-allowlist";
  licensing: { license: string; provenance: string };
  health: { checkedAt: Iso8601; status: "healthy" | "degraded" | "unreachable" };
  limitations: readonly string[];
  policy: PolicySet;
}

/** User-consented, scoped, expiring, revocable capability grant. */
export interface ApplicationAttachment {
  attachmentId: SportaId;
  applicationId: SportaId;
  descriptorId: SportaId;
  /** Principal who consented (user) and the tenant it belongs to. */
  consentedBy: string;
  tenant: string;
  /** Scope: workspace and optionally one WorkGraph/run. */
  scope: { workspace: string; workGraphId: SportaId | null };
  /** The exact granted capability classes — never broader than declared. */
  grantedCapabilityClasses: readonly ApplicationCapabilityClass[];
  grantedAt: Iso8601;
  /** Expiry and revocation reference. */
  expiresAt: Iso8601;
  revokedAt: Iso8601 | null;
  /** Policy snapshot at consent time. */
  policySnapshot: string;
  /** Separate learning consent — attachment alone never learns (lock 31). */
  learningConsent: { granted: false } | { granted: true; scope: string; retention: string };
}

/** Bounded interaction session over one attachment. */
export interface ApplicationSession {
  sessionId: SportaId;
  attachmentId: SportaId;
  /** Adapter/target versions in use for reproducibility. */
  versions: { app: string; adapter: string; target: string };
  /** Capability grants active for this session. */
  activeGrants: readonly ApplicationCapabilityClass[];
  openedAt: Iso8601;
  closedAt: Iso8601 | null;
  /** Close/recovery state — a disconnected app is never "successful". */
  closeState: "active" | "closed-clean" | "revoked-mid-session" | "expired" | "disconnected";
  /** Checkpoints and artifact references produced during the session. */
  checkpointRefs: readonly string[];
  auditStreamRef: string;
}

/** Audit record of one allowed (or denied) application action. */
export interface ApplicationActionRecord {
  actionRecordId: SportaId;
  sessionId: SportaId;
  /** Actor that requested the action (agent/user/system). */
  actor: string;
  capabilityId: string;
  capabilityClass: ApplicationCapabilityClass;
  targetIdentity: string;
  /** Sanitized input/output references — never secrets or raw payloads. */
  sanitizedInputRefs: readonly string[];
  sanitizedOutputRefs: readonly string[];
  /** Permission decision trail for this action. */
  permissionDecision: {
    decision: "allowed" | "denied";
    basis: "granted-scope" | "not-granted" | "revoked" | "expired" | "requires-confirmation";
    decidedBy: string;
  };
  /** Verified effect evidence (before/after), where observable. */
  effects: readonly { kind: string; evidenceRef: string; verified: boolean }[];
  status: "succeeded" | "failed" | "denied" | "cancelled";
  /** Resulting WorkGraph/artifact references for lineage reconciliation. */
  reconciledRefs: { workGraphId: SportaId | null; artifactRevisionIds: readonly string[] };
  recordedAt: Iso8601;
  /** Explicit note when event coverage is missing — never silent. */
  missingCoverageNote: string | null;
}

/** Typed admission outcome for an app action request (fail-closed). */
export type ApplicationActionAdmissionResult =
  | { admitted: true; capabilityId: string; requiresConfirmation: false }
  | {
      admitted: true;
      capabilityId: string;
      requiresConfirmation: true;
      /** Destructive/public/purchase/permission-changing action class. */
      confirmationClass:
        | "destructive"
        | "irreversible"
        | "public-posting"
        | "purchase"
        | "publishing"
        | "billing"
        | "permission-change";
    }
  | {
      admitted: false;
      reason:
        | "capability-not-declared"
        | "capability-class-not-granted"
        | "attachment-revoked"
        | "attachment-expired"
        | "session-closed"
        | "sandbox-policy-denied"
        | "instruction-injection-suspected";
      detail: string;
    };
