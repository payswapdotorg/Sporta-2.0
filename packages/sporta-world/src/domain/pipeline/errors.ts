import { WorldModelError } from "../errors.js";

/**
 * Typed pipeline errors (domain layer — pure). Every stage refusal is
 * fail-closed, extends the Wave 1 WorldModelError base and names the
 * offending record in `detail`.
 */

/** Refused: the acquisition source declaration is not authorized. */
export class AcquisitionProvenanceError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `acquisition-provenance:${detail}`);
  }
}

/** Refused: the acquisition's rights scope cannot affirm any usage. */
export class AcquisitionRightsError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `acquisition-rights:${detail}`);
  }
}

/** Refused: a raw observation cannot be normalized (unknown media, bad timestamp, ...). */
export class NormalizationError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `normalization:${detail}`);
  }
}

/** Refused: a declared perception rule is malformed or hit mistyped data. */
export class PerceptionError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `perception:${detail}`);
  }
}

/** Refused: tracking parameters are invalid. */
export class TrackingError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `tracking:${detail}`);
  }
}

/** Refused: calibration cannot be affirmed (undeclared media, malformed params). */
export class CalibrationError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `calibration:${detail}`);
  }
}

/** Refused: an event-reconstruction rule is malformed. */
export class EventReconstructionError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `event-reconstruction:${detail}`);
  }
}

/** Refused: the pipeline composition cannot run (missing manifest, empty raws). */
export class PipelineCompositionError extends WorldModelError {
  constructor(message: string, detail: string) {
    super(message, `pipeline-composition:${detail}`);
  }
}
