/**
 * Graph studio view-models (PURE — no react, no IO; battery-tested
 * from packages/sporta-app-environments/test/, W9C-8).
 *
 * The graph-building model assembles node/edge drafts; the validation
 * projection CONSUMES the @sporta/transforms validation-result shape
 * (StudioValidationResult is structurally TransformGraphValidation —
 * compat proven in the studio battery tests) and projects it for
 * display. Port compatibility between drafts is a pure hint; the REAL
 * verdict always comes from the validation port.
 */

/** Draft one node (defaults for the first slice node kinds). */
export function draftNode(
  nodeId: string,
  kind: import("./studioPorts.js").StudioNodeDraft["kind"],
  overrides: Partial<import("./studioPorts.js").StudioNodeDraft> = {},
): import("./studioPorts.js").StudioNodeDraft {
  return {
    nodeId,
    kind,
    componentName: `${kind}-component`,
    componentDigest: "",
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

/** Draft one edge between two existing node ports. */
export function draftEdge(
  from: { nodeId: string; port: string },
  to: { nodeId: string; port: string },
): import("./studioPorts.js").StudioEdgeDraft {
  return { from, to };
}

/** Assemble a draft graph (pure; order of nodes/edges preserved). */
export function assembleGraph(
  nodes: readonly import("./studioPorts.js").StudioNodeDraft[],
  edges: readonly import("./studioPorts.js").StudioEdgeDraft[] = [],
): import("./studioPorts.js").StudioGraphDraft {
  return { nodes: [...nodes], edges: [...edges] };
}

/** Pure port-compatibility hint (the real verdict is the validator's). */
export function portsCompatible(
  source: import("./studioPorts.js").StudioPortSpec,
  target: import("./studioPorts.js").StudioPortSpec,
): boolean {
  return source.dataKind === target.dataKind;
}

/** The projected validation view rendered by TransformStudio.tsx. */
export interface StudioGraphValidationView {
  valid: boolean;
  nodeCount: number;
  edgeCount: number;
  /** Violation summaries (kind + detail), verbatim from the validator. */
  violations: readonly { kind: string; detail: string }[];
  /** Counts per violation kind (for the summary chips). */
  violationCounts: readonly { kind: string; count: number }[];
}

/**
 * Project the REAL validation result into the render view — the
 * violations are carried verbatim (never re-classified or hidden).
 */
export function projectValidation(
  result: import("./studioPorts.js").StudioValidationResult,
): StudioGraphValidationView {
  if (result.valid) {
    return {
      valid: true,
      nodeCount: result.nodeCount,
      edgeCount: result.edgeCount,
      violations: [],
      violationCounts: [],
    };
  }
  const violations = [...result.violations];
  const byKind = new Map<string, number>();
  for (const violation of violations) {
    byKind.set(violation.kind, (byKind.get(violation.kind) ?? 0) + 1);
  }
  return {
    valid: false,
    nodeCount: 0,
    edgeCount: 0,
    violations,
    violationCounts: [...byKind.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)),
  };
}

/** Human labels for the frozen violation kinds (display only). */
export const STUDIO_VIOLATION_LABELS: Readonly<Record<string, string>> = {
  cycle: "Cycle",
  "unknown-port": "Unknown port",
  "unknown-node": "Unknown node",
  "duplicate-node": "Duplicate node",
  "type-mismatch": "Type mismatch",
  "missing-parameter": "Missing parameter",
  "unpinned-component": "Unpinned component",
};

/** Whether a draft is ready to submit for validation (non-empty + pinned). */
export function draftSubmittable(
  draft: import("./studioPorts.js").StudioGraphDraft,
): { submittable: boolean; blockers: readonly string[] } {
  const blockers: string[] = [];
  if (draft.nodes.length === 0) blockers.push("the graph has no nodes");
  for (const node of draft.nodes) {
    if (node.componentDigest.length === 0) {
      blockers.push(`node ${node.nodeId} has no pinned component digest`);
    }
  }
  for (const edge of draft.edges) {
    const fromExists = draft.nodes.some((node) => node.nodeId === edge.from.nodeId);
    const toExists = draft.nodes.some((node) => node.nodeId === edge.to.nodeId);
    if (!fromExists) blockers.push(`edge leaves unknown node ${edge.from.nodeId}`);
    if (!toExists) blockers.push(`edge enters unknown node ${edge.to.nodeId}`);
  }
  return { submittable: blockers.length === 0, blockers };
}
