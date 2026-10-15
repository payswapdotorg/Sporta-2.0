/**
 * W12-03 — the creator-side candidate query service (the marketplace
 * composition seam's enumeration read). A NEW app service over the
 * candidate store — the W4-B new-service pattern: the frozen
 * `CandidateStorePort` is untouched; enumeration rides the store
 * implementation's additive `listAll()` (declared here as the narrow
 * `CandidateEnumerationPort`, implemented by InMemoryCandidateStore).
 *
 * Laws (ADR-w12): pure projection — this service owns NO store, mints
 * NO ids, writes NOTHING. Records are returned verbatim (defensive
 * copies stay the store's concern). DRAFT/SUBMITTED/… lifecycle states
 * are carried as-is; the screen-side creatorState mapping is a pure
 * view concern, never a mutation here.
 */
import type { CandidateStorePort } from "../domain/ports.js";
import type { TransformCandidateRecord } from "../domain/lifecycle.js";

/**
 * The enumeration capability a candidate store implementation exposes
 * additively (InMemoryCandidateStore implements this; the frozen port
 * is unchanged).
 */
export interface CandidateEnumerationPort {
  /** All candidate records (stable insertion order). */
  listAll(): readonly TransformCandidateRecord[];
}

export interface CreatorCandidateQueryServiceDeps {
  /** The candidate store, with the additive enumeration capability. */
  readonly candidates: CandidateStorePort & CandidateEnumerationPort;
}

/**
 * The W12 creator read model: enumerate REAL candidate records and
 * filter by creator (`submittedBy`). Drafts are private — they are
 * visible ONLY to their creator in the creator query (the listing/
 * admission lanes keep their own visibility laws).
 */
export class CreatorCandidateQueryService {
  private readonly deps: CreatorCandidateQueryServiceDeps;

  constructor(deps: CreatorCandidateQueryServiceDeps) {
    this.deps = deps;
  }

  /** All candidate records (insertion order) — the composition seam read. */
  listAll(): readonly TransformCandidateRecord[] {
    return this.deps.candidates.listAll();
  }

  /**
   * A creator's records (drafts included — the creator's own view).
   * Insertion order preserved; pure filter, no state change.
   */
  listByCreator(creator: string): readonly TransformCandidateRecord[] {
    return this.deps.candidates.listAll().filter(
      (record) => record.submittedBy === creator,
    );
  }
}
