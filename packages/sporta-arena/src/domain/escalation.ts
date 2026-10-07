/**
 * Arena escalation lifecycle (domain layer — pure).
 *
 * The literal chain from docs/contracts/arena-escalation.md:
 *
 *   created -> triaged -> matching -> offered -> accepted -> session_ready
 *           -> in_progress -> submitted -> validating
 *           -> accepted_result | revision_required | rejected -> closed
 *
 * All three post-validating outcomes proceed only to `closed` in v1; an
 * expert rework loop (revision_required -> in_progress) is deferred to
 * the real Arena lifecycle wave and is NOT invented here.
 */
import type { ArenaEscalationRecord } from "@sporta/contracts/contract";
import { IllegalEscalationTransitionError } from "./errors.js";

/** Lifecycle state of an Arena escalation. */
export type EscalationLifecycle = ArenaEscalationRecord["lifecycle"];

/** Which outcome the Arena picks after validating. */
export type EscalationOutcome = "accepted_result" | "revision_required" | "rejected";

/** Legal lifecycle transitions (literal contract chain). */
export const ESCALATION_LIFECYCLE_TRANSITIONS: Readonly<
  Record<EscalationLifecycle, readonly EscalationLifecycle[]>
> = {
  created: ["triaged"],
  triaged: ["matching"],
  matching: ["offered"],
  offered: ["accepted"],
  accepted: ["session_ready"],
  session_ready: ["in_progress"],
  in_progress: ["submitted"],
  submitted: ["validating"],
  validating: ["accepted_result", "revision_required", "rejected"],
  accepted_result: ["closed"],
  revision_required: ["closed"],
  rejected: ["closed"],
  closed: [],
};

/** Pure single-step transition: returns `to` when legal, throws otherwise. */
export function transitionEscalationLifecycle(
  from: EscalationLifecycle,
  to: EscalationLifecycle,
): EscalationLifecycle {
  if (!ESCALATION_LIFECYCLE_TRANSITIONS[from].includes(to)) {
    throw new IllegalEscalationTransitionError(from, to);
  }
  return to;
}

/**
 * Next default step along the chain from `current` (null when terminal).
 * At `validating` the chosen outcome is returned (default accepted_result).
 */
export function nextEscalationLifecycleStep(
  current: EscalationLifecycle,
  outcome: EscalationOutcome = "accepted_result",
): EscalationLifecycle | null {
  if (current === "validating") return outcome;
  return ESCALATION_LIFECYCLE_TRANSITIONS[current].at(0) ?? null;
}

/**
 * Legal multi-step path from `from` to `to` (BFS over the transition
 * table, endpoints included). Throws `IllegalEscalationTransitionError`
 * when `to` is unreachable — used to mirror transport lifecycle
 * progress without accepting illegal jumps.
 */
export function escalationLifecyclePath(
  from: EscalationLifecycle,
  to: EscalationLifecycle,
): readonly EscalationLifecycle[] {
  if (from === to) return [from];
  const parents = new Map<EscalationLifecycle, EscalationLifecycle | null>([[from, null]]);
  const queue: EscalationLifecycle[] = [from];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === undefined) break;
    for (const next of ESCALATION_LIFECYCLE_TRANSITIONS[current]) {
      if (parents.has(next)) continue;
      parents.set(next, current);
      if (next === to) {
        const path: EscalationLifecycle[] = [next];
        let walker: EscalationLifecycle | null = current;
        while (walker !== null) {
          path.unshift(walker);
          walker = parents.get(walker) ?? null;
        }
        return path;
      }
      queue.push(next);
    }
  }
  throw new IllegalEscalationTransitionError(from, to);
}
