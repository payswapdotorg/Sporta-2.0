/**
 * sporta-organizations public types and ports (declarations).
 *
 * Declarations live in this module-internal file; `src/contract.ts` is
 * the single public entrypoint re-exporting this surface (Wave 0
 * layout). The v1 surface (OrganizationSelectionContext,
 * OrganizationCandidate, SelectionFactor, OrganizationSelection,
 * RegisterOrganizationInput, OrganizationResolverPort,
 * OrganizationRegistryPort) moved here verbatim; Wave 1 additions
 * (catalog, promotion, user preferences) are additive.
 */
import type {
  IntentSpec,
  Iso8601,
  PromotionRecord,
  SportaId,
  WorkGraphRecord,
  OrganizationVersionRecord,
} from "@sporta/contracts/contract";

/** Context in which an organization is selected. */
export interface OrganizationSelectionContext {
  intent: IntentSpec;
  workGraph: WorkGraphRecord;
  userRef?: SportaId;
  environmentProfile: string;
  constraints: readonly string[];
}

/** One candidate with evidence-backed rationale (never a single metric). */
export interface OrganizationCandidate {
  organization: OrganizationVersionRecord;
  rationale: string;
  evidence: readonly SportaId[];
}

/** One explainability factor. */
export interface SelectionFactor {
  factor: string;
  weight: number;
  detail: string;
}

/** Explainable selection result. */
export interface OrganizationSelection {
  selected: OrganizationCandidate;
  candidates: readonly OrganizationCandidate[];
  explanation: readonly SelectionFactor[];
}

/** Input for registering a draft (pre-promotion) organization version. */
export interface RegisterOrganizationInput {
  record: OrganizationVersionRecord;
}

/** Resolves the organization to perform work. Deterministic for equal inputs. */
export interface OrganizationResolverPort {
  resolve(context: OrganizationSelectionContext): Promise<OrganizationSelection>;
}

/** Append-only organization registry. Promoted versions are immutable. */
export interface OrganizationRegistryPort {
  registerDraft(input: RegisterOrganizationInput): Promise<OrganizationVersionRecord>;
  readVersion(organizationId: SportaId, version: number): Promise<OrganizationVersionRecord | null>;
}

/** One registry entry as visible to catalogs (Lab, resolver). */
export interface OrganizationCatalogEntry {
  record: OrganizationVersionRecord;
  promoted: boolean;
}

/**
 * Read access to the registry for candidate discovery. Deterministic
 * order: (organizationId asc, version asc).
 */
export interface OrganizationCatalogPort {
  listVersions(): Promise<readonly OrganizationCatalogEntry[]>;
}

/** Input for promoting a draft version (minimal A6 immutable path). */
export interface PromoteOrganizationInput {
  organizationId: SportaId;
  version: number;
  /** Evidence justifying the promotion; falls back to the record's evidence. */
  evidence?: readonly SportaId[];
}

/** Promotion lifecycle (evidence + policy gated, immutable once granted). */
export interface OrganizationPromotionPort {
  promote(input: PromoteOrganizationInput): Promise<PromotionRecord>;
}

/**
 * Wave 3 additive — read-only promotion history for the Lab's
 * OrganizationCandidateReadPort seam (ADR wave-3 read seams). Lists the
 * immutable PromotionRecords the registry has granted, deterministic
 * order: (organizationId asc, version asc). Module-internal catalog
 * granularity (like OrganizationCatalogPort.listVersions); the bounded
 * read lives at the consuming seam, not here.
 */
export interface OrganizationPromotionHistoryPort {
  listPromotionRecords(): Promise<readonly PromotionRecord[]>;
}

/** Per-user preference record (personalization boundary, A5). */
export interface OrganizationUserPreference {
  userRef: SportaId;
  preferredOrganizationId?: SportaId;
  preferredEnvironmentProfile?: string;
  updatedAt: Iso8601;
}

/** Input for setting one user's preference (idempotent per userRef). */
export interface SetUserPreferenceInput {
  userRef: SportaId;
  preferredOrganizationId?: SportaId;
  preferredEnvironmentProfile?: string;
}

/**
 * Per-user preference store. Preferences are scoped to `userRef` and are
 * only ever fetched for the user the caller names — never applied on
 * behalf of another user (personalization boundary invariant).
 */
export interface UserPreferencePort {
  getPreference(userRef: SportaId): Promise<OrganizationUserPreference | null>;
  setPreference(input: SetUserPreferenceInput): Promise<OrganizationUserPreference>;
}
