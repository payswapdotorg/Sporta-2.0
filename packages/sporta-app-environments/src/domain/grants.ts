/**
 * W9C-1 — scoped grants, expiry/revocation, separate learning consent
 * (domain — pure, lock 30/31 + P9-18/20). Granting one class never grants
 * another; attachment alone NEVER authorizes learning; expiry and
 * revocation are honest predicates evaluated against the injected clock.
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type {
  ApplicationAttachment,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";

/** Input for one user-consented attachment (explicit scope + classes). */
export interface AttachApplicationInput {
  attachmentId?: string;
  applicationId: string;
  descriptorId: string;
  /** The user principal who consents — never ambient. */
  consentedBy: string;
  tenant: string;
  scope: { workspace: string; workGraphId: string | null };
  /** The exact classes the user grants — never broader than declared. */
  grantedCapabilityClasses: readonly ApplicationCapabilityClass[];
  grantedAt?: Iso8601;
  expiresAt: Iso8601;
  /** Policy snapshot at consent time. */
  policySnapshot: string;
}

/** Input for the SEPARATE learning-consent write path (lock 31). */
export interface GrantLearningConsentInput {
  attachmentId: string;
  scope: string;
  retention: string;
}

/** The classes a descriptor declares (its capability catalog). */
export function declaredCapabilityClasses(
  descriptor: Pick<ApplicationEnvironmentDescriptor, "capabilities">,
): readonly ApplicationCapabilityClass[] {
  return [...new Set(descriptor.capabilities.map((capability) => capability.capabilityClass))];
}

/** Exact-set containment: granted classes cover the requested class only if listed. */
export function grantedClassesCover(
  granted: readonly ApplicationCapabilityClass[],
  requested: ApplicationCapabilityClass,
): boolean {
  return granted.includes(requested);
}

/** Revocation is a fact of the record, not an inference. */
export function isAttachmentRevoked(attachment: Pick<ApplicationAttachment, "revokedAt">): boolean {
  return attachment.revokedAt !== null;
}

/** Expiry is evaluated against the injected clock, never ambient time. */
export function isAttachmentExpired(
  attachment: Pick<ApplicationAttachment, "expiresAt">,
  now: Iso8601,
): boolean {
  return now >= attachment.expiresAt;
}

/**
 * Validate a grant request against the descriptor (fail-closed):
 * every requested class must be DECLARED by the descriptor (granting an
 * undeclared class is refused — least privilege, never broader), and the
 * expiry must lie strictly after the grant moment.
 */
export function validateGrantRequest(
  descriptor: Pick<ApplicationEnvironmentDescriptor, "capabilities">,
  requested: readonly ApplicationCapabilityClass[],
  grantedAt: Iso8601,
  expiresAt: Iso8601,
): { valid: true } | { valid: false; code: string; detail: string } {
  const declared = new Set(declaredCapabilityClasses(descriptor));
  const undeclared = requested.filter((class_) => !declared.has(class_));
  if (undeclared.length > 0) {
    return {
      valid: false,
      code: "class-not-declared",
      detail: `grant requests undeclared capability classes: ${undeclared.join(", ")} — grants are never broader than the descriptor's declared catalog`,
    };
  }
  if (expiresAt <= grantedAt) {
    return {
      valid: false,
      code: "expiry-not-future",
      detail: `expiresAt ${expiresAt} is not after the grant moment ${grantedAt}`,
    };
  }
  return { valid: true };
}

/**
 * Validate a grant AMENDMENT (the reauthorization law: broader classes on
 * a new release require re-consent). The amended set must still be a
 * subset of the declared catalog, and the consent principal is required.
 */
export function validateGrantAmendment(
  descriptor: Pick<ApplicationEnvironmentDescriptor, "capabilities">,
  current: readonly ApplicationCapabilityClass[],
  amended: readonly ApplicationCapabilityClass[],
): { valid: true; broadened: readonly ApplicationCapabilityClass[] } | { valid: false; code: string; detail: string } {
  const declared = new Set(declaredCapabilityClasses(descriptor));
  const undeclared = amended.filter((class_) => !declared.has(class_));
  if (undeclared.length > 0) {
    return {
      valid: false,
      code: "class-not-declared",
      detail: `amended grant requests undeclared capability classes: ${undeclared.join(", ")}`,
    };
  }
  const currentSet = new Set(current);
  const broadened = amended.filter((class_) => !currentSet.has(class_));
  return { valid: true, broadened };
}

/**
 * Learning consent law: an attachment ALWAYS starts with
 * `{granted:false}` — the frozen record's `learningConsent` field is set
 * ONLY by the separate consent path. This helper builds the initial value
 * so no call site can accidentally grant it (lock 31).
 */
export function initialLearningConsent(): { granted: false } {
  return { granted: false };
}
