/**
 * W9A-2 — graph resolution into a bounded execution plan (domain
 * layer — pure, P9-01/P9-02). A validated DAG resolves deterministically:
 * Kahn topological order with node-declaration tie-break, a step
 * budget (overflow = typed refusal, never an infinite loop), a
 * per-node resource-envelope projection, and component/sandbox gates
 * that refuse (typed) rather than degrade silently.
 *
 * The plan is DATA ONLY — it schedules nothing itself. Execution stays
 * with the WorkGraph run through the existing seams (no second
 * runtime — lock invariants 2/27).
 */
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
import { TransformExecutionPlanError, TransformGraphValidationError } from "./errors.js";
import {
  validateTransformPipelineManifest,
  type TransformGraphValidationOptions,
} from "./graphValidation.js";
import type {
  TransformComponentResolverPort,
  TransformExecutionPlan,
  TransformExecutionPlanOptions,
  TransformPlannedStep,
} from "./ports.js";

/** Kinds whose lanes execute through the component store. */
const DETERMINISTIC_KINDS: readonly string[] = ["deterministic-filter", "script"];

/** Kinds Sporta itself vouches for (sandbox "none" is legal for these only). */
const TRUSTED_KINDS: readonly string[] = ["sporta-capability"];

/**
 * Resolve a validated `TransformPipelineManifest` into a bounded
 * execution plan. Re-validates first (defense in depth) — invalid
 * graphs throw `TransformGraphValidationError`. Plan-level refusals
 * throw the typed `TransformExecutionPlanError` family:
 * unresolvable-pinned-dependency, step-budget-overflow,
 * sandbox-unsupported.
 */
export function resolveTransformExecutionPlan(
  manifest: TransformPipelineManifest,
  components: TransformComponentResolverPort,
  options: TransformExecutionPlanOptions = {},
): TransformExecutionPlan {
  const validationOptions: TransformGraphValidationOptions = {
    parameters: options.parameters,
  };
  const validation = validateTransformPipelineManifest(manifest, validationOptions);
  if (!validation.valid) {
    throw new TransformGraphValidationError(validation);
  }
  if (manifest.nodes.length === 0) {
    throw new TransformExecutionPlanError(
      "a pipeline must declare at least one node to have an execution plan",
      "unresolvable-pinned-dependency",
    );
  }

  const nodes = manifest.nodes;
  const steps = topologicalSteps(nodes, manifest.edges);

  const maxSteps = options.maxSteps ?? nodes.length;
  if (steps.length > maxSteps) {
    throw new TransformExecutionPlanError(
      `the plan needs ${steps.length} steps but the declared step budget is ${maxSteps}`,
      "step-budget-overflow",
    );
  }

  for (const node of nodes) {
    refuseUnresolvableComponents(node, components);
    refuseUnsupportedSandbox(node);
  }

  return {
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    steps,
    budget: { maxSteps, declaredSteps: steps.length },
    resources: projectResources(nodes),
  };
}

/**
 * Kahn topological sort with declaration-order tie-break: identical
 * manifests always resolve to identical step order (determinism
 * law). Edges between unknown nodes cannot exist here — validation
 * already refused them.
 */
