/**
 * In-memory per-user preference store — fixture-grade persistence keyed
 * strictly by userRef. One record per user; records never mix users
 * (personalization boundary).
 */
import type { SportaId } from "@sporta/contracts/contract";
import type { OrganizationUserPreference } from "../domain/ports.js";
import type { UserPreferenceStorePort } from "../app/userPreferenceService.js";

export class InMemoryUserPreferenceStore implements UserPreferenceStorePort {
  private readonly preferences = new Map<SportaId, OrganizationUserPreference>();

  async read(userRef: SportaId): Promise<OrganizationUserPreference | null> {
    const preference = this.preferences.get(userRef);
    return preference === undefined ? null : clonePreference(preference);
  }

  async write(preference: OrganizationUserPreference): Promise<void> {
    this.preferences.set(preference.userRef, clonePreference(preference));
  }
}

function clonePreference(preference: OrganizationUserPreference): OrganizationUserPreference {
  return JSON.parse(JSON.stringify(preference)) as OrganizationUserPreference;
}
