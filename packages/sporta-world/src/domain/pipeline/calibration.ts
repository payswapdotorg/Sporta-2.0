import type { Confidence, Iso8601, SportaId } from "@sporta/contracts/contract";
import { isValidConfidence } from "../snapshot.js";
import { CalibrationError } from "./errors.js";
import type { PerceptionFactKind, PerceivedPosition } from "./provenance.js";
import { isFiniteNumber, isPlainObject, narrowConfidence } from "./provenance.js";
import type { EntityTrack, TrackGap, TrackedState } from "./tracking.js";

/**
 * Stage 5 — calibration (domain layer — pure).
 *
 * Camera/timing alignment: typed parameters in, typed corrections out.
 * Both alignments are optional; an absent stage carries its dimension
 * unchanged. Fail-closed: when a stage is active, EVERY media ref
 * cited by the input tracks must have a declared parameter — an
 * undeclared media ref means the alignment cannot be affirmed.
 * Corrections are exact deterministic arithmetic. The gap PAIRING was
 * decided at tracking (on source timestamps); calibration corrects the
 * measurement, not the detection: each detected gap carries with its
 * bounding states' corrected timestamps and its duration is recomputed
 * from the corrected endpoints. Confidence is narrowed by the active
 * stages' declared ceilings — carry or lower only.
 */

/** Declared clock offsets per media ref (milliseconds). */
export interface TimingCalibration {
  offsetsMs: Readonly<Record<string, number>>;
  confidenceCeiling?: Confidence;
}

/** One axis-aligned axis transform: corrected = value * scale + translation. */
export interface CameraAxisTransform {
  /** Finite, non-zero. Absent = 1. */
  scale?: number;
  /** Finite. Absent = 0. */
  translation?: number;
}

/** Per-media camera transform (each axis optional; absent axis = carried). */
export interface CameraMediaTransform {
  x?: CameraAxisTransform;
  y?: CameraAxisTransform;
  z?: CameraAxisTransform;
}

/** Declared per-media camera alignment transforms. */
export interface CameraCalibration {
  transforms: Readonly<Record<string, CameraMediaTransform>>;
  confidenceCeiling?: Confidence;
}

/** Calibration parameters — both alignments optional (absent = carried). */
export interface CalibrationParams {
  timing?: TimingCalibration;
  camera?: CameraCalibration;
}

/** One calibrated state (corrected timestamp/position, narrowed confidence). */
export interface CalibratedState {
  factId: SportaId;
  observationId: SportaId;
  mediaRef: SportaId;
  position: PerceivedPosition;
  possession?: SportaId;
  /** Corrected when timing is active (re-serialized ISO-8601); else carried. */
  capturedAt: Iso8601;
  confidence: Confidence;
}

/** A calibrated track — 1:1 with its input track, corrections applied. */
export interface CalibratedTrack {
  trackId: SportaId;
  entityId: SportaId;
  kind: PerceptionFactKind;
  states: readonly CalibratedState[];
  gaps: readonly TrackGap[];
  confidence: Confidence;
  acquisitionIds: readonly SportaId[];
}

/**
 * Calibrate a batch of tracks. Output order preserves the input track
 * order (tracks arrive sorted by trackId). Params are validated even
 * when the batch is empty.
 */
export function calibrateTracks(
  tracks: readonly EntityTrack[],
  params: CalibrationParams,
): CalibratedTrack[] {
  const safeParams = params ?? {};
  const timing = safeParams.timing;
  const camera = safeParams.camera;
  validateParams(timing, camera);
  if (tracks.length === 0) return [];
  const calibrated: CalibratedTrack[] = [];
  for (const track of tracks) {
    // Fail-closed: an active stage must affirm every cited media ref.
    if (timing !== undefined) {
      for (const state of track.states) {
        if (!Object.hasOwn(timing.offsetsMs, state.mediaRef)) {
          throw new CalibrationError(
            `timing calibration declares no offset for media "${state.mediaRef}" (cited by track "${track.trackId}")`,
            `undeclared-media:${state.mediaRef}`,
          );
        }
      }
    }
    if (camera !== undefined) {
      for (const state of track.states) {
        if (!Object.hasOwn(camera.transforms, state.mediaRef)) {
          throw new CalibrationError(
            `camera calibration declares no transform for media "${state.mediaRef}" (cited by track "${track.trackId}")`,
            `undeclared-media:${state.mediaRef}`,
          );
        }
      }
    }
    calibrated.push(calibrateTrack(track, timing, camera));
  }
  return calibrated;
}

