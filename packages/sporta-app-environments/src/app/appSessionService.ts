/**
 * W9C-2 — the application session service (app layer). Bounded
 * interaction sessions over one attachment with the closeState law: only
 * ACTIVE sessions admit actions; closing is one-way (append-only audit
 * law); `disconnected` is a terminal NON-SUCCESS state; checkpoints are
 * append-only refs.
 */
import type { ApplicationSession, SportaId } from "@sporta/app-environments/contract";
import { ApplicationSessionStateError, ApplicationUnknownRecordError } from "../domain/errors.js";
import {
  auditStreamRefFor,
  closeApplicationSession,
  appendCheckpointRef,
} from "../domain/sessions.js";
import type { CloseSessionInput, OpenSessionInput } from "../domain/sessions.js";
import { fnv1aHex, stableStringify } from "../domain/stable.js";
import type {
  ApplicationAttachmentStorePort,
  ApplicationDescriptorStorePort,
  ApplicationSessionStorePort,
  AppEnvironmentClock,
} from "../domain/ports.js";

/** Constructor dependencies — every IO seam injected. */
export interface AppSessionServiceDeps {
  clock: AppEnvironmentClock;
  descriptors: ApplicationDescriptorStorePort;
  attachments: ApplicationAttachmentStorePort;
  sessions: ApplicationSessionStorePort;
}

export class AppSessionService {
  private readonly deps: AppSessionServiceDeps;

  constructor(deps: AppSessionServiceDeps) {
    this.deps = deps;
  }

  /**
   * Open one bounded session over an attachment. Fail-closed: the
   * attachment must exist and be unrevoked/unexpired at open time; the
   * `activeGrants` snapshot the attachment's granted classes; `versions`
   * pin app/adapter/target for reproducibility; the audit stream ref is
   * deterministic.
   */
  openSession(input: OpenSessionInput): ApplicationSession {
    const attachment = this.deps.attachments.byAttachmentId(input.attachmentId);
    if (attachment === null) {
      throw new ApplicationUnknownRecordError(
        `cannot open a session over unknown attachment ${input.attachmentId}`,
        "attachment",
        input.attachmentId,
      );
    }
    if (attachment.revokedAt !== null) {
      throw new ApplicationSessionStateError(
        `attachment ${attachment.attachmentId} is revoked — no new sessions (P9-20)`,
        "attachment-revoked",
      );
    }
    const now = input.openedAt ?? this.deps.clock.now();
    if (now >= attachment.expiresAt) {
      throw new ApplicationSessionStateError(
        `attachment ${attachment.attachmentId} expired at ${attachment.expiresAt} — no new sessions`,
        "attachment-expired",
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
    const sessionId =
      input.sessionId ??
      `sess:${fnv1aHex(stableStringify({ attachmentId: attachment.attachmentId, openedAt: now }))}`;
    const existing = this.deps.sessions.bySessionId(sessionId);
    if (existing !== null) {
      return existing; // idempotent open at the same moment
    }
    const session: ApplicationSession = {
      sessionId,
      attachmentId: attachment.attachmentId,
      versions: {
        app: input.versions.app,
        adapter: input.versions.adapter,
        target: input.versions.target,
      },
      activeGrants: [...attachment.grantedCapabilityClasses],
      openedAt: now,
      closedAt: null,
      closeState: "active",
      checkpointRefs: [],
      auditStreamRef: auditStreamRefFor(sessionId, attachment.attachmentId),
    };
    this.deps.sessions.save(session);
    return session;
  }

  /**
   * Close one session with an HONEST terminal close state
   * (`closed-clean|revoked-mid-session|expired|disconnected`). Closing an
   * already-closed session is the typed append-only violation.
   */
  closeSession(input: CloseSessionInput): ApplicationSession {
    const session = this.deps.sessions.bySessionId(input.sessionId);
    if (session === null) {
      throw new ApplicationUnknownRecordError(
        `no application session ${input.sessionId}`,
        "session",
        input.sessionId,
      );
    }
    if (session.closeState !== "active") {
      throw new ApplicationSessionStateError(
        `session ${session.sessionId} is already closed (${session.closeState}) — the session record is append-only`,
        "already-closed",
      );
    }
    const now = this.deps.clock.now();
    try {
      const closed = closeApplicationSession(session, input, now);
      this.deps.sessions.save(closed);
      return closed;
    } catch (cause) {
      throw new ApplicationSessionStateError(
        cause instanceof Error ? cause.message : String(cause),
        "invalid-close-state",
      );
    }
  }

  /** Append one checkpoint ref (append-only; idempotent per ref). */
  appendCheckpoint(input: { sessionId: SportaId; ref: string }): ApplicationSession {
    const session = this.deps.sessions.bySessionId(input.sessionId);
    if (session === null) {
      throw new ApplicationUnknownRecordError(
        `no application session ${input.sessionId}`,
        "session",
        input.sessionId,
      );
    }
    const updated = appendCheckpointRef(session, input.ref);
    this.deps.sessions.save(updated);
    return updated;
  }

  /** Read one session (typed unknown error). */
  readSession(sessionId: SportaId): ApplicationSession {
    const session = this.deps.sessions.bySessionId(sessionId);
    if (session === null) {
      throw new ApplicationUnknownRecordError(
        `no application session ${sessionId}`,
        "session",
        sessionId,
      );
    }
    return session;
  }

  /** List sessions of one attachment (the bounded-session inventory). */
  listSessions(attachmentId: SportaId): readonly ApplicationSession[] {
    return this.deps.sessions.listByAttachment(attachmentId);
  }
}
