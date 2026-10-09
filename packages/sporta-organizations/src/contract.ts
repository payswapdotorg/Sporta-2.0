/**
 * sporta-organizations — semantic owner of organization state.
 *
 * Organization versions are immutable after promotion. Selection is
 * explainable (invariant 17): context = intent + user + source +
 * environment + constraints. A model/provider is not an organization.
 *
 * Single public entrypoint. Declarations live in module-internal files
 * (src/domain/*, src/app/*, src/adapters/*) and are re-exported here —
 * the Wave 0 layout. The v1 surface below is unchanged; Wave 1
 * additions are additive (catalog, promotion, user preferences, service
 * and fixture adapters). Wave 3 adds the read-only promotion history
 * port + the canonical candidateId convention export (ADR wave-3 read
 * seams).
 */
export type {
  AgentBodyRecord,
  CapabilityRecord,
  OrganizationVersionRecord,
  ToolSessionRecord,
} from "@sporta/contracts/contract";

export type {
  OrganizationSelectionContext,
  OrganizationCandidate,
  SelectionFactor,
  OrganizationSelection,
  RegisterOrganizationInput,
  OrganizationResolverPort,
  OrganizationRegistryPort,
  OrganizationCatalogEntry,
  OrganizationCatalogPort,
  PromoteOrganizationInput,
  OrganizationPromotionPort,
  OrganizationPromotionHistoryPort,
  OrganizationUserPreference,
  SetUserPreferenceInput,
  UserPreferencePort,
} from "./domain/ports.js";

export {
  OrganizationImmutableError,
  OrganizationDraftConflictError,
  OrganizationVersionMonotonicError,
  OrganizationVersionNotFoundError,
  OrganizationPromotionError,
  OrganizationResolutionError,
} from "./domain/errors.js";

export { FACTOR_WEIGHTS } from "./domain/scoring.js";
export { candidateIdFor } from "./domain/registry.js";

export { OrganizationRegistryService } from "./app/organizationRegistryService.js";
export type {
  OrganizationStorePort,
  OrganizationRegistryServiceDeps,
} from "./app/organizationRegistryService.js";

export { OrganizationResolverService } from "./app/organizationResolverService.js";
export type { OrganizationResolverServiceDeps } from "./app/organizationResolverService.js";

export { UserPreferenceService } from "./app/userPreferenceService.js";
export type {
  UserPreferenceStorePort,
  UserPreferenceServiceDeps,
} from "./app/userPreferenceService.js";

export { InMemoryOrganizationStore } from "./adapters/inMemoryOrganizationStore.js";
export { InMemoryUserPreferenceStore } from "./adapters/inMemoryUserPreferenceStore.js";
export { systemClockNow } from "./adapters/clock.js";
