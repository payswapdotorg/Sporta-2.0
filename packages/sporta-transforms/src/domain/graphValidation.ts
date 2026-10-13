/**
 * W9A-1 — typed pipeline-graph validation (domain layer — pure, P9-01).
 *
 * Fail-closed law: every violation is a typed entry of the frozen
 * `TransformGraphValidation` result. Valid graphs return the node/edge
 * counts; invalid graphs return ALL violations in a deterministic
 * order (never just the first). No IO, no timers, no node: imports —
 * this file is a pure function of its inputs.
 *
 * Frozen record types come from the public contract (self-package
 * reference, type-only — the runtime dependency direction stays
 * contract -> domain, never the reverse).
 */
import type {
  TransformEdge,
  TransformGraphValidation,
  TransformNode,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";

/** Run-time validation options (all optional — see SPEC W9A-1). */
export interface TransformGraphValidationOptions {
  /**
   * Per-node parameter assignments to check against each node's
   * `parameterSchema`. Nodes present here are checked for missing
   * required / wrong type / out-of-bounds values. When absent, only
   * schema well-formedness is checked.
   */
  parameters?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

type Violation = Extract<TransformGraphValidation, { valid: false }>["violations"][number];

/** The JSON-schema-ish subset a parameterSchema entry may declare. */
const PARAMETER_TYPES: readonly string[] = ["number", "integer", "string", "boolean"];

/** A digest is pinned exactly when it is sha256:<64 lowercase hex>. */
const PINNED_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Moving tags never count as pins (lock invariants 25/27). */
const MOVING_TAG_PATTERN = /^(latest|main|head|master|tip)$/i;

const VIOLATION_ORDER: readonly Violation["kind"][] = [
  "duplicate-node",
  "unknown-node",
  "unknown-port",
  "type-mismatch",
  "unpinned-component",
  "cycle",
  "missing-parameter",
];

/** Build the typed violation record (single construction point). */
function violation(kind: Violation["kind"], detail: string): Violation {
  return { kind, detail };
}

/**
 * Validate a `TransformPipelineManifest` graph.
 *
 * Deterministic order: duplicate-node, unknown-node, unknown-port,
 * type-mismatch, unpinned-component, cycle, missing-parameter; within
 * a kind, by detail string. Every check runs — a cycle does not hide
 * an unpinned component. Returns the frozen validation result.
 */
export function validateTransformPipelineManifest(
  manifest: TransformPipelineManifest,
  options: TransformGraphValidationOptions = {},
): TransformGraphValidation {
  const violations: Violation[] = [];
  const nodes: readonly TransformNode[] = manifest.nodes;
  const edges: readonly TransformEdge[] = manifest.edges;

  // 1. duplicate node ids.
  const seen = new Map<string, number>();
  for (const node of nodes) {
    const count = seen.get(node.nodeId) ?? 0;
    seen.set(node.nodeId, count + 1);
  }
  for (const [nodeId, count] of seen) {
    if (count > 1) {
      violations.push(violation("duplicate-node", `nodeId ${nodeId} declared ${count} times`));
    }
  }

  // 2-4. edges: endpoints, ports, dataKind compatibility.
  const nodeById = new Map<string, TransformNode>(nodes.map((node) => [node.nodeId, node]));
  const allPortsOf = (node: TransformNode): Map<string, string> =>
    new Map([...node.inputs, ...node.outputs].map((port) => [port.name, port.dataKind]));
  const inputPortsOf = (node: TransformNode): Map<string, string> =>
    new Map(node.inputs.map((port) => [port.name, port.dataKind]));
  for (const edge of edges) {
    const { from, to } = edge;
    const fromNode = nodeById.get(from.nodeId);
    const toNode = nodeById.get(to.nodeId);
    if (fromNode === undefined) {
      violations.push(violation("unknown-node", `edge from references unknown node ${from.nodeId}`));
    }
    if (toNode === undefined) {
      violations.push(violation("unknown-node", `edge to references unknown node ${to.nodeId}`));
    }
    if (fromNode !== undefined && !allPortsOf(fromNode).has(from.port)) {
      violations.push(violation("unknown-port", `edge from references unknown port ${from.nodeId}:${from.port}`));
    }
    if (toNode !== undefined && !inputPortsOf(toNode).has(to.port)) {
      violations.push(violation("unknown-port", `edge to references unknown port ${to.nodeId}:${to.port}`));
    }
    if (fromNode !== undefined && toNode !== undefined) {
      const fromKind = allPortsOf(fromNode).get(from.port);
      const toKind = inputPortsOf(toNode).get(to.port);
      if (fromKind !== undefined && toKind !== undefined && fromKind !== toKind) {
        violations.push(
          violation(
            "type-mismatch",
            `edge ${from.nodeId}:${from.port} (${fromKind}) -> ${to.nodeId}:${to.port} (${toKind}) has incompatible dataKinds`,
          ),
        );
      }
    }
  }

  // 5. pinned component references (moving tags and malformed digests).
  for (const node of nodes) {
    const digest = node.componentRef.digest;
    if (!PINNED_DIGEST_PATTERN.test(digest)) {
      violations.push(
        violation(
          "unpinned-component",
          MOVING_TAG_PATTERN.test(digest)
            ? `node ${node.nodeId} component ${node.componentRef.name} uses the moving tag "${digest}"`
            : `node ${node.nodeId} component ${node.componentRef.name} digest "${digest}" is not sha256:<64 hex>`,
        ),
      );
    }
    if (node.componentRef.kind !== node.kind) {
      violations.push(
        violation(
          "unpinned-component",
          `node ${node.nodeId} componentRef.kind ${node.componentRef.kind} does not match node kind ${node.kind}`,
        ),
      );
    }
  }

  // 6. cycles (iterative-DFS-free variant: recursion depth = node count).
  for (const cycle of findCycles(nodes, edges)) {
    violations.push(violation("cycle", `cycle detected: ${cycle.join(" -> ")}`));
  }

  // 7. parameter schemas + provided values.
  for (const node of nodes) {
    violations.push(...checkParameterSchema(node, options.parameters?.[node.nodeId]));
  }

  if (violations.length === 0) {
    return { valid: true, nodeCount: nodes.length, edgeCount: edges.length };
  }
  const kindRank = new Map<Violation["kind"], number>(
    VIOLATION_ORDER.map((kind, index) => [kind, index]),
  );
  return {
    valid: false,
    violations: [...violations].sort((left, right) => {
      const kindDelta = (kindRank.get(left.kind) ?? 0) - (kindRank.get(right.kind) ?? 0);
      return kindDelta !== 0
        ? kindDelta
        : left.detail < right.detail
          ? -1
          : left.detail > right.detail
            ? 1
            : 0;
    }),
  };
}

/**
 * Find back-edge cycles as node-id loops. Each distinct loop is
 * reported once, deterministically in node declaration order.
 */
function findCycles(nodes: readonly TransformNode[], edges: readonly TransformEdge[]): string[][] {
  const adjacency = new Map<string, string[]>(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from.nodeId) && adjacency.has(edge.to.nodeId)) {
      adjacency.get(edge.from.nodeId)?.push(edge.to.nodeId);
    }
  }
  const state = new Map<string, number>(); // 0 = unvisited, 1 = on stack, 2 = done
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (nodeId: string): void => {
    state.set(nodeId, 1);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        const index = stack.indexOf(next);
        if (index >= 0) cycles.push([...stack.slice(index), next]);
      } else if (nextState === 0) {
        visit(next);
      }
    }
    stack.pop();
    state.set(nodeId, 2);
  };
  for (const node of nodes) {
    if ((state.get(node.nodeId) ?? 0) === 0) visit(node.nodeId);
  }
  return cycles;
}

