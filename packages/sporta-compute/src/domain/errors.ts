import type { SportaId } from "@sporta/contracts/contract";
/**
 * Typed sporta-compute errors (domain layer — pure, no IO).
 *
 * Provider failure is a typed refusal/fallback, never semantic
 * corruption; illegal lifecycle moves are typed errors.
 */

/** Base class for all typed sporta-compute errors. */
export class ComputeError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** An illegal job state transition was attempted. */
export class IllegalJobTransitionError extends ComputeError {
  constructor(message: string, detail: string) {
    super(message, `illegal-transition:${detail}`);
  }
}

/** A job id that was never submitted was polled or mutated. */
export class UnknownComputeJobError extends ComputeError {
  readonly jobId: SportaId;

  constructor(message: string, jobId: string) {
    super(message, `unknown-job:${jobId}`);
    this.jobId = jobId;
  }
}
