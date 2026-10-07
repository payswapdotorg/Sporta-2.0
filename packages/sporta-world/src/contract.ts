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
