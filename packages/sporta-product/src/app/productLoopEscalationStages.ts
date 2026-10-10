/**
 * Wave-3 read-seam stage derivations for the product loop projection:
 * the capability-gap, arena, result and organization-improvement stages
 * (app layer — read-model functions, no mutation).
 *
 * Law (ADR: docs/architecture/adr-wave3-read-seams.md):
 * - every seam is OPTIONAL: an absent seam leaves the stage's honest
 *   `pending: …` detail EXACTLY as v1 (graceful degradation — never
 *   throw, never lie);
 * - reads through the seams are bounded (capped limits, capped node-ref
 *   breadth) and read-only;
 * - v1-shaped inputs with no seams injected produce byte-identical
 *   traces (the regression law).
 *
 * Derivations:
 * - capability-gap/arena: escalations for the graph (workGraphId query +
 *   node refs) through the escalations seam. Any escalation ⇒ the
 *   capability-gap is DONE; the arena stage maps the lifecycle
 *   (in-flight ⇒ active, accepted_result/closed ⇒ done,
 *   revision_required ⇒ blocked, rejected ⇒ refused).
 * - result: Arena results for the graph's escalations (node refs
 *   arena-result + escalation queries) through the escalations seam. A
 *   validated result is DONE; an unvalidated one is ACTIVE (awaiting
 *   validation).
 * - organization-improvement: candidates + promotions for the resolved
 *   organization through the organizationCandidates seam. A live
 *   un-promoted candidate version is ACTIVE (the current improvement
 *   leg outranks past promotions); a promotion with decision "promoted"
 *   is DONE.
 */
