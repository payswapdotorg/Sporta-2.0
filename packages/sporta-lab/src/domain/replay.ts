/**
 * Replay simulation — pure and deterministic (see
 * packages/sporta-lab/SPEC.md). This is SIMULATION, never production
 * truth: the intervention-cost formula is a declared fixture heuristic
 * (each learned preference absorbs at most one historical manual
 * intervention), and the evidence list only references ids that already
 * exist in the replayed WorkGraph.
 */
import type {
  OrganizationVersionRecord,
  SportaId,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { WorkAppendRecord } from "@sporta/work/contract";
import type { LabReplayReport } from "./ports.js";

export function simulateReplay(
  graph: WorkGraphRecord,
  appends: readonly WorkAppendRecord[],
  organization: OrganizationVersionRecord,
  replayedAt: string,
): LabReplayReport {
  const userAppends = appends.filter((append) => append.actor.actorKind === "user").length;
  const learned = organization.learnedPreferences.length;
  const interventionCost = Math.max(0, userAppends - Math.min(userAppends, learned));
  let outcome: LabReplayReport["outcome"];
  if (graph.status === "escalated" || graph.nodes.length === 0) {
    outcome = "failure";
  } else if (graph.status === "closed" && graph.nodes.some((node) => node.kind === "outcome")) {
    outcome = "success";
  } else {
    outcome = "partial";
  }
  const evidence: SportaId[] = graph.nodes
    .filter((node) => node.kind === "evidence")
    .map((node) => node.nodeId);
  return {
    workGraphId: graph.workGraphId,
    organizationId: organization.organizationId,
    replayedAt,
    outcome,
    interventionCost,
    evidence,
  };
}
