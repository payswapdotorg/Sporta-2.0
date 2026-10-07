/**
 * Typed organization domain errors. Declared in the domain layer, thrown
 * by pure registry/scoring transitions and rethrown by the app services.
 */

/** A promoted organization version is immutable; mutation was attempted. */
export class OrganizationImmutableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationImmutableError";
  }
}

/** Re-registering an existing draft version with different content. */
export class OrganizationDraftConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDraftConflictError";
  }
}

/** Non-monotonic (non-contiguous) version registration for an organization. */
export class OrganizationVersionMonotonicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationVersionMonotonicError";
  }
}

/** The referenced organization version does not exist. */
export class OrganizationVersionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationVersionNotFoundError";
  }
}

/** A promotion gate failed (evidence/policy). Promotion is refused. */
export class OrganizationPromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationPromotionError";
  }
}

/** Resolution cannot select an organization (no promoted candidates). */
export class OrganizationResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationResolutionError";
  }
}
