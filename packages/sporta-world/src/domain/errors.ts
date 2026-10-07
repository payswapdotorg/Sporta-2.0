/**
 * Typed sporta-world errors (domain layer — pure, no IO).
 *
 * The SWM production-truth boundary refuses anything that is not
 * evidence-backed authorized input.
 */

/** Base class for all typed sporta-world errors. */
export class WorldModelError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** Refused: provenance source kind may not enter production truth. */
export class ProvenanceRefusalError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `provenance-refused:${detail}`);
  }
}

/** Refused: observations in one batch declare mixed event domains. */
export class MixedDomainError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `mixed-domain:${detail}`);
  }
}

/** Refused: an observation field is invalid (e.g. confidence bounds). */
export class InvalidObservationError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `invalid-observation:${detail}`);
  }
}

/** Refused: an explicit policy conflicts with the snapshot's policy. */
export class WorldPolicyConflictError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `policy-conflict:${detail}`);
  }
}
