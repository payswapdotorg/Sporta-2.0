/**
 * W9C — the in-memory app-environment store (adapters layer).
 *
 * EVIDENCE CLASS: FIXTURE — no durability is claimed; the store exists so
 * the services and tests compose over the declared ports (the
 * InMemoryMarketplaceStore precedent). The append-only audit law is
 * ENFORCED here: re-appending a byte-identical record is idempotent; a
 * different record under an existing id is the typed
 * `ApplicationAuditConflictError` — history is never rewritten.
 */
import type {
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
  SportaId,
} from "@sporta/app-environments/contract";
import { ApplicationAuditConflictError } from "../domain/errors.js";
import { actionRecordFingerprint } from "../domain/audit.js";
import type {
  ApplicationActionAuditStorePort,
  ApplicationAttachmentStorePort,
  ApplicationDescriptorStorePort,
  ApplicationSessionStorePort,
} from "../domain/ports.js";

/**
 * One in-memory store implementing the four record ports (descriptors,
 * attachments, sessions, audit). Fixture-labeled: tests and the studio
 * demo composition inject it; production wires durable adapters.
 */
export class InMemoryAppEnvironmentStore
  implements
    ApplicationDescriptorStorePort,
    ApplicationAttachmentStorePort,
    ApplicationSessionStorePort,
    ApplicationActionAuditStorePort
{
  private readonly descriptors = new Map<SportaId, ApplicationEnvironmentDescriptor>();
  private readonly attachments = new Map<SportaId, ApplicationAttachment>();
  private readonly sessions = new Map<SportaId, ApplicationSession>();
  private readonly auditRecords = new Map<SportaId, ApplicationActionRecord>();

  // -- unified save (the three record ports discriminate by shape) -------

  save(
    record:
      | ApplicationEnvironmentDescriptor
      | ApplicationAttachment
      | ApplicationSession,
  ): void {
    if ("capabilities" in record) {
      this.descriptors.set(record.descriptorId, record);
    } else if ("grantedCapabilityClasses" in record) {
      this.attachments.set(record.attachmentId, record);
    } else {
      this.sessions.set(record.sessionId, record);
    }
  }

  // -- descriptors ---------------------------------------------------------

  byDescriptorId(descriptorId: SportaId): ApplicationEnvironmentDescriptor | null {
    return this.descriptors.get(descriptorId) ?? null;
  }
  byApplicationId(applicationId: SportaId): ApplicationEnvironmentDescriptor | null {
    for (const descriptor of this.descriptors.values()) {
      if (descriptor.applicationId === applicationId) return descriptor;
    }
    return null;
  }
  list(): readonly ApplicationEnvironmentDescriptor[] {
    return [...this.descriptors.values()];
  }

  // -- attachments ---------------------------------------------------------

  byAttachmentId(attachmentId: SportaId): ApplicationAttachment | null {
    return this.attachments.get(attachmentId) ?? null;
  }
  listByApplication(applicationId: SportaId): readonly ApplicationAttachment[] {
    return [...this.attachments.values()].filter(
      (attachment) => attachment.applicationId === applicationId,
    );
  }

  // -- sessions ------------------------------------------------------------

  bySessionId(sessionId: SportaId): ApplicationSession | null {
    return this.sessions.get(sessionId) ?? null;
  }
  listByAttachment(attachmentId: SportaId): readonly ApplicationSession[] {
    return [...this.sessions.values()].filter(
      (session) => session.attachmentId === attachmentId,
    );
  }

  // -- audit (append-only law enforced) ------------------------------------

  append(record: ApplicationActionRecord): void {
    const existing = this.auditRecords.get(record.actionRecordId);
    if (existing === undefined) {
      this.auditRecords.set(record.actionRecordId, record);
      return;
    }
    if (actionRecordFingerprint(existing) !== actionRecordFingerprint(record)) {
      throw new ApplicationAuditConflictError(
        `audit record ${record.actionRecordId} already exists with different content — the audit trail is append-only`,
        record.actionRecordId,
      );
    }
    // Byte-identical re-append: idempotent no-op (retry law).
  }
  byActionRecordId(actionRecordId: SportaId): ApplicationActionRecord | null {
    return this.auditRecords.get(actionRecordId) ?? null;
  }
  listBySession(sessionId: SportaId): readonly ApplicationActionRecord[] {
    return [...this.auditRecords.values()].filter((record) => record.sessionId === sessionId);
  }
}
