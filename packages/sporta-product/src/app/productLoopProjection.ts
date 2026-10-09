/**
 * ProductLoopProjection — app-layer read model implementing
 * `ProductLoopProjectionPort`.
 *
 * Composes the five injected v1 ports (work, organizations, artifacts,
 * editors, arena) plus optional ambient shell context and — since Wave 3
 * — the four OPTIONAL read seams (ADR: docs/architecture/
 * adr-wave3-read-seams.md): editorSessionHistory, learningArtifacts,
 * organizationCandidates, escalations. It is a read model only: it calls
 * read methods (readWorkGraph, resolve, lineage, seam list queries),
 * implements no domain logic, and mutates nothing.
 *
 * Degradation law: an ABSENT seam leaves its stage's honest
 * `pending: …` detail exactly as v1 — never throw, never lie (see
 * src/app/productLoopSeamStages.ts for the seam derivations).
 * Regression law: v1-shaped inputs with no seams injected produce
 * byte-identical traces (the a17-seeded-loop test stays green unchanged).
 */
import type { ProductLoopProjectionPort, ProductLoopStage, ProductLoopTrace } from "../contract.js";
import type {
  ArtifactRevisionRecord,
  OrganizationVersionRecord,
  WorkGraphNode,
} from "@sporta/contracts/contract";
import type { WorkGraphRecord } from "@sporta/contracts/contract";
import type { OrganizationSelection } from "@sporta/organizations/contract";
import { UnknownWorkGraphError } from "../domain/errors.js";
import type { ProductLoopProjectionDeps } from "./productLoopDeps.js";
import { ARTIFACT_BREADTH, learningStage, takeoverEditorStages } from "./productLoopSeamStages.js";
import {
  escalationStages,
  organizationImprovementStage,
  resultStage,
} from "./productLoopEscalationStages.js";

export type { ProductLoopProjectionDeps } from "./productLoopDeps.js";

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

function organizationStage(selection: OrganizationSelection): ProductLoopStage {
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

function artifactStage(
  latest: WorkGraphNode | undefined,
  revisions: readonly ArtifactRevisionRecord[],
): ProductLoopStage {
  if (latest === undefined) {
    return { stage: "artifact", state: "pending", detail: "no artifact node yet" };
  }
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

    // Shared derivation context — every expensive read happens exactly once.
    const selection = await this.#deps.organizations.resolve({
      intent: graph.intent,
      workGraph: graph,
      userRef: this.#deps.userRef,
      environmentProfile: this.#deps.environmentProfile ?? "unknown",
      constraints: this.#deps.constraints ?? [],
    });
    const organization: OrganizationVersionRecord = selection.selected.organization;

    // Lineages of the (bounded) latest artifact nodes — the artifact stage
    // uses the latest node's lineage; the takeover/editor stages read the
    // reachable revisions and their editor-session provenance.
    const artifactNodes = nodesOfKind(graph, "artifact");
    const lineages = new Map<string, readonly ArtifactRevisionRecord[]>();
    for (const node of artifactNodes.slice(-ARTIFACT_BREADTH)) {
      lineages.set(node.nodeId, await this.#deps.artifacts.lineage(node.nodeId));
    }
    const latest = artifactNodes.at(-1);
    const latestLineage = latest === undefined ? [] : (lineages.get(latest.nodeId) ?? []);

    const [capabilityGap, arena, escalations] = await escalationStages(this.#deps, graph);

    const stages: readonly ProductLoopStage[] = [
      intentStage(graph),
      organizationStage(selection),
      executionStage(graph),
      progressStage(graph),
      artifactStage(latest, latestLineage),
      ...(await takeoverEditorStages(this.#deps, graph, lineages)),
      await learningStage(this.#deps, graph, selection),
      capabilityGap,
      arena,
      await resultStage(this.#deps, graph, escalations),
      await organizationImprovementStage(this.#deps, organization),
    ];
    return { workGraphId, stages };
  }
}
