/**
 * Typed playback errors (domain layer — pure, no IO).
 *
 * Every illegal playback input is a typed refusal carrying a
 * machine-readable detail (the invariant-17 law: failure is a typed
 * refusal, never semantic corruption). Validation precedes mutation —
 * a refused construction or call leaves no trace.
 */

/** Base class for all typed playback errors. */
export class PlaybackError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** Refused: no timelines at all, or a timeline declaring zero events. */
export class EmptyTimelineError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `empty-timeline:${detail}`);
  }
}

/** Refused: a timeline event is malformed (id/atMs/durationMs/payloadRefs). */
export class MalformedTimelineEventError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `malformed-event:${detail}`);
  }
}

/** Refused: the carry-forward header is malformed (fields, confidence bounds). */
export class MalformedCarryForwardError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `malformed-carry:${detail}`);
  }
}

/** Refused: a timeline kind is outside the v1 reality vocabulary. */
export class UnknownRealityKindError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `unknown-kind:${detail}`);
  }
}

/** Refused: the same reality kind is declared by more than one timeline. */
export class DuplicateRealityKindError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `duplicate-kind:${detail}`);
  }
}

/** Refused: carry-forward headers disagree across timelines (one session = one snapshot). */
export class TimelineCarryMismatchError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `carry-mismatch:${detail}`);
  }
}

/** Refused: controller options are invalid (tickMs / capacity / default duration). */
export class InvalidPlaybackOptionsError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `invalid-options:${detail}`);
  }
}

/** Refused: seek/frameAt target outside [0, durationMs]. */
export class OutOfRangeSeekError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `out-of-range-seek:${detail}`);
  }
}

/** Refused: step destination outside the tick range. */
export class OutOfRangeStepError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `out-of-range-step:${detail}`);
  }
}

/** Refused: play rate is not a finite number > 0. */
export class InvalidRateError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `invalid-rate:${detail}`);
  }
}

/** Refused: step delta is not a finite integer. */
export class InvalidStepError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `invalid-step:${detail}`);
  }
}

/** Refused: advance while paused. */
export class PlaybackPausedError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `paused:${detail}`);
  }
}

/** Refused: advance dt is not a finite number >= 0. */
export class InvalidAdvanceError extends PlaybackError {
  constructor(message: string, detail: string) {
    super(message, `invalid-advance:${detail}`);
  }
}
