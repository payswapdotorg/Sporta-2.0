/**
 * sporta-arena typed error taxonomy (domain layer — pure, no IO).
 *
 * All failures of this module are typed errors extending `ArenaError`
 * and are re-exported through the public contract so consumers can
 * catch them without importing module-internal files.
 */
import type { CapabilityGapRecord } from "@sporta/contracts/contract";

/** Base class of every sporta-arena failure. */
export class ArenaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** A retry with the same gapId but a different payload (first write wins). */
export class GapConflictError extends ArenaError {
  constructor(readonly gapId: string) {
    super(`capability gap ${gapId} already exists with different content`);
  }
}

/** Escalation referenced a gap this client never recorded. */
export class UnknownGapError extends ArenaError {
  constructor(readonly gapId: string) {
    super(`unknown capability gap: ${gapId}`);
  }
}

/** A retry with the same idempotencyKey but a different payload. */
export class EscalationConflictError extends ArenaError {
  constructor(readonly idempotencyKey: string) {
    super(`idempotency key ${idempotencyKey} already used with a different escalation payload`);
  }
}

/**
 * Escalation input violates an Arena session safety policy (e.g. empty
 * permittedActions — Arena sessions are isolated capsules and never
 * receive unrestricted actions).
 */
export class EscalationPolicyError extends ArenaError {
  constructor(message: string) {
    super(message);
  }
}

/** Illegal capability-gap status transition. */
export class IllegalGapTransitionError extends ArenaError {
  constructor(
    readonly from: CapabilityGapRecord["status"],
    readonly to: CapabilityGapRecord["status"],
  ) {
    super(`illegal capability-gap transition: ${from} -> ${to}`);
  }
}

/** Illegal Arena escalation lifecycle transition. */
export class IllegalEscalationTransitionError extends ArenaError {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`illegal Arena escalation lifecycle transition: ${from} -> ${to}`);
  }
}

/**
 * W4C-2 (invariant 22 — C6 rights propagation on the read plane): a
 * DIRECT read was refused because the caller's declared usage context is
 * not permitted by the target record's PolicySet. Typed refusal, never a
 * silent null — a refusal must be distinguishable from "no result yet".
 * Listings never throw this; they exclude prohibited records instead
 * (honest absence — the W3-B listing tradeoff, documented per surface in
 * escalationReadSeam.ts and the package spec).
 */
export class ArenaReadRefusalError extends ArenaError {
  constructor(
    readonly escalationId: string,
    readonly usages: readonly string[],
  ) {
    super(
      `arena read refused: usage [${usages.join(", ")}] is not permitted for escalation ${escalationId} (invariant 22)`,
    );
  }
}
