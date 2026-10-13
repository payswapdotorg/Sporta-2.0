/**
 * W9C-2 — ApplicationSession lifecycle + the closeState law (domain —
 * pure, P9-19/20). A disconnected app is NEVER reported successful: the
 * frozen `closeState` vocabulary separates `disconnected` (a NON-success
 * terminal state) from `closed-clean`; active mutations hit by revocation
 * close as `revoked-mid-session` with checkpoints preserved.
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type { ApplicationSession } from "@sporta/app-environments/contract";

/** Terminal close states a session may be closed with (never "active"). */
export type ApplicationCloseState = Exclude<ApplicationSession["closeState"], "active">;

/** Input for opening one bounded session over an attachment. */
export interface OpenSessionInput {
  sessionId?: string;
  attachmentId: string;
  /** Adapter/target/app versions pinned for reproducibility. */
  versions: { app: string; adapter: string; target: string };
  openedAt?: Iso8601;
}

/** Input for closing one session (the honest terminal state). */
export interface CloseSessionInput {
  sessionId: string;
  closeState: ApplicationCloseState;
  closedAt?: Iso8601;
}

/** The allowed terminal close states, in the frozen vocabulary order. */
export const TERMINAL_CLOSE_STATES: readonly ApplicationCloseState[] = [
  "closed-clean",
  "revoked-mid-session",
  "expired",
  "disconnected",
];

/**
 * The closeState law, enforced structurally: `disconnected` is a terminal
 * NON-SUCCESS state. This predicate is exported so callers (UI, reports,
 * reconciliation) can never treat a disconnected session's actions as
 * successful — the vocabulary itself is the guard.
 */
export function isSuccessfulCloseState(closeState: ApplicationSession["closeState"]): boolean {
  return closeState === "closed-clean";
}

/** Derive the revocation safe-stop close state (P9-20). */
export function closeStateForRevocation(): ApplicationCloseState {
  return "revoked-mid-session";
}

/**
 * Apply a close to an active session. Refuses: unknown session id shape,
 * closing an already-closed session (typed caller error at the service),
 * and the non-terminal "active" close state (never valid as a close
 * TARGET). Checkpoint refs are preserved verbatim — closing never rewrites
 * history.
 */
export function closeApplicationSession(
  session: ApplicationSession,
  input: CloseSessionInput,
  now: Iso8601,
): ApplicationSession {
  if (!TERMINAL_CLOSE_STATES.includes(input.closeState)) {
    throw new Error(`unknown closeState "${String(input.closeState)}"`);
  }
  if (session.closeState !== "active") {
    throw new Error(
      `session ${session.sessionId} is already closed (${session.closeState}) — the audit trail is append-only`,
    );
  }
  return {
    ...session,
    closeState: input.closeState,
    closedAt: input.closedAt ?? now,
    checkpointRefs: [...session.checkpointRefs],
  };
}

/** Append one checkpoint ref (append-only; duplicates collapse). */
export function appendCheckpointRef(
  session: ApplicationSession,
  ref: string,
): ApplicationSession {
  if (session.checkpointRefs.includes(ref)) return session;
  return { ...session, checkpointRefs: [...session.checkpointRefs, ref] };
}

/**
 * The audit stream reference for one session — deterministic (stable over
 * the same identity inputs), so retries and re-reads agree.
 */
export function auditStreamRefFor(sessionId: string, attachmentId: string): string {
  return `audit-stream:${sessionId}:${attachmentId}`;
}
