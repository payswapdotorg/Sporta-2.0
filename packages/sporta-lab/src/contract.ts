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
 * additive (LabService, errors, population kinds). Wave 3 adds the
 * OrganizationCandidateReadPort read seam (contracts types re-exported
 * additively + the read service — ADR wave-3 read seams).
 */
export type {
  LabPopulationKind,
  LabSearchInput,
  LabReplayInput,
  LabReplayReport,
  LabPort,
} from "./domain/ports.js";

export type {
  OrganizationCandidateReadPort,
  OrganizationCandidateSummary,
  PromotionSummary,
  OrganizationCandidateQuery,
} from "@sporta/contracts/contract";

export { POPULATION_KINDS } from "./domain/population.js";

export { LabPopulationKindError, LabWorkGraphNotFoundError } from "./domain/errors.js";
export { LabCandidateQueryError } from "./domain/errors.js";
export { DEFAULT_CANDIDATE_LIMIT, MAX_CANDIDATE_LIMIT } from "./domain/candidateReads.js";

export { LabService } from "./app/labService.js";
export type { LabServiceDeps } from "./app/labService.js";

export { OrganizationCandidateReadService } from "./app/organizationCandidateReadService.js";
export type { OrganizationCandidateReadServiceDeps } from "./app/organizationCandidateReadService.js";

export { systemClockNow } from "./adapters/clock.js";
