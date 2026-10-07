/**
 * CapabilityGap lifecycle (domain layer — pure).
 *
 * Status chain: open -> escalated -> resolved | closed, resolved -> closed.
 * Illegal transitions throw `IllegalGapTransitionError`.
 */
import type { CapabilityGapRecord } from "@sporta/contracts/contract";
import { IllegalGapTransitionError } from "./errors.js";

/** Status of a capability gap. */
export type GapStatus = CapabilityGapRecord["status"];

/** Legal gap status transitions (first write wins; closed is terminal). */
export const GAP_STATUS_TRANSITIONS: Readonly<Record<GapStatus, readonly GapStatus[]>> = {
  open: ["escalated"],
  escalated: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

/** Pure transition function: returns `to` when legal, throws otherwise. */
export function transitionGapStatus(from: GapStatus, to: GapStatus): GapStatus {
  if (!GAP_STATUS_TRANSITIONS[from].includes(to)) {
    throw new IllegalGapTransitionError(from, to);
  }
  return to;
}