import type { ProductLoopStage } from "../domain/loopPorts.js";
import type {
  EscalationReadPort,
  EscalationSummary,
  OrganizationVersionRecord,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { ProductLoopProjectionDeps } from "./productLoopDeps.js";
import { SEAM_READ_LIMIT, REF_BREADTH, dedupeBy, refIdsOf } from "./productLoopSeamStages.js";

/** The honest v1 pending strings (kept byte-identical — regression law). */
export const SEAM_ARENA =
  "pending: no in-flight escalation; v1 work-graph status is the only escalation signal";
export const SEAM_RESULT =
  "pending: reading the Arena result requires escalation refs which v1 work-graph nodes do not carry";
export const SEAM_IMPROVEMENT =
  "pending: organization candidate/promotion read seams (Worker A, Wave 2)";

/** Escalation lifecycles that mean "the Arena session is still working". */
const IN_FLIGHT_LIFECYCLES: readonly string[] = [
  "created",
  "triaged",
  "matching",
  "offered",
  "accepted",
  "session_ready",
  "in_progress",
  "submitted",
  "validating",
];

/** Collect the escalations reachable from one work graph (seam queries). */
async function escalationsForGraph(
  seam: EscalationReadPort,
  graph: WorkGraphRecord,
): Promise<readonly EscalationSummary[]> {
  const byGraph = await seam.listEscalations({
    workGraphId: graph.workGraphId,
    limit: SEAM_READ_LIMIT,
  });
  const byRefs: EscalationSummary[] = [];
  for (const gapId of refIdsOf(graph, "capability-gap")) {
    byRefs.push(...(await seam.listEscalations({ gapId, limit: SEAM_READ_LIMIT })));
  }
  for (const escalationId of refIdsOf(graph, "escalation")) {
    byRefs.push(...(await seam.listEscalations({ escalationId, limit: SEAM_READ_LIMIT })));
  }
  return dedupeBy([...byGraph, ...byRefs], (summary) => summary.escalationId);
}

/** capability-gap + arena stages (order: capability-gap, then arena). */
export async function escalationStages(
  deps: ProductLoopProjectionDeps,
  graph: WorkGraphRecord,
): Promise<readonly [ProductLoopStage, ProductLoopStage, readonly EscalationSummary[]]> {
  const escalated = graph.status === "escalated";
  const seam = deps.escalations;
  if (seam === undefined) {
    return [
      escalated
        ? { stage: "capability-gap", state: "done", detail: "work graph status: escalated" }
        : {
            stage: "capability-gap",
            state: "pending",
            detail: "no escalation signal in v1 work-graph status",
          },
      escalated
        ? { stage: "arena", state: "active", detail: "escalation in flight at the Arena" }
        : { stage: "arena", state: "pending", detail: SEAM_ARENA },
      [],
    ];
  }

  const escalations = await escalationsForGraph(seam, graph);
  if (escalations.length === 0) {
    // The seam found nothing: the v1 status signal is still honored, with
    // an honest seam-aware pending detail (not the v1 seam-missing string).
    return [
      escalated
        ? { stage: "capability-gap", state: "done", detail: "work graph status: escalated" }
        : {
            stage: "capability-gap",
            state: "pending",
            detail: "no escalation recorded for this work graph",
          },
      escalated
        ? { stage: "arena", state: "active", detail: "escalation in flight at the Arena" }
        : {
            stage: "arena",
            state: "pending",
            detail: "no escalation recorded for this work graph",
          },
      escalations,
    ];
  }

  const inFlight = escalations.filter((summary) =>
    IN_FLIGHT_LIFECYCLES.includes(summary.lifecycle),
  );
  let arena: ProductLoopStage;
  if (inFlight.length > 0) {
    arena = {
      stage: "arena",
      state: "active",
      ref: inFlight.at(-1)?.escalationId,
      detail: `escalation in flight (${inFlight.at(-1)?.lifecycle})`,
    };
  } else {
    const concluded = escalations.find(
      (summary) => summary.lifecycle === "accepted_result" || summary.lifecycle === "closed",
    );
    const revision = escalations.find((summary) => summary.lifecycle === "revision_required");
    const rejected = escalations.find((summary) => summary.lifecycle === "rejected");
    if (concluded !== undefined) {
      arena = {
        stage: "arena",
        state: "done",
        ref: concluded.escalationId,
        detail: `escalation concluded (${concluded.lifecycle})`,
      };
    } else if (revision !== undefined) {
      arena = {
        stage: "arena",
        state: "blocked",
        ref: revision.escalationId,
        detail: "escalation requires revision",
      };
    } else if (rejected !== undefined) {
      arena = {
        stage: "arena",
        state: "refused",
        ref: rejected.escalationId,
        detail: "escalation rejected by the Arena",
      };
    } else {
      arena = { stage: "arena", state: "pending", detail: SEAM_ARENA };
    }
  }

  return [
    {
      stage: "capability-gap",
      state: "done",
      ref: escalations.at(-1)?.gapId,
      detail: `${escalations.length} capability gap(s) escalated to the Arena`,
    },
    arena,
    escalations,
  ];
}

/** result stage: Arena results for the graph's escalations. */
export async function resultStage(
  deps: ProductLoopProjectionDeps,
  graph: WorkGraphRecord,
  escalations: readonly EscalationSummary[],
): Promise<ProductLoopStage> {
  const seam = deps.escalations;
  if (seam === undefined) {
    return { stage: "result", state: "pending", detail: SEAM_RESULT };
  }

  const results = [];
  for (const escalation of escalations.slice(0, REF_BREADTH)) {
    results.push(
      ...(await seam.listResults({
        escalationId: escalation.escalationId,
        limit: SEAM_READ_LIMIT,
      })),
    );
  }
  for (const resultId of refIdsOf(graph, "arena-result")) {
    results.push(...(await seam.listResults({ resultId, limit: SEAM_READ_LIMIT })));
  }
  const reachable = dedupeBy(results, (summary) => summary.resultId);
  if (reachable.length === 0) {
    return { stage: "result", state: "pending", detail: "no Arena result yet" };
  }
  const validated = reachable.filter((summary) => summary.validated);
  if (validated.length > 0) {
    return {
      stage: "result",
      state: "done",
      ref: validated.at(-1)?.resultId,
      detail: `${validated.length} validated result(s)`,
    };
  }
  return {
    stage: "result",
    state: "active",
    ref: reachable.at(-1)?.resultId,
    detail: `${reachable.length} result(s) awaiting validation`,
  };
}

/** organization-improvement stage for the resolved organization. */
export async function organizationImprovementStage(
  deps: ProductLoopProjectionDeps,
  organization: OrganizationVersionRecord,
): Promise<ProductLoopStage> {
  const seam = deps.organizationCandidates;
  if (seam === undefined) {
    return { stage: "organization-improvement", state: "pending", detail: SEAM_IMPROVEMENT };
  }

  const candidates = await seam.listOrganizationCandidates({
    organizationId: organization.organizationId,
    limit: SEAM_READ_LIMIT,
  });
  const promotions = await seam.listPromotions({
    organizationId: organization.organizationId,
    limit: SEAM_READ_LIMIT,
  });

  // An un-promoted candidate version is the LIVE improvement in progress —
  // it outranks past promotions (the projection reports the current leg,
  // like the arena stage's in-flight precedence).
  const liveCandidates = candidates.filter(
    (candidate) =>
      candidate.status === "candidate" &&
      !promotions.some(
        (promotion) =>
          promotion.candidateId === candidate.candidateId && promotion.decision === "promoted",
      ),
  );
  if (liveCandidates.length > 0) {
    return {
      stage: "organization-improvement",
      state: "active",
      ref: liveCandidates.at(-1)?.candidateId,
      detail: `${liveCandidates.length} candidate organization version(s)`,
    };
  }

  const promoted = promotions.filter((promotion) => promotion.decision === "promoted");
  if (promoted.length > 0) {
    return {
      stage: "organization-improvement",
      state: "done",
      ref: promoted.at(-1)?.promotionId,
      detail: `${promoted.length} promoted organization version(s)`,
    };
  }
  const rejected = promotions.filter((promotion) => promotion.decision === "rejected");
  if (rejected.length > 0) {
    return {
      stage: "organization-improvement",
      state: "refused",
      ref: rejected.at(-1)?.promotionId,
      detail: `${rejected.length} rejected promotion(s)`,
    };
  }
  const rolledBack = promotions.filter((promotion) => promotion.decision === "rolled-back");
  if (rolledBack.length > 0) {
    return {
      stage: "organization-improvement",
      state: "blocked",
      ref: rolledBack.at(-1)?.promotionId,
      detail: `${rolledBack.length} rolled-back promotion(s)`,
    };
  }
  return {
    stage: "organization-improvement",
    state: "pending",
    detail: "no organization candidate yet",
  };
}
