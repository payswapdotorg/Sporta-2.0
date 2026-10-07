/**
 * In-memory organization registry store — deterministic fixture-grade
 * persistence. Never production truth. Defensive JSON clones keep store
 * boundaries honest. Sorted list() output is deterministic.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type { StoredOrganizationVersion } from "../domain/registry.js";
import type { OrganizationStorePort } from "../app/organizationRegistryService.js";

export class InMemoryOrganizationStore implements OrganizationStorePort {
  private readonly entries = new Map<string, StoredOrganizationVersion>();

  async read(organizationId: SportaId, version: number): Promise<StoredOrganizationVersion | null> {
    const entry = this.entries.get(`${organizationId}#${version}`);
    return entry === undefined ? null : cloneEntry(entry);
  }

  async list(): Promise<readonly StoredOrganizationVersion[]> {
    return [...this.entries.values()]
      .map((entry) => cloneEntry(entry))
      .sort(
        (left, right) =>
          left.record.organizationId.localeCompare(right.record.organizationId) ||
          left.record.version - right.record.version,
      );
  }

  async write(entry: StoredOrganizationVersion): Promise<void> {
    this.entries.set(`${entry.record.organizationId}#${entry.record.version}`, cloneEntry(entry));
  }
}

function cloneEntry(entry: StoredOrganizationVersion): StoredOrganizationVersion {
  return JSON.parse(JSON.stringify(entry)) as StoredOrganizationVersion;
}
