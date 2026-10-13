/**
 * The environment service (app layer, W9C-1/2) — the single owner of
 * the descriptor registry and scoped user attachments:
 *
 * - registerDescriptor: validated, catalog-stable (a changed catalog
 *   for the same identity is a typed error — broader permissions
 *   require a new release and reauthorization);
 * - verifyTarget: delegates to the adapter's REAL probe (unreachable
 *   targets never attach);
 * - consentToAttach: builds the scoped, expiring, least-privilege
 *   attachment (exact granted classes; learning consent DENIED by
 *   default — lock 31);
 * - grantLearningConsent / withdrawLearningConsent: the separate
 *   explicit path (P9-22);
 * - revokeAttachment: idempotent revocation that safe-stops every
 *   open session (P9-20).
 *
 * Adapter-free: every IO seam is an injected store/port/clock.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  ApplicationAttachment,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";
import {
  assertCatalogStable,
  validateApplicationDescriptor,
} from "../domain/registry.js";
import {
  buildApplicationAttachment,
  withLearningConsent,
  withoutLearningConsent,
  withRevocation,
  type ApplicationConsentInput,
  type ApplicationLearningConsentInput,
} from "../domain/grants.js";
import {
  ApplicationAttachmentError,
  ApplicationRegistryError,
} from "../domain/errors.js";
import type {
  AppEnvironmentClock,
  ApplicationAttachmentStorePort,
  ApplicationCapabilityInvocationPort,
  ApplicationDescriptorStorePort,
} from "../domain/ports.js";
import type { ApplicationSessionService } from "./applicationSessionService.js";

/** Constructor dependencies — every IO seam injected. */
export interface ApplicationEnvironmentServiceDeps {
  clock: AppEnvironmentClock;
  descriptors: ApplicationDescriptorStorePort;
  attachments: ApplicationAttachmentStorePort;
  /** The capability-invocation seam (REAL target probes run here). */
  adapter: ApplicationCapabilityInvocationPort;
  /** Session owner — revocation safe-stops through it (P9-20). */
  sessions: ApplicationSessionService;
}

export class ApplicationEnvironmentService {
  private readonly deps: ApplicationEnvironmentServiceDeps;

  constructor(deps: ApplicationEnvironmentServiceDeps) {
    this.deps = deps;
  }

  /**
   * Register a descriptor (validated, fail-closed). Re-registering
   * the same identity with the same catalog is idempotent; a changed
   * catalog is the typed catalog-stability error.
   */
  registerDescriptor(descriptor: ApplicationEnvironmentDescriptor): ApplicationEnvironmentDescriptor {
    const violations = validateApplicationDescriptor(descriptor);
    if (violations.length > 0) {
      throw new ApplicationRegistryError(
        `descriptor ${descriptor.descriptorId} is malformed: ${violations.join("; ")}`,
        "descriptor-malformed",
      );
    }
    const existing = this.deps.descriptors.byApplication(descriptor.applicationId);
    if (existing !== null) assertCatalogStable(existing, descriptor);
    this.deps.descriptors.save(descriptor);
    return descriptor;
  }

  /** Read one descriptor (null when unknown). */
  readDescriptor(descriptorId: SportaId): ApplicationEnvironmentDescriptor | null {
    return this.deps.descriptors.byId(descriptorId);
  }

  /** List every registered descriptor. */
  listDescriptors(): readonly ApplicationEnvironmentDescriptor[] {
    return this.deps.descriptors.all();
  }

  /**
   * Verify the target with the adapter's REAL probe (a real process /
   * connection attempt — never a claim). An unreachable target is an
   * honest typed refusal.
   */
  async verifyTarget(descriptorId: SportaId): Promise<{ reachable: boolean; detail: string }> {
    const descriptor = this.requireDescriptor(descriptorId);
    return this.deps.adapter.probeTarget(descriptor);
  }

  /**
   * Attach: user consent becomes a scoped, expiring, least-privilege
   * attachment. The target must verify REAL first (fail-closed) and
   * the descriptor must be healthy.
   */
  async consentToAttach(
    input: ApplicationConsentInput,
  ): Promise<ApplicationAttachment> {
    const descriptor = this.requireDescriptor(input.descriptorId);
    if (descriptor.health.status === "unreachable") {
      throw new ApplicationAttachmentError(
        `descriptor ${descriptor.descriptorId} reports the target unreachable — attach refused (an unreachable app cannot be attached)`,
        "target-unreachable",
      );
    }
    const probe = await this.deps.adapter.probeTarget(descriptor);
    if (!probe.reachable) {
      throw new ApplicationAttachmentError(
        `target verification failed for ${descriptor.descriptorId}: ${probe.detail} — attach refused (fail-closed)`,
        "target-verification-failed",
      );
    }
    const attachment = buildApplicationAttachment(descriptor, input);
    this.deps.attachments.save(attachment);
    return attachment;
  }

  /** Read one attachment (null when unknown). */
  readAttachment(attachmentId: SportaId): ApplicationAttachment | null {
    return this.deps.attachments.byId(attachmentId);
  }

  /** List attachments in one workspace scope. */
  listAttachmentsByScope(workspace: string): readonly ApplicationAttachment[] {
    return this.deps.attachments.listByScope(workspace);
  }

  /** The SEPARATE learning-consent grant (never implied; P9-22). */
  grantLearningConsent(
    attachmentId: SportaId,
    input: ApplicationLearningConsentInput,
  ): ApplicationAttachment {
    const updated = withLearningConsent(this.requireAttachment(attachmentId), input);
    this.deps.attachments.save(updated);
    return updated;
  }

  /** Withdraw learning consent (back to denied). */
  withdrawLearningConsent(attachmentId: SportaId): ApplicationAttachment {
    const updated = withoutLearningConsent(this.requireAttachment(attachmentId));
    this.deps.attachments.save(updated);
    return updated;
  }

  /**
   * Revoke an attachment (idempotent). P9-20 safe-stop: every open
   * session over this attachment is marked revoked-mid-session, so
   * new actions are blocked by the admission ladder and in-flight
   * sessions carry the honest close state.
   */
  revokeAttachment(attachmentId: SportaId): ApplicationAttachment {
    const attachment = withRevocation(
      this.requireAttachment(attachmentId),
      this.deps.clock.now(),
    );
    this.deps.attachments.save(attachment);
    this.deps.sessions.safeStopAttachment(attachmentId);
    return attachment;
  }

  private requireDescriptor(descriptorId: SportaId): ApplicationEnvironmentDescriptor {
    const descriptor = this.deps.descriptors.byId(descriptorId);
    if (descriptor === null) {
      throw new ApplicationRegistryError(
        `descriptor ${descriptorId} is unknown`,
        "descriptor-unknown",
      );
    }
    return descriptor;
  }

  private requireAttachment(attachmentId: SportaId): ApplicationAttachment {
    const attachment = this.deps.attachments.byId(attachmentId);
    if (attachment === null) {
      throw new ApplicationAttachmentError(
        `attachment ${attachmentId} is unknown`,
        "attachment-unknown",
      );
    }
    return attachment;
  }
}
