import type { SportaId } from "@sporta/contracts/contract";
import { EditorError } from "../errors.js";
/**
 * Typed live/shared editor-session errors (domain layer — pure, no IO).
 *
 * Level-3 coordination failures are typed refusals, never silent
 * degradation: conflicts carry BOTH divergent revision ids so callers
 * (and tests) can see exactly which bases diverged.
 */

/** Base class for all typed shared-session errors. */
export class SharedSessionError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, detail);
  }
}

/**
 * Admission refused (fail-closed): absent/empty usage context, a context
 * that does not declare "edit", checkpoint rights that do not carry the
 * context, a prohibited usage inside a mixed context, a non-live
 * broadcaster, or an incoherent usage/history gate at open.
 */
export class SharedSessionAdmissionError extends SharedSessionError {
  constructor(message: string, detail: string) {
    super(message, `shared-admission-refused:${detail}`);
  }
}

/**
 * A delta's base revision no longer matches the session head (or a
 * reconcile landed on a head the service did not advance). Carries the
 * divergent revision ids — never merged, never guessed.
 */
export class SharedSessionConflictError extends SharedSessionError {
  /** The revision the shared session is currently based on. */
  readonly sessionHeadRevisionId: SportaId;
  /** The (stale or foreign) revision the incoming delta was based on. */
  readonly deltaBaseRevisionId: SportaId;

  constructor(message: string, sessionHeadRevisionId: string, deltaBaseRevisionId: string) {
    super(
      message,
      `shared-conflict:sessionHead=${sessionHeadRevisionId}:deltaBase=${deltaBaseRevisionId}`,
    );
    this.sessionHeadRevisionId = sessionHeadRevisionId;
    this.deltaBaseRevisionId = deltaBaseRevisionId;
  }
}

/** The shared session is closed; live transitions are refused. */
export class SharedSessionClosedError extends SharedSessionError {
  readonly sessionId: SportaId;

  constructor(message: string, sessionId: string) {
    super(message, `shared-session-closed:${sessionId}`);
    this.sessionId = sessionId;
  }
}

/** The shared session id does not exist. */
export class UnknownSharedSessionError extends SharedSessionError {
  readonly sessionId: SportaId;

  constructor(message: string, sessionId: string) {
    super(message, `unknown-shared-session:${sessionId}`);
    this.sessionId = sessionId;
  }
}

/** The participant id is not admitted to the shared session. */
export class UnknownSharedParticipantError extends SharedSessionError {
  readonly participantId: string;

  constructor(message: string, participantId: string) {
    super(message, `unknown-shared-participant:${participantId}`);
    this.participantId = participantId;
  }
}

/**
 * The broadcast log violates the total-order invariant (sequences not
 * contiguous ascending, or duplicate delta ids/sequences) — the
 * coordination state is corrupted or forged, and the seam refuses.
 */
export class SharedSessionOrderError extends SharedSessionError {
  constructor(message: string, detail: string) {
    super(message, `shared-order:${detail}`);
  }
}

/** A durable shared-session ledger entry failed its integrity checks. */
export class SharedSessionIntegrityError extends SharedSessionError {
  constructor(message: string, detail: string) {
    super(message, `shared-integrity:${detail}`);
  }
}