/**
 * Check one node's parameterSchema (well-formedness, always) and — when
 * `provided` is present — the values against the schema. Fail-closed:
 * malformed schema entries and out-of-bounds values are typed
 * `missing-parameter` violations.
 */
function checkParameterSchema(
  node: TransformNode,
  provided: Readonly<Record<string, unknown>> | undefined,
): Violation[] {
  const violations: Violation[] = [];
  const schema = node.parameterSchema ?? {};
  if (typeof schema !== "object" || Array.isArray(schema)) {
    return [violation("missing-parameter", `node ${node.nodeId} parameterSchema is not an object`)];
  }
  for (const [name, rawEntry] of Object.entries(schema)) {
    if (typeof rawEntry !== "object" || rawEntry === null || Array.isArray(rawEntry)) {
      violations.push(
        violation("missing-parameter", `node ${node.nodeId} parameter ${name} schema is not an object`),
      );
      continue;
    }
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.type !== "string" || !PARAMETER_TYPES.includes(entry.type)) {
      violations.push(
        violation(
          "missing-parameter",
          `node ${node.nodeId} parameter ${name} declares unsupported type ${JSON.stringify(entry.type)}`,
        ),
      );
      continue;
    }
    if (entry.minimum !== undefined && typeof entry.minimum !== "number") {
      violations.push(
        violation("missing-parameter", `node ${node.nodeId} parameter ${name} minimum is not a number`),
      );
    }
    if (entry.maximum !== undefined && typeof entry.maximum !== "number") {
      violations.push(
        violation("missing-parameter", `node ${node.nodeId} parameter ${name} maximum is not a number`),
      );
    }
    if (provided !== undefined) {
      violations.push(...checkParameterValue(node.nodeId, name, entry, provided[name]));
    }
  }
  return violations;
}

/** Check one provided value against one validated schema entry. */
function checkParameterValue(
  nodeId: string,
  name: string,
  entry: Record<string, unknown>,
  value: unknown,
): Violation[] {
  if (entry.required === true && value === undefined) {
    return [violation("missing-parameter", `node ${nodeId} is missing required parameter ${name}`)];
  }
  if (value === undefined) return []; // absent optional value is fine
  const type = entry.type as string;
  const typeOk =
    type === "integer"
      ? typeof value === "number" && Number.isInteger(value)
      : type === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : type === "string"
          ? typeof value === "string"
          : typeof value === "boolean";
  if (!typeOk) {
    return [violation("missing-parameter", `node ${nodeId} parameter ${name} expects ${type}, got ${typeof value}`)];
  }
  if (typeof value === "number") {
    if (typeof entry.minimum === "number" && value < entry.minimum) {
      return [
        violation("missing-parameter", `node ${nodeId} parameter ${name} value ${value} is below minimum ${entry.minimum}`),
      ];
    }
    if (typeof entry.maximum === "number" && value > entry.maximum) {
      return [
        violation("missing-parameter", `node ${nodeId} parameter ${name} value ${value} is above maximum ${entry.maximum}`),
      ];
    }
  }
  return [];
}
