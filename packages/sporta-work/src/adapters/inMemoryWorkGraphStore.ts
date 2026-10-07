/**
 * In-memory WorkGraph store — deterministic fixture-grade persistence.
 * Never production truth: it proves semantics (idempotency, ordering),
 * not durability. Defensive JSON clones on read/write keep store
 * boundaries honest (callers never alias stored state).
 */
import type { SportaId } from "@sporta/contracts/contract";
import type { StoredWorkGraph } from "../domain/workGraph.js";
import type { WorkGraphStorePort } from "../app/workGraphService.js";

export class InMemoryWorkGraphStore implements WorkGraphStorePort {
  private readonly graphs = new Map<SportaId, StoredWorkGraph>();

  async read(workGraphId: SportaId): Promise<StoredWorkGraph | null> {
    const stored = this.graphs.get(workGraphId);
    return stored === undefined ? null : cloneStored(stored);
  }

  async write(stored: StoredWorkGraph): Promise<void> {
    this.graphs.set(stored.graph.workGraphId, cloneStored(stored));
  }
}

function cloneStored(stored: StoredWorkGraph): StoredWorkGraph {
  return JSON.parse(JSON.stringify(stored)) as StoredWorkGraph;
}
