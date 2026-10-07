/**
 * OrganizationResolverService — deterministic explainable organization
 * selection. Only PROMOTED versions are resolution candidates (drafts are
 * Lab material). Personalization is structurally isolated: the only
 * preference ever fetched is `getPreference(context.userRef)`.
 */
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import type {
  OrganizationCatalogPort,
  OrganizationResolverPort,
  OrganizationSelection,
  OrganizationSelectionContext,
  OrganizationUserPreference,
  UserPreferencePort,
} from "../domain/ports.js";
import { resolveOrganizationSelection } from "../domain/scoring.js";

export interface OrganizationResolverServiceDeps {
  catalog: OrganizationCatalogPort;
  preferences: UserPreferencePort;
}

export class OrganizationResolverService implements OrganizationResolverPort {
  private readonly catalog: OrganizationResolverServiceDeps["catalog"];
  private readonly preferences: UserPreferencePort;

  constructor(deps: OrganizationResolverServiceDeps) {
    this.catalog = deps.catalog;
    this.preferences = deps.preferences;
  }

  async resolve(context: OrganizationSelectionContext): Promise<OrganizationSelection> {
    const entries = await this.catalog.listVersions();
    const records: OrganizationVersionRecord[] = entries
      .filter((entry) => entry.promoted)
      .map((entry) => entry.record);
    const preference: OrganizationUserPreference | null = context.userRef
      ? await this.preferences.getPreference(context.userRef)
      : null;
    return resolveOrganizationSelection(records, context, preference);
  }
}
