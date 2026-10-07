/**
 * sporta-lab — organization search, replay and candidate generation.
 *
 * The Lab optimizes "best organization for this user, this intent, this
 * source, this environment and these constraints" — never only benchmark
 * score. Simulation results never become production truth.
 *
 * Single public entrypoint. Declarations live in module-internal files
 * (src/domain/*, src/app/*) and are re-exported here — the Wave 0
 * layout. The v1 surface below is unchanged; Wave 1 additions are
 * additive (LabService, errors, population kinds).
 */
export type {
  LabPopulationKind,
  LabSearchInput,
  LabReplayInput,
  LabReplayReport,
  LabPort,
} from "./domain/ports.js";

export { POPULATION_KINDS } from "./domain/population.js";

export { LabPopulationKindError, LabWorkGraphNotFoundError } from "./domain/errors.js";

export { LabService } from "./app/labService.js";
export type { LabServiceDeps } from "./app/labService.js";

export { systemClockNow } from "./adapters/clock.js";