function topologicalSteps(
  nodes: readonly TransformNode[],
  edges: readonly TransformEdge[],
): TransformPlannedStep[] {
  const declarationIndex = new Map(nodes.map((node, index) => [node.nodeId, index]));
  const upstream = new Map<string, Set<string>>(nodes.map((node) => [node.nodeId, new Set<string>()]));
  const downstream = new Map<string, string[]>(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    const from = declarationIndex.get(edge.from.nodeId);
    const to = declarationIndex.get(edge.to.nodeId);
    if (from === undefined || to === undefined) continue; // validation refused these
    upstream.get(edge.to.nodeId)?.add(edge.from.nodeId);
    downstream.get(edge.from.nodeId)?.push(edge.to.nodeId);
  }
  const pending = new Set(nodes.map((node) => node.nodeId));
  const emitted: TransformPlannedStep[] = [];
  const laneOf = (kind: TransformNode["kind"]): TransformPlannedStep["lane"] =>
    DETERMINISTIC_KINDS.includes(kind)
      ? "deterministic-process"
      : kind === "model"
        ? "model-adapter"
        : "capability-lane-deferred";
  while (pending.size > 0) {
    // Deterministic pick: the earliest-declared node whose upstream is fully emitted.
    const ready = [...pending]
      .filter((nodeId) => {
        const deps = upstream.get(nodeId) ?? new Set<string>();
        for (const dep of deps) if (pending.has(dep)) return false;
        return true;
      })
      .sort((left, right) => (declarationIndex.get(left) ?? 0) - (declarationIndex.get(right) ?? 0));
    const chosen = ready[0];
    if (chosen === undefined) {
      // Unreachable after validation (cycles are refused); defensive fail-closed.
      throw new TransformExecutionPlanError(
        `no topologically-ready node remains among ${[...pending].join(", ")}`,
        "step-budget-overflow",
      );
    }
    const node = nodes[declarationIndex.get(chosen) ?? 0];
    if (node === undefined) {
      throw new TransformExecutionPlanError(`node ${chosen} disappeared mid-resolution`, "unresolvable-pinned-dependency");
    }
    const dependsOn = [...(upstream.get(chosen) ?? new Set<string>())].sort(
      (left, right) => (declarationIndex.get(left) ?? 0) - (declarationIndex.get(right) ?? 0),
    );
    emitted.push({ nodeId: node.nodeId, kind: node.kind, lane: laneOf(node.kind), dependsOn });
    pending.delete(chosen);
    for (const next of downstream.get(chosen) ?? []) pending.add(next); // no-op (already pending) — kept for clarity
  }
  return emitted;
}

/**
 * Deterministic/script nodes must resolve by name AND digest in the
 * trusted component store — otherwise the typed refusal
 * `unresolvable-pinned-dependency` (a pinned reference nobody can
 * execute is a plan-level refusal, never a run-time crash).
 */
function refuseUnresolvableComponents(
  node: TransformNode,
  components: TransformComponentResolverPort,
): void {
  if (!DETERMINISTIC_KINDS.includes(node.kind)) return;
  const resolved = components.resolve(node.componentRef);
  if (resolved === null) {
    throw new TransformExecutionPlanError(
      `node ${node.nodeId} pins component ${node.componentRef.name} @ ${node.componentRef.digest} which no component store in this environment can resolve`,
      "unresolvable-pinned-dependency",
      node.nodeId,
    );
  }
}

/**
 * Sandbox gate (lock invariant 32): container/worker profiles are not
 * available in this environment; "none" is legal only for
 * declared-trusted kinds; host secret access and network egress we
 * cannot honor are refused at PLAN time — typed, never silent.
 */
function refuseUnsupportedSandbox(node: TransformNode): void {
  if (node.sandbox.kind === "container" || node.sandbox.kind === "worker") {
    throw new TransformExecutionPlanError(
      `node ${node.nodeId} declares sandbox kind "${node.sandbox.kind}" which this execution environment does not support (first slice: process)`,
      "sandbox-unsupported",
      node.nodeId,
    );
  }
  if (node.sandbox.kind === "none" && !TRUSTED_KINDS.includes(node.kind)) {
    throw new TransformExecutionPlanError(
      `node ${node.nodeId} declares sandbox "none" but kind "${node.kind}" is not a declared-trusted Sporta capability`,
      "sandbox-unsupported",
      node.nodeId,
    );
  }
  if (node.sandbox.hostSecretAccess !== false) {
    throw new TransformExecutionPlanError(
      `node ${node.nodeId} requests host secret access — denied by the sandbox law (never granted by default)`,
      "sandbox-unsupported",
      node.nodeId,
    );
  }
  if (node.sandbox.networkEgress === "allowlisted") {
    throw new TransformExecutionPlanError(
      `node ${node.nodeId} requests allowlisted network egress — no allowlist exists in this environment (default deny)`,
      "sandbox-unsupported",
      node.nodeId,
    );
  }
}

/** Per-node resource-envelope projection: sums and placement by class. */
function projectResources(nodes: readonly TransformNode[]): TransformExecutionPlan["resources"] {
  let totalMaxOutputBytes = 0;
  const placement: { nodeId: string; cpuClass: "light" | "standard" | "heavy"; memoryMiB: number }[] = [];
  for (const node of nodes) {
    totalMaxOutputBytes += node.resources.maxOutputBytes;
    placement.push({
      nodeId: node.nodeId,
      cpuClass: node.resources.cpuClass,
      memoryMiB: node.resources.memoryMiB,
    });
  }
  return { totalMaxOutputBytes, placement };
}
