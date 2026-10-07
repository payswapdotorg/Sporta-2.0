/**
 * UserPreferenceService — app-layer per-user preference records (A5
 * personalization boundary seed). Idempotent per userRef: re-setting
 * identical signals returns the stored record unchanged (the original
 * updatedAt is kept); only changed signals write.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  OrganizationUserPreference,
  SetUserPreferenceInput,
  UserPreferencePort,
} from "../domain/ports.js";
import { stableEquals } from "../domain/stable.js";

/**
 * Persistence port (module-internal): a per-user preference store. One
 * record per userRef — a user's preference is never stored inside
 * another user's record.
 */
export interface UserPreferenceStorePort {
  read(userRef: SportaId): Promise<OrganizationUserPreference | null>;
  write(preference: OrganizationUserPreference): Promise<void>;
}

export interface UserPreferenceServiceDeps {
  store: UserPreferenceStorePort;
  /** Injectable ISO-8601 clock (fixtures inject a fixed clock). */
  now: () => string;
}

function preferenceFrom(
  input: SetUserPreferenceInput,
  updatedAt: string,
): OrganizationUserPreference {
  const preference: OrganizationUserPreference = { userRef: input.userRef, updatedAt };
  if (input.preferredOrganizationId !== undefined) {
    preference.preferredOrganizationId = input.preferredOrganizationId;
  }
  if (input.preferredEnvironmentProfile !== undefined) {
    preference.preferredEnvironmentProfile = input.preferredEnvironmentProfile;
  }
  return preference;
}

export class UserPreferenceService implements UserPreferencePort {
  private readonly store: UserPreferenceStorePort;
  private readonly now: () => string;

  constructor(deps: UserPreferenceServiceDeps) {
    this.store = deps.store;
    this.now = deps.now;
  }

  async getPreference(userRef: SportaId): Promise<OrganizationUserPreference | null> {
    return this.store.read(userRef);
  }

  async setPreference(input: SetUserPreferenceInput): Promise<OrganizationUserPreference> {
    const existing = await this.store.read(input.userRef);
    const next = preferenceFrom(input, this.now());
    if (existing !== null && stableEquals(stripTimestamp(existing), stripTimestamp(next))) {
      return existing;
    }
    await this.store.write(next);
    return next;
  }
}

/** Compare preference signals only (updatedAt is metadata, not a signal). */
function stripTimestamp(preference: OrganizationUserPreference): {
  userRef: SportaId;
  preferredOrganizationId?: SportaId;
  preferredEnvironmentProfile?: string;
} {
  return {
    userRef: preference.userRef,
    preferredOrganizationId: preference.preferredOrganizationId,
    preferredEnvironmentProfile: preference.preferredEnvironmentProfile,
  };
}
