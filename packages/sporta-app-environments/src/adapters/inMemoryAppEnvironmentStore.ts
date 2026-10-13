/**
 * In-memory stores (adapters layer — FIXTURE-GRADE persistence,
 * clearly labeled; the sibling InMemory*Store precedent). The domain
 * laws and app services are real; these stores keep records in
 * process memory for tests and local compositions. A durable store
 * adapter replaces them without touching domain/app.
 */
import type {
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import type { SportaId } from "@sporta/contracts/contract";
import type {
  ApplicationActionAuditStorePort,
  ApplicationAttachmentStorePort,
  ApplicationDescriptorStorePort,
  ApplicationSessionStorePort,
} from "../domain/ports.js";

/** In-memory descriptor registry (fixture-grade store). */
export class InMemoryApplicationDescriptorStore
  implements ApplicationDescriptorStorePort
{
  private readonly byIdMap = new Map<SportaId, ApplicationEnvironmentDescriptor>();

  save(descriptor: ApplicationEnvironmentDescriptor): void {
    this.byIdMap.set(descriptor.descriptorId, descriptor);
  }

  byId(descriptorId: SportaId): ApplicationEnvironmentDescriptor | null {
    return this.byIdMap.get(descriptorId) ?? null;
  }

  byApplication(applicationId: SportaId): ApplicationEnvironmentDescriptor | null {
    let latest: ApplicationEnvironmentDescriptor | null = null;
    for (const descriptor of this.byIdMap.values()) {
      if (descriptor.applicationId !== applicationId) continue;
      if (latest === null || descriptor.health.checkedAt > latest.health.checkedAt) {
        latest = descriptor;
      }
    }
    return latest;
  }

  all(): readonly ApplicationEnvironmentDescriptor[] {
    return [...this.byIdMap.values()];
  }
}

/** In-memory attachment store (fixture-grade store). */
export class InMemoryApplicationAttachmentStore
  implements ApplicationAttachmentStorePort
{
  private readonly byIdMap = new Map<SportaId, ApplicationAttachment>();

  save(attachment: ApplicationAttachment): void {
    this.byIdMap.set(attachment.attachmentId, attachment);
  }

  byId(attachmentId: SportaId): ApplicationAttachment | null {
    return this.byIdMap.get(attachmentId) ?? null;
  }

  listByApplication(applicationId: SportaId): readonly ApplicationAttachment[] {
    return [...this.byIdMap.values()].filter(
      (attachment) => attachment.applicationId === applicationId,
    );
  }

  listByScope(workspace: string): readonly ApplicationAttachment[] {
    return [...this.byIdMap.values()].filter(
      (attachment) => attachment.scope.workspace === workspace,
    );
  }
}

/** In-memory session store (fixture-grade store). */
export class InMemoryApplicationSessionStore implements ApplicationSessionStorePort {
  private readonly byIdMap = new Map<SportaId, ApplicationSession>();

  save(session: ApplicationSession): void {
    this.byIdMap.set(session.sessionId, session);
  }

  byId(sessionId: SportaId): ApplicationSession | null {
    return this.byIdMap.get(sessionId) ?? null;
  }

  listByAttachment(attachmentId: SportaId): readonly ApplicationSession[] {
    return [...this.byIdMap.values()].filter(
      (session) => session.attachmentId === attachmentId,
    );
  }
}

/** In-memory append-only audit store (fixture-grade store). */
export class InMemoryApplicationActionAuditStore
  implements ApplicationActionAuditStorePort
{
  private readonly byIdMap = new Map<SportaId, ApplicationActionRecord>();
  private readonly bySessionMap = new Map<SportaId, ApplicationActionRecord[]>();

  append(record: ApplicationActionRecord): void {
    this.byIdMap.set(record.actionRecordId, record);
    const stream = this.bySessionMap.get(record.sessionId) ?? [];
    stream.push(record);
    this.bySessionMap.set(record.sessionId, stream);
  }

  byId(actionRecordId: SportaId): ApplicationActionRecord | null {
    return this.byIdMap.get(actionRecordId) ?? null;
  }

  bySession(sessionId: SportaId): readonly ApplicationActionRecord[] {
    return [...(this.bySessionMap.get(sessionId) ?? [])];
  }
}
