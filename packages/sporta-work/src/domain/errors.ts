/**
 * Typed WorkGraph domain errors. Declared in the domain layer, thrown by
 * pure transitions and rethrown by the app service.
 */

/** Illegal WorkGraph status transition (skip, regression or terminal exit). */
export class WorkGraphStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkGraphStatusError";
  }
}

/** Re-opening an existing WorkGraph with a different intent. */
export class WorkGraphIntentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkGraphIntentConflictError";
  }
}

/** Appending an existing nodeId with a different node definition. */
export class WorkGraphNodeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkGraphNodeConflictError";
  }
}

/** The parent referenced by an append does not exist in the graph. */
export class WorkGraphNodeParentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkGraphNodeParentError";
  }
}

/** The referenced WorkGraph does not exist. */
export class WorkGraphNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkGraphNotFoundError";
  }
}
