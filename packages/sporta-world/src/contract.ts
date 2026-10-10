/**
 * sporta-world — production Sports World Model seams.
 *
 * Pipeline: authorized source -> acquisition -> normalization ->
 * perception -> tracking -> calibration -> event reconstruction -> SWM.
 * Production SWM is evidence-backed; simulation never becomes production
 * truth; observations retain provenance and carry uncertainty.
 *
 * Single public entrypoint: type declarations live in the domain layer
 * and are re-exported here (entrypoint-only convention); the service and
 * adapters are re-exported for wiring. The v1 export surface is
 * unchanged; Wave 1 additions are purely additive.
 */
export type { SportsWorldModelRecord } from "@sporta/contracts/contract";

export type {
  ObservationInput,
  IngestedObservation,
  WorldModelPort,
  WorldClock,
  WorldHashFn,
} from "./domain/ports.js";

export {
  computeSnapshotHash,
  deriveObservationId,
  defaultWorldPolicy,
  isIngestibleSourceKind,
  isValidConfidence,
  policiesEqual,
  sortedUniqueIds,
} from "./domain/snapshot.js";

export {
  WorldModelError,
  ProvenanceRefusalError,
  MixedDomainError,
  InvalidObservationError,
  WorldPolicyConflictError,
} from "./domain/errors.js";

export { WorldModelService } from "./app/WorldModelService.js";

export { sha256WorldHash } from "./adapters/hash.js";
export { FixedClock, SystemClock } from "./adapters/clock.js";

// Wave 5 (w5a) — perception pipeline stages (ADDITIVE; the Wave 1
// ingestion seam above is unchanged). Pure domain functions; the
// perception stage is an honest typed transform (NO ML — see SPEC).
export type {
  AcquisitionChain,
  PerceptionFactKind,
  PerceivedPosition,
} from "./domain/pipeline/provenance.js";
export { canonicalJson, narrowConfidence } from "./domain/pipeline/provenance.js";

export type {
  MediaRef,
  AcquisitionManifest,
  AcquisitionRecord,
} from "./domain/pipeline/acquisition.js";
export { acquireSources } from "./domain/pipeline/acquisition.js";

export type {
  RawObservation,
  NormalizedObservation,
  NormalizationSeams,
} from "./domain/pipeline/normalization.js";
export { normalizeObservations } from "./domain/pipeline/normalization.js";

export type {
  EntityStateRule,
  BallStateRule,
  PerceptionRule,
  PerceivedFact,
} from "./domain/pipeline/perception.js";
export { perceiveObservations } from "./domain/pipeline/perception.js";

export type {
  TrackingParams,
  TrackedState,
  TrackGap,
  EntityTrack,
} from "./domain/pipeline/tracking.js";
export { trackEntities } from "./domain/pipeline/tracking.js";

export type {
  TimingCalibration,
  CameraAxisTransform,
  CameraMediaTransform,
  CameraCalibration,
  CalibrationParams,
  CalibratedState,
  CalibratedTrack,
} from "./domain/pipeline/calibration.js";
export { calibrateTracks } from "./domain/pipeline/calibration.js";

export type {
  ZoneBounds,
  ZoneEntryRule,
  PossessionChangeRule,
  EventReconstructionRule,
  ZoneEntryDetail,
  PossessionChangeDetail,
  ReconstructedEvent,
} from "./domain/pipeline/eventReconstruction.js";
export { reconstructEvents } from "./domain/pipeline/eventReconstruction.js";

export type { PipelinePlan, PipelineSeams, PipelineResult } from "./domain/pipeline/composition.js";
export { planPipelineObservations, runPipeline } from "./domain/pipeline/composition.js";

export {
  AcquisitionProvenanceError,
  AcquisitionRightsError,
  NormalizationError,
  PerceptionError,
  TrackingError,
  CalibrationError,
  EventReconstructionError,
  PipelineCompositionError,
} from "./domain/pipeline/errors.js";
