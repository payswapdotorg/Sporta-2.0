/**
 * Node refs — Wave 3 additive cross-domain reference appends (ADR:
 * docs/architecture/adr-wave3-read-seams.md).
 *
 * Pure domain mechanics for appending typed `WorkGraphNodeRef`s to graph
 * nodes. Refs are an IMMUTABLE APPEND-ONLY LEDGER: they are never removed
 * and never rewritten (no API exists to do so); appending a ref that is
 * already present (same kind + refId) is an idempotent no-op.
 *
 * Produced kinds in THIS module (worker-A lane): capability-gap,
 * escalation, arena-result, artifact-revision. The editor-session and
 * learning-artifact kinds are consumed (not produced) by this lane — the
 * app layer only ever appends the four kinds above, structurally.
 *
 * v1 graphs without refs stay valid: nodes gain a `refs` array lazily, at
 * the first ref append, and `readWorkGraph` never fabricates one.
 */
import type {
  Iso8601,
  SportaId,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphNodeRef,
  WorkGraphNodeRefKind,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { StoredWorkGraph } from "./workGraph.js";
import {
  WorkGraphNodeKindError,
  WorkGraphNodeNotFoundError,
  WorkGraphNodeRefError,
} from "./errors.js";

/** The closed ref-kind union (mirrors records/readSeams.ts, runtime guard). */
const REF_KINDS: readonly WorkGraphNodeRefKind[] = [
  "capability-gap",
  "escalation",
  "arena-result",
  "artifact-revision",
  "editor-session",
  "learning-artifact",
];

/** Refs this lane PRODUCES. The other two kinds are other lanes' outputs. */
export const PRODUCED_REF_KINDS: readonly WorkGraphNodeRefKind[] = [
  "capability-gap",
  "escalation",
  "arena-result",
  "artifact-revision",
];

function validateRef(ref: WorkGraphNodeRef): void {
  if (!REF_KINDS.includes(ref.kind)) {
    throw new WorkGraphNodeRefError(
      `unknown ref kind: ${String(ref.kind)} (known: ${REF_KINDS.join(", ")})`,
    );
  }
  if (typeof ref.refId !== "string" || ref.refId.trim().length === 0) {
    throw new WorkGraphNodeRefError(
      `ref of kind ${ref.kind} carries an empty refId (ids are opaque but never empty)`,
    );
  }
}

/** Idempotency key for one ref: (kind, refId). */
function refKey(ref: WorkGraphNodeRef): string {
  return `${ref.kind}\u0000${ref.refId}`;
}

export interface AppendRefsResult {
  stored: StoredWorkGraph;
  node: WorkGraphNode;
  /** True when at least one ref was appended (a write is required). */
  appended: boolean;
}

/**
 * Append refs to one node. Append-only + idempotent: refs already present
 * (same kind + refId, including duplicates within the same batch) are
 * skipped; nothing is ever removed or rewritten. The node must exist.
 * `updatedAt` advances only when a ref is actually appended.
 */
export function appendRefsToNode(
  stored: StoredWorkGraph,
  nodeId: SportaId,
  refs: readonly WorkGraphNodeRef[],
  now: Iso8601,
): AppendRefsResult {
  const { graph } = stored;
  for (const ref of refs) validateRef(ref);
  const node = graph.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (node === undefined) {
    throw new WorkGraphNodeNotFoundError(
      `node not found: ${nodeId} (work graph ${graph.workGraphId})`,
    );
  }
  const seen = new Set((node.refs ?? []).map(refKey));
  const fresh: WorkGraphNodeRef[] = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(ref);
  }
  if (fresh.length === 0) return { stored, node, appended: false };
  const updatedNode: WorkGraphNode = { ...node, refs: [...(node.refs ?? []), ...fresh] };
  const updatedGraph: WorkGraphRecord = {
    ...graph,
    nodes: graph.nodes.map((candidate) => (candidate.nodeId === nodeId ? updatedNode : candidate)),
    updatedAt: now,
  };
  return {
    stored: { graph: updatedGraph, appends: stored.appends },
    node: updatedNode,
    appended: true,
  };
}

/**
 * Require a node of a given kind (e.g. artifact revisions attach to
 * `artifact` nodes). Typed refusal when the node is missing or its kind
 * does not fit the operation.
 */
export function requireNodeOfKind(
  stored: StoredWorkGraph,
  nodeId: SportaId,
  kind: WorkGraphNodeKind,
): WorkGraphNode {
  const node = stored.graph.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (node === undefined) {
    throw new WorkGraphNodeNotFoundError(
      `node not found: ${nodeId} (work graph ${stored.graph.workGraphId})`,
    );
  }
  if (node.kind !== kind) {
    throw new WorkGraphNodeKindError(
      `node ${nodeId} is of kind ${node.kind}; this operation requires a ${kind} node`,
    );
  }
  return node;
}
