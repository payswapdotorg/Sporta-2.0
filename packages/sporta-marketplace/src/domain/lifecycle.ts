/**
 * W9B-1/W9B-2 — the candidate and listing lifecycle state machines
 * (domain layer — pure). The ADR publication lifecycle is law:
 *
 *   DRAFT -> SUBMITTED -> AUTOMATED_CHECKS -> HUMAN_REVIEW -> APPROVED -> PUBLISHED
 *                       |                    |
 *                       +-> CHANGES_REQUESTED +-> REJECTED
 *   PUBLISHED -> SUSPENDED | WITHDRAWN | SUPERSEDED
 *
 * Transitions are explicit, total and one-way — a transition not in
 * the table is a typed error, never a silent overwrite. CHANGES_
 * REQUESTED, REJECTED and PUBLISHED are terminal for the candidate
 * record; a changed pipeline files a NEW candidate (P9-09).
 */
import type {
  TransformCandidateLifecycleState,
  TransformListingState,
} from "@sporta/marketplace/contract";

/** The explicit candidate transition table (from -> allowed tos). */
export const CANDIDATE_TRANSITIONS: Readonly<
  Record<TransformCandidateLifecycleState, readonly TransformCandidateLifecycleState[]>
> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["AUTOMATED_CHECKS", "CHANGES_REQUESTED"],
  AUTOMATED_CHECKS: ["HUMAN_REVIEW", "CHANGES_REQUESTED"],
  HUMAN_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  APPROVED: ["PUBLISHED"],
  PUBLISHED: [],
  CHANGES_REQUESTED: [],
  REJECTED: [],
};

/** The explicit listing transition table (one-way, ADR). */
export const LISTING_TRANSITIONS: Readonly<Record<TransformListingState, readonly TransformListingState[]>> = {
  PUBLISHED: ["SUSPENDED", "WITHDRAWN", "SUPERSEDED"],
  SUSPENDED: [],
  WITHDRAWN: [],
  SUPERSEDED: [],
};

/** May the candidate move from `from` to `to`? (pure lookup) */
export function candidateCanTransition(
  from: TransformCandidateLifecycleState,
  to: TransformCandidateLifecycleState,
): boolean {
  return CANDIDATE_TRANSITIONS[from]?.includes(to) === true;
}

/** May the listing move from `from` to `to`? (pure lookup) */
export function listingCanTransition(from: TransformListingState, to: TransformListingState): boolean {
  return LISTING_TRANSITIONS[from]?.includes(to) === true;
}

/**
 * A candidate in this state can never transition again (a changed
 * pipeline files a NEW candidate — P9-09's immutable-candidate law).
 */
export function candidateIsTerminal(state: TransformCandidateLifecycleState): boolean {
  return CANDIDATE_TRANSITIONS[state].length === 0;
}

/** Listing states that block new selection while preserving history. */
export function listingBlocksNewSelection(state: TransformListingState): boolean {
  return state !== "PUBLISHED";
}
