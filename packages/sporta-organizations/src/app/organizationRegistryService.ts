/**
 * OrganizationRegistryService — app-layer orchestrator implementing the
 * registry, catalog and promotion ports over an injected store port and
 * injectable clock. Domain semantics live in src/domain (pure).
 */
import type { Iso8601, PromotionRecord, SportaId } from "@sporta/contracts/contract";
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import type {
  OrganizationCatalogEntry,
  OrganizationCatalogPort,
  OrganizationDecisionPort,
  OrganizationPromotionHistoryPort,
  OrganizationPromotionPort,
  OrganizationRegistryPort,
  PromoteOrganizationInput,
  RejectCandidateInput,
  RegisterOrganizationInput,
  RollbackPromotionInput,
} from "../domain/ports.js";
import {
  promoteStoredVersion,
  rejectStoredCandidate,
  registerDraftInState,
  rollbackStoredPromotion,
  type StoredOrganizationVersion,
} from "../domain/registry.js";
import { OrganizationVersionNotFoundError } from "../domain/errors.js";

/**
 * Persistence port (module-internal). Per-version read/list/write; the
 * in-memory adapter implements it fixture-grade.
 */
export interface OrganizationStorePort {
  read(organizationId: SportaId, version: number): Promise<StoredOrganizationVersion | null>;
  list(): Promise<readonly StoredOrganizationVersion[]>;
  write(entry: StoredOrganizationVersion): Promise<void>;
}

export interface OrganizationRegistryServiceDeps {
  store: OrganizationStorePort;
  /** Injectable ISO-8601 clock (fixtures inject a fixed clock). */
  now: () => string;
}

/** The single canonical writer of organization version state. */
export class OrganizationRegistryService
  implements
    OrganizationRegistryPort,
    OrganizationCatalogPort,
    OrganizationPromotionPort,
    OrganizationPromotionHistoryPort,
    OrganizationDecisionPort
{
  private readonly store: OrganizationStorePort;
  private readonly now: () => string;

  constructor(deps: OrganizationRegistryServiceDeps) {
    this.store = deps.store;
    this.now = deps.now;
  }

  async registerDraft(input: RegisterOrganizationInput): Promise<OrganizationVersionRecord> {
    const entries = await this.store.list();
    const state = new Map(
      entries.map((entry) => [`${entry.record.organizationId}#${entry.record.version}`, entry]),
    );
    const result = registerDraftInState(state, input.record);
    if (result.created) {
      await this.store.write({ record: result.record, promoted: false });
    }
    return result.record;
  }

  async readVersion(
    organizationId: SportaId,
    version: number,
  ): Promise<OrganizationVersionRecord | null> {
    const entry = await this.store.read(organizationId, version);
    return entry === null ? null : entry.record;
  }

  async listVersions(): Promise<readonly OrganizationCatalogEntry[]> {
    const entries = await this.store.list();
    return entries
      .map((entry) => ({ record: entry.record, promoted: entry.promoted }))
      .sort(
        (left, right) =>
          left.record.organizationId.localeCompare(right.record.organizationId) ||
          left.record.version - right.record.version,
      );
  }

  async promote(input: PromoteOrganizationInput): Promise<PromotionRecord> {
    const entry = await this.store.read(input.organizationId, input.version);
    if (entry === null) {
      throw new OrganizationVersionNotFoundError(
        `organization ${input.organizationId} version ${input.version} is not registered`,
      );
    }
    const decidedAt: Iso8601 = this.now();
    const result = promoteStoredVersion(entry, input, decidedAt);
    if (result.entry !== entry) await this.store.write(result.entry);
    return result.promotion;
  }

  /**
   * Wave 4 additive — reject one candidate version (decision
   * "rejected"): evidence + policy gated like promotion, immutable after
   * decision, idempotent per candidate+decision for identical effective
   * evidence. Typed refusals otherwise (see domain/registry.ts).
   */
  async rejectCandidate(input: RejectCandidateInput): Promise<PromotionRecord> {
    const entry = await this.store.read(input.organizationId, input.version);
    if (entry === null) {
      throw new OrganizationVersionNotFoundError(
        `organization ${input.organizationId} version ${input.version} is not registered`,
      );
    }
    const decidedAt: Iso8601 = this.now();
    const result = rejectStoredCandidate(entry, input, decidedAt);
    if (result.entry !== entry) await this.store.write(result.entry);
    return result.decision;
  }

  /**
   * Wave 4 additive — roll back a granted promotion (decision
   * "rolled-back"): gated on a prior promotion of the same candidate,
   * immutable after decision, idempotent per candidate+decision for
   * identical effective evidence. The granted promotion record is kept
   * (append-only history) while the promoted flag is retracted.
   */
  async rollbackPromotion(input: RollbackPromotionInput): Promise<PromotionRecord> {
    const entry = await this.store.read(input.organizationId, input.version);
    if (entry === null) {
      throw new OrganizationVersionNotFoundError(
        `organization ${input.organizationId} version ${input.version} is not registered`,
      );
    }
    const decidedAt: Iso8601 = this.now();
    const result = rollbackStoredPromotion(entry, input, decidedAt);
    if (result.entry !== entry) await this.store.write(result.entry);
    return result.decision;
  }

  /**
   * Wave 3 additive — read-only promotion/decision history: the immutable
   * lifecycle decision records granted so far — promotions, rejections
   * and rollbacks (Wave 4) — in store order ((organizationId asc,
   * version asc), grant order within one entry: promotion then
   * rollback). Undecided drafts contribute nothing. The store clones on
   * read, so callers never alias registry state.
   */
  async listPromotionRecords(): Promise<readonly PromotionRecord[]> {
    const entries = await this.store.list();
    return entries.flatMap((entry) => {
      const decisions: PromotionRecord[] = [];
      if (entry.promotion !== undefined) decisions.push(entry.promotion);
      if (entry.rejection !== undefined) decisions.push(entry.rejection);
      if (entry.rollback !== undefined) decisions.push(entry.rollback);
      return decisions;
    });
  }
}
