/**
 * sporta-product typed error taxonomy (domain layer — pure, no IO).
 */
import type { SportaId } from "@sporta/contracts/contract";

/** Base class of every sporta-product failure. */
export class ProductShellError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The product shell was asked to project a WorkGraph it cannot read. */
export class UnknownWorkGraphError extends ProductShellError {
  constructor(readonly workGraphId: SportaId) {
    super(`unknown work graph: ${workGraphId}`);
  }
}

/** The user explicitly denied learning consent — no artifact is created. */
export class LearningConsentRefusedError extends ProductShellError {
  constructor(
    readonly workGraphId: SportaId,
    readonly userId: SportaId,
  ) {
    super(
      `learning consent denied by user ${userId} for work graph ${workGraphId} — no learning artifact is created`,
    );
  }
}

/** The consent scopes are empty or exceed the work graph learning policy. */
export class LearningScopeError extends ProductShellError {
  constructor(message: string) {
    super(message);
  }
}
