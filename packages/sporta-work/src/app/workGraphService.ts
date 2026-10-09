/**
 * WorkGraphService — the app-layer orchestrator. Implements the WorkGraph
 * ports (frozen v1 + additive lifecycle/ledger + Wave 3 refs) over an
 * injected store port and injectable clock. All domain logic lives in
 * src/domain (pure).
 */
import type {
  SportaId,
  WorkGraphNode,
  WorkGraphNodeRef,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type {
  AppendWorkNodeInput,
  CommitArtifactRevisionInput,
  EscalateGapInput,
  OpenIntentInput,
  RecordArenaResultInput,
  WorkAppendRecord,
  WorkGraphLifecyclePort,
  WorkGraphLedgerPort,
  WorkGraphPort,
  WorkGraphRefsPort,
  WorkGraphStatus,
} from "../domain/ports.js";
import {
  appendToWorkGraph,
  createWorkGraph,
  transitionWorkGraphStatus,
  workGraphIdForIntent,
  type StoredWorkGraph,
} from "../domain/workGraph.js";
import { appendRefsToNode, requireNodeOfKind } from "../domain/nodeRefs.js";
import { stableEquals } from "../domain/hash.js";
import { WorkGraphIntentConflictError, WorkGraphNotFoundError } from "../domain/errors.js";

/**
 * Persistence port (module-internal; never exported from contract.ts as a
 * requirement — implementers get it via the app layer re-export).
 */
export interface WorkGraphStorePort {
  read(workGraphId: SportaId): Promise<StoredWorkGraph | null>;
  write(stored: StoredWorkGraph): Promise<void>;
}

/** Constructor dependencies (ports + clock, all injectable). */
export interface WorkGraphServiceDeps {
  store: WorkGraphStorePort;
  /** Injectable ISO-8601 clock (fixtures inject a fixed clock). */
  now: () => string;
}

/** The single canonical writer of WorkGraph state. */
export class WorkGraphService
  implements WorkGraphPort, WorkGraphLifecyclePort, WorkGraphLedgerPort, WorkGraphRefsPort
{
  private readonly store: WorkGraphStorePort;
  private readonly now: () => string;

  constructor(deps: WorkGraphServiceDeps) {
    this.store = deps.store;
    this.now = deps.now;
  }

  async openIntent(input: OpenIntentInput): Promise<WorkGraphRecord> {
    const workGraphId = input.workGraphId ?? workGraphIdForIntent(input.intent);
    const existing = await this.store.read(workGraphId);
    if (existing) {
      if (!stableEquals(existing.graph.intent, input.intent)) {
        throw new WorkGraphIntentConflictError(
          `work graph ${workGraphId} already exists with a different intent`,
        );
      }
      return existing.graph;
    }
    const stored: StoredWorkGraph = {
      graph: createWorkGraph(workGraphId, input.intent, this.now()),
      appends: [],
    };
    await this.store.write(stored);
    return stored.graph;
  }

  async readWorkGraph(workGraphId: SportaId): Promise<WorkGraphRecord | null> {
    const stored = await this.store.read(workGraphId);
    return stored === null ? null : stored.graph;
  }

  async appendNode(input: AppendWorkNodeInput): Promise<WorkGraphNode> {
    const stored = await this.requireGraph(input.workGraphId);
    const result = appendToWorkGraph(
      stored,
      {
        nodeId: input.nodeId,
        kind: input.kind,
        parent: input.parent,
        actor: input.actor,
      },
      this.now(),
    );
    if (result.created) await this.store.write(result.stored);
    return result.node;
  }

  async transitionStatus(workGraphId: SportaId, next: WorkGraphStatus): Promise<WorkGraphRecord> {
    const stored = await this.requireGraph(workGraphId);
    const updated = transitionWorkGraphStatus(stored, next, this.now());
    if (updated !== stored) await this.store.write(updated);
    return updated.graph;
  }

  async readAppends(workGraphId: SportaId): Promise<readonly WorkAppendRecord[]> {
    const stored = await this.requireGraph(workGraphId);
    return stored.appends;
  }

  /**
   * Wave 3 — escalate a capability gap on one node: take the escalation
   * edge (executing/awaiting-user -> escalated) and append the
   * `capability-gap` + `escalation` refs to the owning node. Illegal status
   * edges throw before any write (no partial state). Idempotent: a retry
   * on an already-escalated graph with the same refs writes nothing.
   */
  async escalateGap(input: EscalateGapInput): Promise<WorkGraphRecord> {
    const stored = await this.requireGraph(input.workGraphId);
    const refs: readonly WorkGraphNodeRef[] = [
      { kind: "capability-gap", refId: input.gapId },
      { kind: "escalation", refId: input.escalationId },
    ];
    const escalated = transitionWorkGraphStatus(stored, "escalated", this.now());
    const result = appendRefsToNode(escalated, input.nodeId, refs, this.now());
    if (escalated !== stored || result.appended) await this.store.write(result.stored);
    return result.stored.graph;
  }

  /**
   * Wave 3 — record a validated Arena result on one node: append the
   * `arena-result` ref; when the arena owns the frontier (status
   * `escalated`) the result resolves it back to `executing`. Recording a
   * result on a non-escalated graph only appends the ref (e.g. a result
   * landing after closure — cross-domain facts stay recordable; refs are
   * never removed). Idempotent per input.
   */
  async recordArenaResult(input: RecordArenaResultInput): Promise<WorkGraphRecord> {
    const stored = await this.requireGraph(input.workGraphId);
    const refs: readonly WorkGraphNodeRef[] = [{ kind: "arena-result", refId: input.resultId }];
    const resolved =
      stored.graph.status === "escalated"
        ? transitionWorkGraphStatus(stored, "executing", this.now())
        : stored;
    const result = appendRefsToNode(resolved, input.nodeId, refs, this.now());
    if (resolved !== stored || result.appended) await this.store.write(result.stored);
    return result.stored.graph;
  }

  /**
   * Wave 3 — commit an artifact revision onto an artifact node: append
   * the `artifact-revision` ref. The node must exist and be kind
   * `artifact` (typed refusal otherwise). No status change — revision
   * commits are not graph status transitions. Idempotent per input.
   */
  async commitArtifactRevision(input: CommitArtifactRevisionInput): Promise<WorkGraphNode> {
    const stored = await this.requireGraph(input.workGraphId);
    requireNodeOfKind(stored, input.nodeId, "artifact");
    const refs: readonly WorkGraphNodeRef[] = [
      { kind: "artifact-revision", refId: input.revisionId },
    ];
    const result = appendRefsToNode(stored, input.nodeId, refs, this.now());
    if (result.appended) await this.store.write(result.stored);
    return result.node;
  }

  private async requireGraph(workGraphId: SportaId): Promise<StoredWorkGraph> {
    const stored = await this.store.read(workGraphId);
    if (stored === null) throw new WorkGraphNotFoundError(`work graph not found: ${workGraphId}`);
    return stored;
  }
}
