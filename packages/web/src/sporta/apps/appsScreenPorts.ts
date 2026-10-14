/**
 * Connected-Apps screen ports (W11C — SCREEN-PORTS.md: "attachments +
 * grants + audit + revocation: the app-environment reads |
 * `@sporta/app-environments/contract`").
 *
 * TYPE-ONLY module. The shapes are STRUCTURAL MIRRORS of the frozen
 * `ApplicationAttachment` / `ApplicationEnvironmentDescriptor` /
 * `ApplicationActionRecord` records (the appAttachmentViews.ts mirror
 * precedent), so the REAL ApplicationEnvironmentService satisfies them
 * without this lane importing app-environment implementation modules.
 *
 * State-owner law: the lane owns NO attachment store. The revoke write
 * rides the EXISTING `ApplicationEnvironmentService.revokeAttachment`
 * path (driven REAL in the node battery); the studio host port's
 * surface law (exactly one write path) does not expose it, so the
 * real-host adapter disables revoke WITH that reason, and the fixture
 * host demonstrates the interaction with an honestly labeled local
 * transition. Attaching/granting is consented elsewhere (the attach
 * consent flow) — this screen revokes and inspects only.
 */
import type { ScreenBacking } from "../marketplace/marketplaceScreenPorts.js";

/** Structural mirror of the descriptor fields the screen shows. */
export interface ConnectedAppDescriptorShape {
  descriptorId: string;
  applicationId: string;
  appVersion: string;
  targetKind: string;
  targetIdentity: string;
  dataClasses: readonly string[];
  networkNeeds: string;
  limitations: readonly string[];
  licensing: { license: string; provenance: string };
  capabilities: readonly {
    capabilityId: string;
    capabilityClass: string;
    action: string;
    sideEffects: readonly string[];
    requiredPermissions: readonly string[];
  }[];
}

/** Structural mirror of ApplicationAttachment. */
export interface ConnectedAppAttachmentShape {
  attachmentId: string;
  descriptorId: string;
  grantedCapabilityClasses: readonly string[];
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  learningConsent: { granted: false } | { granted: true; scope: string; retention: string };
  consentedBy: string;
  scope: { workspace: string; workGraphId: string | null };
  policySnapshot: string;
}

/** One attachment + its descriptor, as the screen consumes them. */
export interface ConnectedAppView {
  descriptor: ConnectedAppDescriptorShape;
  attachment: ConnectedAppAttachmentShape;
}

/** Structural mirror of ApplicationActionRecord (the audit trail). */
export interface ConnectedAppAuditShape {
  actionRecordId: string;
  sessionId: string;
  actor: string;
  capabilityId: string;
  capabilityClass: string;
  permissionDecision: {
    decision: "allowed" | "denied";
    basis: string;
    decidedBy: string;
  };
  status: "succeeded" | "failed" | "denied" | "cancelled";
  recordedAt: string;
  missingCoverageNote: string | null;
}

/**
 * The connected-apps screen port (screen id "connected-apps"). Audit
 * reads on the composition are NEXT DEPENDENCIES (the studio surface
 * does not expose the audit store); the fixture host carries labeled
 * demo audit rows, and the node battery drives the REAL service paths.
 */
export interface ConnectedAppsScreenPort {
  readonly backing: ScreenBacking;
  /** Attachments + descriptors (granted vs not-granted visible). */
  listAttachments(): Promise<readonly ConnectedAppView[]>;
  /** The audit trail for one attachment (typed refusal when unavailable). */
  readAuditTrail(attachmentId: string): Promise<readonly ConnectedAppAuditShape[]>;
  /**
   * The ONE write: revoke an attachment. The typed result surfaces
   * verbatim — never softened, never silent.
   */
  revoke(attachmentId: string): Promise<{ ok: true; revokedAt: string } | { ok: false; reason: string }>;
}
