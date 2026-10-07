/**
 * ProductLoopProjection — app-layer read model implementing
 * `ProductLoopProjectionPort`.
 *
 * Composes the five injected v1 ports (work, organizations, artifacts,
 * editors, arena) plus optional ambient shell context. It is a read
 * model only: it calls read methods (readWorkGraph, resolve, lineage),
 * implements no domain logic, and mutates nothing. Stages that the v1
 * public contracts cannot derive (takeover, editor, learning, result,
 * organization-improvement) are reported honestly as "pending" with a
 * detail naming the missing read seam — nothing is fabricated.
 */
import type { ProductLoopProjectionPort, ProductLoopStage, ProductLoopTrace } from "../contract.js";
import type { WorkGraphRecord, WorkGraphNode } from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import type { OrganizationResolverPort } from "@sporta/organizations/contract";
import type { ArtifactGraphPort } from "@sporta/artifacts/contract";
import type { EditorBrokerPort } from "@sporta/editors/contract";
import type { ArenaClientPort } from "@sporta/arena/contract";
import { UnknownWorkGraphError } from "../domain/errors.js";

/** Injected ports + optional ambient shell context. */
export interface ProductLoopProjectionDeps {
  workGraphs: WorkGraphPort;
  organizations: OrganizationResolverPort;
  artifacts: ArtifactGraphPort;
  editors: EditorBrokerPort;
  arena: ArenaClientPort;
  /** Ambient shell context for organization selection (defaults: "unknown" / []). */
  environmentProfile?: string;
  userRef?: string;
  constraints?: readonly string[];
}

const SEAM_TAKEOVER =
  "pending: v1 ports expose no takeover/editor-session history read seam (Wave 2 event projection)";
const SEAM_EDITOR =
  "pending: v1 ports expose no editor-session history read seam (Wave 2 editor read port)";
const SEAM_LEARNING =
  "pending: learning state becomes traceable when arena-result/learning read seams land (Wave 2)";
const SEAM_ARENA =
  "pending: no in-flight escalation; v1 work-graph status is the only escalation signal";
const SEAM_RESULT =
  "pending: reading the Arena result requires escalation refs which v1 work-graph nodes do not carry";
const SEAM_IMPROVEMENT = "pending: organization candidate/promotion read seams (Worker A, Wave 2)";

function nodesOfKind(
  graph: WorkGraphRecord,
  kind: WorkGraphNode["kind"],
): readonly WorkGraphNode[] {
  return graph.nodes
    .filter((node) => node.kind === kind)
    .sort((left, right) => left.seq - right.seq);
}

function intentStage(graph: WorkGraphRecord): ProductLoopStage {
  return { stage: "intent", ref: graph.workGraphId, state: "done", detail: "intent admitted" };
}

async function organizationStage(
  deps: ProductLoopProjectionDeps,
  graph: WorkGraphRecord,
): Promise<ProductLoopStage> {
  const selection = await deps.organizations.resolve({
    intent: graph.intent,
    workGraph: graph,
    userRef: deps.userRef,
    environmentProfile: deps.environmentProfile ?? "unknown",
    constraints: deps.constraints ?? [],
  });
  const organization = selection.selected.organization;
  return {
    stage: "organization",
    ref: `${organization.organizationId}@v${organization.version}`,
    state: "done",
    detail: selection.selected.rationale,
  };
}

function executionStage(graph: WorkGraphRecord): ProductLoopStage {
  const outcomes = nodesOfKind(graph, "outcome");
  if (outcomes.length > 0) {
    return { stage: "execution", state: "done", detail: `${outcomes.length} outcome node(s)` };
  }
  switch (graph.status) {
    case "executing":
      return { stage: "execution", state: "active", detail: "executing" };
    case "awaiting-user":
      return { stage: "execution", state: "active", detail: "awaiting user input" };
    case "escalated":
      return { stage: "execution", state: "active", detail: "escalated to Arena" };
    case "closed":
      return { stage: "execution", state: "done", detail: "work graph closed" };
    case "open":
      return { stage: "execution", state: "pending", detail: "not started" };
  }
}

function progressStage(graph: WorkGraphRecord): ProductLoopStage {
  const tasks = nodesOfKind(graph, "task");
  const runs = nodesOfKind(graph, "run");
  const actions = nodesOfKind(graph, "action");
  const detail = `${tasks.length} task(s), ${runs.length} run(s), ${actions.length} action(s)`;
  if (actions.length > 0) {
    return { stage: "progress", state: "done", detail };
  }
  if (runs.length > 0) {
    return { stage: "progress", state: "active", detail };
  }
  return { stage: "progress", state: "pending", detail };
}

async function artifactStage(
  deps: ProductLoopProjectionDeps,
  graph: WorkGraphRecord,
): Promise<ProductLoopStage> {
  const artifactNodes = nodesOfKind(graph, "artifact");
  const latest = artifactNodes.at(-1);
  if (latest === undefined) {
    return { stage: "artifact", state: "pending", detail: "no artifact node yet" };
  }
  const revisions = await deps.artifacts.lineage(latest.nodeId);
  if (revisions.length > 0) {
    return {
      stage: "artifact",
      ref: latest.nodeId,
      state: "done",
      detail: `${revisions.length} revision(s)`,
    };
  }
  return {
    stage: "artifact",
    ref: latest.nodeId,
    state: "active",
    detail: "artifact not yet committed",
  };
}

function escalationStages(graph: WorkGraphRecord): readonly ProductLoopStage[] {
  const escalated = graph.status === "escalated";
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
  ];
}

/** The product loop projection service. */
export class ProductLoopProjection implements ProductLoopProjectionPort {
  readonly #deps: ProductLoopProjectionDeps;

  constructor(deps: ProductLoopProjectionDeps) {
    this.#deps = deps;
  }

  async trace(workGraphId: string): Promise<ProductLoopTrace> {
    const graph = await this.#deps.workGraphs.readWorkGraph(workGraphId);
    if (graph === null) {
      throw new UnknownWorkGraphError(workGraphId);
    }
    const stages: readonly ProductLoopStage[] = [
      intentStage(graph),
      await organizationStage(this.#deps, graph),
      executionStage(graph),
      progressStage(graph),
      await artifactStage(this.#deps, graph),
      { stage: "takeover", state: "pending", detail: SEAM_TAKEOVER },
      { stage: "editor", state: "pending", detail: SEAM_EDITOR },
      { stage: "learning", state: "pending", detail: SEAM_LEARNING },
      ...escalationStages(graph),
      { stage: "result", state: "pending", detail: SEAM_RESULT },
      { stage: "organization-improvement", state: "pending", detail: SEAM_IMPROVEMENT },
    ];
    return { workGraphId, stages };
  }
}
