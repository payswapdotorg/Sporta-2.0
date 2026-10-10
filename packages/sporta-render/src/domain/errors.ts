/**
 * Typed sporta-render errors (domain layer — pure, no IO).
 *
 * The renderer boundary is fail-closed: malformed record fields are
 * typed refusals, never silently carried, and rights are never widened.
 */

/** Base class for all typed sporta-render errors. */
export class RenderModelError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/**
 * Refused: a consumed confidence value lies outside [0, 1] — the
 * `Confidence` primitive's documented range. The world module's
 * `isValidConfidence` law, mirrored at the renderer boundary.
 */
export class RenderInputError extends RenderModelError {
  constructor(message: string, detail: string) {
    super(message, `invalid-input:${detail}`);
  }
}

/**
 * Refused: the snapshot's rights do not affirmatively permit a declared
 * usage of the caller's usage context (fail-closed invariant-22 gate —
 * renderers never widen rights).
 */
export class RenderRightsRefusalError extends RenderModelError {
  constructor(message: string, detail: string) {
    super(message, `rights-refused:${detail}`);
  }
}
