/**
 * W9C-1 — the attachment service (app layer). User-consented scoped
 * grants with expiry/revocation and the SEPARATE learning-consent path.
 * Revocation enforces the safe-stop law (P9-20): every still-active
 * session of the attachment closes `revoked-mid-session` (checkpoints
 * preserved); new actions are blocked by the admission ladder.
 */
import type {
  ApplicationAttachment,
  ApplicationCapabilityClass,
  SportaId,
} from "@sporta/app-environments/contract";
import { ApplicationAttachmentError, ApplicationUnknownRecordError } from "../domain/errors.js";
import {
  initialLearningConsent,
  validateGrantAmendment,
  validateGrantRequest,
} from "../domain/grants.js";
import { closeStateForRevocation } from "../domain/sessions.js";
import { fnv1aHex, stableStringify } from "../domain/stable.js";
import type {
  ApplicationAttachmentStorePort,
  ApplicationDescriptorStorePort,
  ApplicationSessionStorePort,
  AppEnvironmentClock,
} from "../domain/ports.js";
import type { AttachApplicationInput, GrantLearningConsentInput } from "../domain/grants.js";

/** Constructor dependencies — every IO seam injected. */
export interface AttachmentServiceDeps {
  clock: AppEnvironmentClock;
  descriptors: ApplicationDescriptorStorePort;
  attachments: ApplicationAttachmentStorePort;
  /** Session store for the revocation safe-stop (optional seam). */
  sessions?: ApplicationSessionStorePort;
}

export class AttachmentService {
  private readonly deps: AttachmentServiceDeps;

  constructor(deps: AttachmentServiceDeps) {
    this.deps = deps;
  }

  /**
   * Record one user-consented attachment. Fail-closed: the granted
   * classes must be declared by the descriptor (never broader), expiry
   * must be in the future, and the descriptor must exist. The frozen
   * record ALWAYS starts with `learningConsent: {granted:false}` (lock
   * 31 — attachment alone never learns).
   */
  attachApplication(input: AttachApplicationInput): ApplicationAttachment {
    const descriptor = this.deps.descriptors.byDescriptorId(input.descriptorId);
    if (descriptor === null) {
      throw new ApplicationUnknownRecordError(
        `cannot attach unknown descriptor ${input.descriptorId}`,
        "descriptor",
        input.descriptorId,
      );
    }
    const grantedAt = input.grantedAt ?? this.deps.clock.now();
    const grant = validateGrantRequest(
      descriptor,
      input.grantedCapabilityClasses,
      grantedAt,
      input.expiresAt,
    );
    if (!grant.valid) {
      throw new ApplicationAttachmentError(
        `attachment for ${input.applicationId} refused: ${grant.detail}`,
        grant.code,
      );
    }
    const attachmentId =
      input.attachmentId ??
      `att:${fnv1aHex(
        stableStringify({
          applicationId: input.applicationId,
          consentedBy: input.consentedBy,
          workspace: input.scope.workspace,
          grantedAt,
        }),
      )}`;
    const existing = this.deps.attachments.byAttachmentId(attachmentId);
    if (existing !== null) {
      return existing; // idempotent re-consent of the same scope/moment
    }
    const attachment: ApplicationAttachment = {
      attachmentId,
      applicationId: input.applicationId,
      descriptorId: input.descriptorId,
      consentedBy: input.consentedBy,
      tenant: input.tenant,
      scope: { workspace: input.scope.workspace, workGraphId: input.scope.workGraphId },
      grantedCapabilityClasses: [...input.grantedCapabilityClasses],
      grantedAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
      policySnapshot: input.policySnapshot,
      learningConsent: initialLearningConsent(),
    };
    this.deps.attachments.save(attachment);
    return attachment;
  }

