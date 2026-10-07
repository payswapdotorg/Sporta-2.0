/**
 * WorkGraph aggregate — pure domain logic (no IO, no timers, no awaits).
 * State transitions are pure functions; the app service orchestrates them
 * through the store port. See packages/sporta-work/SPEC.md for the
 * status machine, trigger table and idempotency rules.
 */
import type {
  IntentSpec,
  Iso8601,
  SportaId,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { ActorDescriptor, WorkAppendRecord, WorkGraphStatus } from "./ports.js";
import { fnv1aHex, stableStringify } from "./hash.js";
import {
  WorkGraphNodeConflictError,
  WorkGraphNodeParentError,
  WorkGraphStatusError,
} from "./errors.js";

/** Persisted aggregate: the graph record plus its append ledger. */
export interface StoredWorkGraph {
  graph: WorkGraphRecord;
  appends: readonly WorkAppendRecord[];
}

/** Explicit successor table — the only legal status transitions. */
const STATUS_SUCCESSORS: Record<WorkGraphStatus, readonly WorkGraphStatus[]> = {
  open: ["executing", "awaiting-user"],
  executing: ["awaiting-user", "escalated", "closed"],
  "awaiting-user": ["executing", "escalated", "closed"],
  escalated: ["executing", "closed"],
  closed: [],
};

type AppendTrigger = "agent-activity" | "user-activity" | "work-completed" | "observation";

/** Which lifecycle trigger an (kind, actorKind) append asserts. */
function triggerForAppend(
  kind: WorkGraphNodeKind,
  actorKind: ActorDescriptor["actorKind"],
): AppendTrigger {
  if (kind === "evidence") return "observation";
  if (kind === "outcome") return "work-completed";
  if (actorKind === "arena-session") return "observation";
  if (actorKind === "agent-run") return "agent-activity";
  return "user-activity";
}

/** Apply an append trigger to a status. Illegal edges throw. */
function statusForTrigger(
  current: WorkGraphStatus,
  trigger: AppendTrigger,
  kind: WorkGraphNodeKind,
): WorkGraphStatus {
  if (current === "closed") {
    if (trigger === "observation" && kind === "evidence") return "closed";
    throw new WorkGraphStatusError(
      `work graph is closed; only evidence appends are accepted (kind=${kind}, trigger=${trigger})`,
    );
  }
  switch (trigger) {
    case "agent-activity":
      if (current === "open" || current === "awaiting-user") return "executing";
      if (current === "executing") return "executing";
      throw new WorkGraphStatusError(
        `agent activity is illegal while status is ${current} (arena owns the frontier)`,
      );
    case "user-activity":
      if (current === "open" || current === "executing") return "awaiting-user";
      if (current === "awaiting-user") return "awaiting-user";
      throw new WorkGraphStatusError(`user activity is illegal while status is ${current}`);
    case "work-completed":
      if (current === "executing" || current === "awaiting-user" || current === "escalated") {
        return "closed";
      }
      throw new WorkGraphStatusError(
        `outcome is illegal while status is ${current} (nothing completed yet)`,
      );
    case "observation":
      return current;
  }
}

/** Deterministic auto id for an intent (idempotency without an explicit id). */
export function workGraphIdForIntent(intent: IntentSpec): SportaId {
  return `wg:${fnv1aHex(stableStringify(intent))}`;
}

/** Create a fresh open graph (no nodes). */
export function createWorkGraph(
  workGraphId: SportaId,
  intent: IntentSpec,
  now: Iso8601,
): WorkGraphRecord {
  return {
    workGraphId,
    intent,
    nodes: [],
    createdAt: now,
    updatedAt: now,
    status: "open",
  };
}

export interface AppendDomainInput {
  nodeId?: SportaId;
  kind: WorkGraphNodeKind;
  parent?: SportaId;
  actor: ActorDescriptor;
}

export interface AppendDomainResult {
  stored: StoredWorkGraph;
  node: WorkGraphNode;
  append: WorkAppendRecord;
  created: boolean;
}

/**
 * Append one node. Idempotent per nodeId: an identical (kind, parent)
 * retry returns the existing node with no state change; a differing
 * definition is a typed conflict. `seq` is monotonic; parent must exist.
 */
export function appendToWorkGraph(
  stored: StoredWorkGraph,
  input: AppendDomainInput,
  now: Iso8601,
): AppendDomainResult {
  const { graph } = stored;
  const nextSeq = graph.nodes.reduce((max, node) => Math.max(max, node.seq), 0) + 1;
  const nodeId = input.nodeId ?? `node:${graph.workGraphId}:${nextSeq}`;

  const existing = graph.nodes.find((node) => node.nodeId === nodeId);
  if (existing) {
    if (existing.kind !== input.kind || existing.parent !== input.parent) {
      throw new WorkGraphNodeConflictError(
        `node ${nodeId} already exists with a different definition (kind/parent mismatch)`,
      );
    }
    const ledgerEntry = stored.appends.find((entry) => entry.nodeId === nodeId);
    const append: WorkAppendRecord = ledgerEntry ?? {
      workGraphId: graph.workGraphId,
      nodeId: existing.nodeId,
      kind: existing.kind,
      ...(existing.parent === undefined ? {} : { parent: existing.parent }),
      seq: existing.seq,
      actor: input.actor,
      appendedAt: now,
    };
    return { stored, node: existing, append, created: false };
  }

  if (input.parent !== undefined && !graph.nodes.some((node) => node.nodeId === input.parent)) {
    throw new WorkGraphNodeParentError(
      `parent ${input.parent} does not exist in work graph ${graph.workGraphId}`,
    );
  }

  const status = statusForTrigger(
    graph.status,
    triggerForAppend(input.kind, input.actor.actorKind),
    input.kind,
  );
  const node: WorkGraphNode =
    input.parent === undefined
      ? { nodeId, kind: input.kind, seq: nextSeq }
      : { nodeId, kind: input.kind, parent: input.parent, seq: nextSeq };
  const append: WorkAppendRecord = {
    workGraphId: graph.workGraphId,
    nodeId,
    kind: input.kind,
    ...(input.parent === undefined ? {} : { parent: input.parent }),
    seq: nextSeq,
    actor: input.actor,
    appendedAt: now,
  };
  const updatedGraph: WorkGraphRecord = {
    ...graph,
    nodes: [...graph.nodes, node],
    status,
    updatedAt: now,
  };
  return {
    stored: { graph: updatedGraph, appends: [...stored.appends, append] },
    node,
    append,
    created: true,
  };
}

/**
 * Explicit status transition. Same status is an idempotent no-op; only
 * the successor-table edges are legal; everything else throws.
 */
export function transitionWorkGraphStatus(
  stored: StoredWorkGraph,
  next: WorkGraphStatus,
  now: Iso8601,
): StoredWorkGraph {
  const { graph } = stored;
  if (graph.status === next) return stored;
  const successors = STATUS_SUCCESSORS[graph.status];
  if (!successors.includes(next)) {
    throw new WorkGraphStatusError(
      `illegal status transition ${graph.status} -> ${next} (legal: ${successors.join(", ") || "none"})`,
    );
  }
  return {
    ...stored,
    graph: { ...graph, status: next, updatedAt: now },
  };
}
