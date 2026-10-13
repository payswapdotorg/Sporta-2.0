/**
 * Scoped user grants / attachment laws (domain — pure, W9C-2).
 *
 * Grants are user-consented, least-privilege, scoped, expiring and
 * revocable. grantedCapabilityClasses are EXACT (deduped, subset of
 * the declared catalog — granting observe NEVER silently grants
 * control, lock invariant 30). Learning consent is a SEPARATE record
 * path (lock 31: attachment alone never learns; P9-22).
 */
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type {
  ApplicationAttachment,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";
import { ApplicationAttachmentError } from "./errors.js";
import { declaredCapabilityClasses } from "./registry.js";

/** User consent input for attaching one application. */
export interface ApplicationConsentInput {
  attachmentId?: SportaId;
  descriptorId: SportaId;
  consentedBy: string;
  tenant: string;
  scope: { workspace: string; workGraphId: SportaId | null };
  /** The exact capability classes the user grants (never widened). */
  grantedCapabilityClasses: readonly ApplicationCapabilityClass[];
  grantedAt?: Iso8601;
  expiresAt: Iso8601;
  /** Pinned policy snapshot id at consent time. */
  policySnapshot: string;
}

/** Learning-consent grant input (the separate, explicit path). */
export interface ApplicationLearningConsentInput {
  scope: string;
  retention: string;
}

/**
 * Build an ApplicationAttachment from consent. Laws (all fail-closed):
 * - granted classes dedupe to the EXACT granted set;
 * - every granted class must be declared by the descriptor;
 * - the scope workspace/tenant must match the descriptor binding;
 * - expiry must lie strictly after grant time;
 * - learningConsent starts DENIED (lock 31).
 */
export function buildApplicationAttachment(
  descriptor: ApplicationEnvironmentDescriptor,
  input: ApplicationConsentInput,
): ApplicationAttachment {
  if (input.consentedBy.length === 0) {
    throw new ApplicationAttachmentError("consentedBy must name the consenting user", "consent-missing");
  }
  if (input.tenant !== descriptor.workspaceBinding.tenant) {
    throw new ApplicationAttachmentError(
      `attachment tenant "${input.tenant}" does not match the descriptor binding "${descriptor.workspaceBinding.tenant}"`,
      "tenant-mismatch",
    );
  }
  if (input.scope.workspace !== descriptor.workspaceBinding.workspace) {
    throw new ApplicationAttachmentError(
      `attachment workspace "${input.scope.workspace}" does not match the descriptor binding "${descriptor.workspaceBinding.workspace}"`,
      "workspace-mismatch",
    );
  }
  if (input.grantedCapabilityClasses.length === 0) {
    throw new ApplicationAttachmentError(
      "at least one capability class must be granted — an attachment grants nothing otherwise",
      "no-capability-granted",
    );
  }
  const declared = new Set(declaredCapabilityClasses(descriptor));
  for (const granted of input.grantedCapabilityClasses) {
    if (!declared.has(granted)) {
      throw new ApplicationAttachmentError(
        `granted class "${granted}" is not declared by ${descriptor.applicationId} — grants never exceed the declared catalog (least privilege)`,
        "class-not-declared",
      );
    }
  }
  const grantedAt = input.grantedAt ?? descriptor.health.checkedAt;
  if (!(Date.parse(input.expiresAt) > Date.parse(grantedAt))) {
    throw new ApplicationAttachmentError(
      `expiresAt ${input.expiresAt} must lie strictly after grantedAt ${grantedAt}`,
      "expiry-not-after-grant",
    );
  }
  return {
    attachmentId: input.attachmentId ?? `att:${descriptor.applicationId}:${grantedAt}`,
    applicationId: descriptor.applicationId,
    descriptorId: descriptor.descriptorId,
    consentedBy: input.consentedBy,
    tenant: input.tenant,
    scope: { workspace: input.scope.workspace, workGraphId: input.scope.workGraphId ?? null },
    grantedCapabilityClasses: [...new Set(input.grantedCapabilityClasses)],
    grantedAt,
    expiresAt: input.expiresAt,
    revokedAt: null,
    policySnapshot: input.policySnapshot,
    learningConsent: { granted: false },
  };
}

/** Grant the SEPARATE learning consent (never implied by attachment). */
export function withLearningConsent(
  attachment: ApplicationAttachment,
  input: ApplicationLearningConsentInput,
): ApplicationAttachment {
  if (input.scope.length === 0 || input.retention.length === 0) {
    throw new ApplicationAttachmentError(
      "learning consent must declare scope and retention (P9-22)",
      "learning-consent-malformed",
    );
  }
  return {
    ...attachment,
    learningConsent: { granted: true, scope: input.scope, retention: input.retention },
  };
}

/** Withdraw learning consent (back to denied; attachment stays intact). */
export function withoutLearningConsent(
  attachment: ApplicationAttachment,
): ApplicationAttachment {
  return { ...attachment, learningConsent: { granted: false } };
}

/** Mark the attachment revoked (idempotent; stamps when absent). */
export function withRevocation(
  attachment: ApplicationAttachment,
  revokedAt: Iso8601,
): ApplicationAttachment {
  if (attachment.revokedAt !== null) return attachment;
  return { ...attachment, revokedAt };
}

/**
 * Active-grant evaluation against a clock (the record's expiry is
 * never trusted alone — P9-20). Revoked and expired grants are both
 * inactive; the caller maps the reason for the admission ladder.
 */
export function attachmentStatus(
  attachment: ApplicationAttachment,
  now: Iso8601,
): { active: true } | { active: false; reason: "revoked" | "expired" } {
  if (attachment.revokedAt !== null) return { active: false, reason: "revoked" };
  if (Date.parse(now) >= Date.parse(attachment.expiresAt)) {
    return { active: false, reason: "expired" };
  }
  return { active: true };
}

/**
 * The exact-grant law used by the admission ladder: the capability's
 * class must be a member of the granted set — a set membership, never
 * a hierarchy (observe does not imply control or anything else).
 */
export function isCapabilityClassGranted(
  attachment: Pick<ApplicationAttachment, "grantedCapabilityClasses">,
  capabilityClass: ApplicationCapabilityClass,
): boolean {
  return attachment.grantedCapabilityClasses.includes(capabilityClass);
}