  /**
   * Amend (broaden) the granted classes — ONLY with a new explicit
   * consent principal (the reauthorization law). The amended set is
   * re-validated against the descriptor catalog.
   */
  amendGrant(input: {
    attachmentId: SportaId;
    consentedBy: string;
    grantedCapabilityClasses: readonly ApplicationCapabilityClass[];
  }): ApplicationAttachment {
    const attachment = this.requireAttachment(input.attachmentId);
    if (attachment.revokedAt !== null) {
      throw new ApplicationAttachmentError(
        `attachment ${attachment.attachmentId} is revoked — grants cannot be amended`,
        "attachment-revoked",
      );
    }
    const descriptor = this.deps.descriptors.byDescriptorId(attachment.descriptorId);
    if (descriptor === null) {
      throw new ApplicationUnknownRecordError(
        `attachment ${attachment.attachmentId} references unknown descriptor ${attachment.descriptorId}`,
        "descriptor",
        attachment.descriptorId,
      );
    }
    const amendment = validateGrantAmendment(
      descriptor,
      attachment.grantedCapabilityClasses,
      input.grantedCapabilityClasses,
    );
    if (!amendment.valid) {
      throw new ApplicationAttachmentError(
        `grant amendment for ${attachment.attachmentId} refused: ${amendment.detail}`,
        amendment.code,
      );
    }
    if (input.consentedBy !== attachment.consentedBy) {
      throw new ApplicationAttachmentError(
        `grant amendment for ${attachment.attachmentId} requires re-consent by the original principal ${attachment.consentedBy}`,
        "consent-required",
      );
    }
    const amended: ApplicationAttachment = {
      ...attachment,
      grantedCapabilityClasses: [...input.grantedCapabilityClasses],
    };
    this.deps.attachments.save(amended);
    return amended;
  }

  /**
   * Revoke one attachment (idempotent). Safe-stop law (P9-20): every
   * still-active session of this attachment closes
   * `revoked-mid-session` — checkpoint refs preserved, never rewritten.
   */
  revokeAttachment(input: { attachmentId: SportaId; revokedAt?: string }): ApplicationAttachment {
    const attachment = this.requireAttachment(input.attachmentId);
    if (attachment.revokedAt !== null) {
      return attachment; // idempotent re-revoke
    }
    const now = input.revokedAt ?? this.deps.clock.now();
    const revoked: ApplicationAttachment = { ...attachment, revokedAt: now };
    this.deps.attachments.save(revoked);
    if (this.deps.sessions !== undefined) {
      for (const session of this.deps.sessions.listByAttachment(attachment.attachmentId)) {
        if (session.closeState !== "active") continue;
        this.deps.sessions.save({
          ...session,
          closeState: closeStateForRevocation(),
          closedAt: now,
          checkpointRefs: [...session.checkpointRefs],
        });
      }
    }
    return revoked;
  }

  /**
   * The SEPARATE learning-consent path (lock 31): flips the frozen
   * `learningConsent` field ONLY through this explicit call. No app
   * action path touches it.
   */
  grantLearningConsent(input: GrantLearningConsentInput): ApplicationAttachment {
    const attachment = this.requireAttachment(input.attachmentId);
    const consented: ApplicationAttachment = {
      ...attachment,
      learningConsent: { granted: true, scope: input.scope, retention: input.retention },
    };
    this.deps.attachments.save(consented);
    return consented;
  }

  /** Reset learning consent to `{granted:false}` (explicit revocation). */
  revokeLearningConsent(attachmentId: SportaId): ApplicationAttachment {
    const attachment = this.requireAttachment(attachmentId);
    const reset: ApplicationAttachment = { ...attachment, learningConsent: initialLearningConsent() };
    this.deps.attachments.save(reset);
    return reset;
  }

  /** Read one attachment (typed unknown error). */
  readAttachment(attachmentId: SportaId): ApplicationAttachment {
    return this.requireAttachment(attachmentId);
  }

  /** List attachments of one application (scoped grant inventory). */
  listAttachments(applicationId: SportaId): readonly ApplicationAttachment[] {
    return this.deps.attachments.listByApplication(applicationId);
  }

  private requireAttachment(attachmentId: SportaId): ApplicationAttachment {
    const attachment = this.deps.attachments.byAttachmentId(attachmentId);
    if (attachment === null) {
      throw new ApplicationUnknownRecordError(
        `no application attachment ${attachmentId}`,
        "attachment",
        attachmentId,
      );
    }
    return attachment;
  }
}