function validateParams(
  timing: TimingCalibration | undefined,
  camera: CameraCalibration | undefined,
): void {
  if (timing !== undefined) {
    if (!isPlainObject(timing) || !isPlainObject(timing.offsetsMs)) {
      throw new CalibrationError("timing calibration must declare an offsetsMs object", "offsets");
    }
    for (const [mediaId, offset] of Object.entries(timing.offsetsMs)) {
      if (!isFiniteNumber(offset)) {
        throw new CalibrationError(
          `timing offset for media "${mediaId}" must be a finite number`,
          `offset:${mediaId}`,
        );
      }
    }
    if (timing.confidenceCeiling !== undefined && !isValidConfidence(timing.confidenceCeiling)) {
      throw new CalibrationError(
        `timing confidenceCeiling ${timing.confidenceCeiling} is outside [0, 1]`,
        `ceiling:${timing.confidenceCeiling}`,
      );
    }
  }
  if (camera !== undefined) {
    if (!isPlainObject(camera) || !isPlainObject(camera.transforms)) {
      throw new CalibrationError(
        "camera calibration must declare a transforms object",
        "transforms",
      );
    }
    for (const [mediaId, mediaTransform] of Object.entries(camera.transforms)) {
      validateMediaTransform(mediaId, mediaTransform);
    }
    if (camera.confidenceCeiling !== undefined && !isValidConfidence(camera.confidenceCeiling)) {
      throw new CalibrationError(
        `camera confidenceCeiling ${camera.confidenceCeiling} is outside [0, 1]`,
        `ceiling:${camera.confidenceCeiling}`,
      );
    }
  }
}

function validateMediaTransform(mediaId: string, mediaTransform: unknown): void {
  if (!isPlainObject(mediaTransform)) {
    throw new CalibrationError(
      `camera transform for media "${mediaId}" must be an object`,
      `transform:${mediaId}`,
    );
  }
  for (const axisName of ["x", "y", "z"] as const) {
    const axis = mediaTransform[axisName];
    if (axis === undefined) continue;
    if (!isPlainObject(axis)) {
      throw new CalibrationError(
        `camera ${axisName}-axis transform for media "${mediaId}" must be an object`,
        `axis:${mediaId}:${axisName}`,
      );
    }
    if (axis.scale !== undefined && (!isFiniteNumber(axis.scale) || axis.scale === 0)) {
      throw new CalibrationError(
        `camera ${axisName}-axis scale for media "${mediaId}" must be finite and non-zero`,
        `scale:${mediaId}:${axisName}`,
      );
    }
    if (axis.translation !== undefined && !isFiniteNumber(axis.translation)) {
      throw new CalibrationError(
        `camera ${axisName}-axis translation for media "${mediaId}" must be a finite number`,
        `translation:${mediaId}:${axisName}`,
      );
    }
  }
}

function calibrateTrack(
  track: EntityTrack,
  timing: TimingCalibration | undefined,
  camera: CameraCalibration | undefined,
): CalibratedTrack {
  const states = track.states.map((state) => calibrateState(state, timing, camera));
  // Correct each DETECTED gap with its bounding states' corrected
  // timestamps (the pairing itself was decided at tracking).
  const gaps: TrackGap[] = [];
  let gapIndex = 0;
  let previous: { source: TrackedState; calibrated: CalibratedState } | undefined;
  for (let index = 0; index < track.states.length; index += 1) {
    const sourceState = track.states[index];
    const calibratedState = states[index];
    if (sourceState === undefined || calibratedState === undefined) continue; // parallel arrays
    if (previous !== undefined) {
      const detected = track.gaps[gapIndex];
      if (
        detected !== undefined &&
        detected.fromCapturedAt === previous.source.capturedAt &&
        detected.toCapturedAt === sourceState.capturedAt
      ) {
        gaps.push({
          fromCapturedAt: previous.calibrated.capturedAt,
          toCapturedAt: calibratedState.capturedAt,
          gapMs:
            Date.parse(calibratedState.capturedAt) - Date.parse(previous.calibrated.capturedAt),
        });
        gapIndex += 1;
      }
    }
    previous = { source: sourceState, calibrated: calibratedState };
  }
  return {
    trackId: track.trackId,
    entityId: track.entityId,
    kind: track.kind,
    states,
    gaps,
    confidence: narrowConfidence(
      track.confidence,
      timing?.confidenceCeiling,
      camera?.confidenceCeiling,
    ),
    acquisitionIds: [...track.acquisitionIds],
  };
}

function calibrateState(
  state: TrackedState,
  timing: TimingCalibration | undefined,
  camera: CameraCalibration | undefined,
): CalibratedState {
  const capturedAt =
    timing === undefined
      ? state.capturedAt
      : new Date(
          Date.parse(state.capturedAt) + (timing.offsetsMs[state.mediaRef] ?? 0),
        ).toISOString();
  const mediaTransform = camera === undefined ? undefined : camera.transforms[state.mediaRef];
  const calibrated: CalibratedState = {
    factId: state.factId,
    observationId: state.observationId,
    mediaRef: state.mediaRef,
    position: correctPosition(state.position, mediaTransform),
    capturedAt,
    confidence: narrowConfidence(
      state.confidence,
      timing?.confidenceCeiling,
      camera?.confidenceCeiling,
    ),
  };
  if (state.possession !== undefined) calibrated.possession = state.possession;
  return calibrated;
}

function correctPosition(
  position: PerceivedPosition,
  transform: CameraMediaTransform | undefined,
): PerceivedPosition {
  const corrected: PerceivedPosition = {
    x: correctAxis(position.x, transform?.x),
    y: correctAxis(position.y, transform?.y),
  };
  if (position.z !== undefined) {
    corrected.z = correctAxis(position.z, transform?.z);
  }
  return corrected;
}

function correctAxis(value: number, transform: CameraAxisTransform | undefined): number {
  if (transform === undefined) return value; // declared identity / axis carried
  return value * (transform.scale ?? 1) + (transform.translation ?? 0);
}
