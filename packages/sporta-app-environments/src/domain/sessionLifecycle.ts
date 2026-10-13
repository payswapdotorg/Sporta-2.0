/**
 * Bounded ApplicationSession lifecycle (domain — pure, W9C-4).
 *
 * closeState law: a disconnected app is NEVER "successful"
 * (P9-19 / application-environment contract). `closed-clean` exists
 * only on an explicit clean close; revocation under an open session
 * is `revoked-mid-session`; grant expiry under it is `expired`; a
 * failed target probe is `disconnected`. A session that reached an
 * honest non-clean close state is NEVER downgraded by a later close
 * attempt (the honest state wins).
 */
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type {
  ApplicationAttachment,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import { ApplicationSessionError } from "./errors.js";
import { attachmentStatus } from "./grants.js";

/** Why a session is closing (mapped onto the frozen close states). */
export type ApplicationSessionCloseReason = "clean" | "revoked" | "expired" | "disconnected";

/** Deterministic audit-stream ref for one session. */
export function auditStreamRefFor(sessionId: SportaId): string {
  return `audit-stream:${sessionId}`;
}

/**
 * Open a bounded session over one ACTIVE attachment. The grants
 * snapshot is the attachment's granted classes at open time; the
 * target/adapter/app versions come from the descriptor (reproducible
 * session identity).
 */
export function openApplicationSession(
  attachment: ApplicationAttachment,
  descriptor: {
    appVersion: string;
    providerAdapterId: string;
    targetIdentity: string;
  },
  sessionId: SportaId,
  now: Iso8601,
): ApplicationSession {
  const status = attachmentStatus(attachment, now);
  if (!status.active) {
    throw new ApplicationSessionError(
      `attachment ${attachment.attachmentId} is ${status.reason} — sessions open only over active grants`,
      `attachment-${status.reason}`,
    );
  }
  return {
    sessionId,
    attachmentId: attachment.attachmentId,
    versions: {
      app: descriptor.appVersion,
      adapter: descriptor.providerAdapterId,
      target: descriptor.targetIdentity,
    },
    activeGrants: [...attachment.grantedCapabilityClasses],
    openedAt: now,
    closedAt: null,
    closeState: "active",
    checkpointRefs: [],
    auditStreamRef: auditStreamRefFor(sessionId),
  };
}

/**
 * Append one checkpoint ref (append-only: duplicates and reordering
 * are refused — the checkpoint trail is monotonic evidence).
 */
export function withCheckpoint(
  session: ApplicationSession,
  ref: string,
): ApplicationSession {
  if (session.closeState !== "active") {
    throw new ApplicationSessionError(
      `session ${session.sessionId} is ${session.closeState} — closed sessions never checkpoint`,
      "session-closed",
    );
  }
  if (ref.length === 0) {
    throw new ApplicationSessionError("checkpoint ref must be non-empty", "checkpoint-malformed");
  }
  if (session.checkpointRefs.includes(ref)) return session;
  return { ...session, checkpointRefs: [...session.checkpointRefs, ref] };
}

/** The frozen close state one close reason maps onto. */
export function closeStateFor(reason: ApplicationSessionCloseReason): ApplicationSession["closeState"] {
  switch (reason) {
    case "clean":
      return "closed-clean";
    case "revoked":
      return "revoked-mid-session";
    case "expired":
      return "expired";
    case "disconnected":
      return "disconnected";
  }
}

/**
 * Close a session. HONESTY LAW: once a session holds a non-clean
 * close state (revoked-mid-session / expired / disconnected), a later
 * "clean" close NEVER rewrites it — the honest state is durable. A
 * clean close on an active session is the only path to
 * "closed-clean". Idempotent per resulting state.
 */
export function closeApplicationSession(
  session: ApplicationSession,
  reason: ApplicationSessionCloseReason,
  now: Iso8601,
): ApplicationSession {
  if (session.closeState !== "active") {
    if (reason === "clean" && session.closeState !== "closed-clean") {
      // Never downgrade an honest non-clean close.
      return session;
    }
    return session;
  }
  return {
    ...session,
    closedAt: now,
    closeState: closeStateFor(reason),
  };
}

/**
 * Safe-stop law (P9-20): revoking a grant must mark every open
 * session of that attachment `revoked-mid-session` — new actions are
 * blocked (the admission ladder) and the session state is honest.
 */
export function safeStopSessions(
  sessions: readonly ApplicationSession[],
  attachmentId: SportaId,
  now: Iso8601,
): readonly ApplicationSession[] {
  return sessions.map((session) =>
    session.attachmentId === attachmentId && session.closeState === "active"
      ? closeApplicationSession(session, "revoked", now)
      : session,
  );
}

/**
 * The success-law predicate every action record must respect: no
 * action may be recorded as succeeded against a session that closed
 * disconnected (P9-19 — a disconnected app is never "successful").
 */
export function sessionMayReportSuccess(session: ApplicationSession): boolean {
  return session.closeState !== "disconnected";
}
