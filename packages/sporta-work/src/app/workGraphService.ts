/**
 * WorkGraphService — the app-layer orchestrator. Implements the WorkGraph
 * ports (frozen v1 + additive lifecycle/ledger) over an injected store
 * port and injectable clock. All domain logic lives in src/domain (pure).
 */
import type { SportaId, WorkGraphNode, WorkGraphRecord } from "@sporta/contracts/contract";
import type {
  AppendWorkNodeInput,
  OpenIntentInput,
  WorkAppendRecord,
  WorkGraphLifecyclePort,
  WorkGraphLedgerPort,
  WorkGraphPort,
  WorkGraphStatus,
} from "../domain/ports.js";
import {
  appendToWorkGraph,
  createWorkGraph,
  transitionWorkGraphStatus,
  workGraphIdForIntent,
  type StoredWorkGraph,
} from "../domain/workGraph.js";
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
  implements WorkGraphPort, WorkGraphLifecyclePort, WorkGraphLedgerPort
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

  private async requireGraph(workGraphId: SportaId): Promise<StoredWorkGraph> {
    const stored = await this.store.read(workGraphId);
    if (stored === null) throw new WorkGraphNotFoundError(`work graph not found: ${workGraphId}`);
    return stored;
  }
}
