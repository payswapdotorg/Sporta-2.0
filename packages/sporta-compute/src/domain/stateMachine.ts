import type { ComputeJobState } from "./ports.js";
import { IllegalJobTransitionError } from "./errors.js";
/**
 * The compute job state machine (domain layer — pure).
 *
 * ~~~text
 * queued -> running -> succeeded | failed | refused | cancelled
 * queued -> cancelled | refused
 * terminal (succeeded, failed, refused, cancelled) has no outgoing edges
 * ~~~
 */

const TRANSITIONS: Record<ComputeJobState, readonly ComputeJobState[]> = {
  queued: ["running", "cancelled", "refused"],
  running: ["succeeded", "failed", "refused", "cancelled"],
  succeeded: [],
  failed: [],
  refused: [],
  cancelled: [],
};

/** Whether a transition is legal in the state machine. */
export function canTransition(from: ComputeJobState, to: ComputeJobState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Apply a transition, refusing illegal moves with a typed
 * IllegalJobTransitionError. Returns the target state.
 */
export function transitionJob(from: ComputeJobState, to: ComputeJobState): ComputeJobState {
  if (!canTransition(from, to)) {
    throw new IllegalJobTransitionError(
      `illegal compute job transition ${from} -> ${to}`,
      `${from}->${to}`,
    );
  }
  return to;
}
