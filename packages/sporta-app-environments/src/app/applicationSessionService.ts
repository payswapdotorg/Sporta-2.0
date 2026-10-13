/**
 * The session service (app layer, W9C-4) — the single owner of
 * ApplicationSession lifecycle over the pure domain laws: open (only
 * over ACTIVE attachments), checkpoint (append-only), close (honest
 * close states; a disconnected app is never successful) and
 * safe-stop (revocation marks open sessions revoked-mid-session).
 * Adapter-free: every IO seam is an injected store/clock.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type { ApplicationSession } from "@sporta/app-environments/contract";
import {
  closeApplicationSession,
  openApplicationSession,
  safeStopSessions,
  withCheckpoint,
  type ApplicationSessionCloseReason,
} from "../domain/sessionLifecycle.js";
import { ApplicationSessionError } from "../domain/errors.js";
import type {
  ApplicationAttachmentStorePort,
  ApplicationDescriptorStorePort,
  AppEnvironmentClock,
  ApplicationSessionStorePort,
} from "../domain/ports.js";

/** Constructor dependencies — every IO seam injected. */
export interface ApplicationSessionServiceDeps {
  clock: AppEnvironmentClock;
  attachments: ApplicationAttachmentStorePort;
  descriptors: ApplicationDescriptorStorePort;
  sessions: ApplicationSessionStorePort;
}

export class ApplicationSessionService {
  private readonly deps: ApplicationSessionServiceDeps;

  constructor(deps: ApplicationSessionServiceDeps) {
    this.deps = deps;
  }

  /** Open a bounded session over one ACTIVE attachment (typed laws). */
  async openSession(input: {
    attachmentId: SportaId;
    sessionId?: SportaId;
  }): Promise<ApplicationSession> {
    const attachment = this.deps.attachments.byId(input.attachmentId);
    if (attachment === null) {
      throw new ApplicationSessionError(
        `attachment ${input.attachmentId} is unknown`,
        "attachment-unknown",
      );
    }
    const descriptor = this.deps.descriptors.byId(attachment.descriptorId);
    if (descriptor === null) {
      throw new ApplicationSessionError(
        `descriptor ${attachment.descriptorId} is unknown`,
        "descriptor-unknown",
      );
    }
    const now = this.deps.clock.now();
    const sessionId =
      input.sessionId ?? `sess:${attachment.attachmentId}:${now}`;
    const existing = this.deps.sessions.byId(sessionId);
    if (existing !== null) return existing;
    const session = openApplicationSession(
      attachment,
      descriptor,
      sessionId,
      now,
    );
    this.deps.sessions.save(session);
    return session;
  }

  /** Read one session (null when unknown — honest absence). */
  readSession(sessionId: SportaId): ApplicationSession | null {
    return this.deps.sessions.byId(sessionId);
  }

  /** Append one checkpoint ref (append-only monotonic evidence). */
  checkpointSession(sessionId: SportaId, ref: string): ApplicationSession {
    const session = this.requireSession(sessionId);
    const updated = withCheckpoint(session, ref);
    this.deps.sessions.save(updated);
    return updated;
  }

  /** Close one session with the honest close-state law. */
  closeSession(sessionId: SportaId, reason: ApplicationSessionCloseReason): ApplicationSession {
    const session = this.requireSession(sessionId);
    const updated = closeApplicationSession(session, reason, this.deps.clock.now());
    this.deps.sessions.save(updated);
    return updated;
  }

  /**
   * Safe-stop (P9-20): every open session of one attachment becomes
   * revoked-mid-session — called by the environment service on
   * revocation, and available to the composition for expiry sweeps.
   */
  safeStopAttachment(attachmentId: SportaId): readonly ApplicationSession[] {
    const open = this.deps.sessions.listByAttachment(attachmentId);
    const stopped = safeStopSessions(open, attachmentId, this.deps.clock.now());
    for (const session of stopped) this.deps.sessions.save(session);
    return stopped;
  }

  private requireSession(sessionId: SportaId): ApplicationSession {
    const session = this.deps.sessions.byId(sessionId);
    if (session === null) {
      throw new ApplicationSessionError(
        `session ${sessionId} is unknown`,
        "session-unknown",
      );
    }
    return session;
  }
}

/** Convenience re-export for the close-reason vocabulary (frozen shape). */
export type { ApplicationSessionCloseReason };
