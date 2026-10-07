/**
 * sporta-work — semantic owner of Intent -> WorkGraph state.
 *
 * State owner (canonical contracts): Sporta Work. Runs execute through
 * the ZCode AgentRuntime — never a second runtime — via the execution
 * seam declared in the domain layer (simulated by a fixture adapter
 * until the ZCode adapter lands in a later wave).
 *
 * Single public entrypoint. Declarations live in module-internal files
 * (src/domain/*, src/app/*, src/adapters/*) and are re-exported here —
 * the Wave 0 layout used by sporta-contracts. The v1 surface below is
 * unchanged; Wave 1 additions are additive (lifecycle, ledger, execution
 * seam, service and fixture adapters).
 */
export type {
  IntentSpec,
  SportaId,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphRecord,
} from "@sporta/contracts/contract";

export type {
  ActorDescriptor,
  OpenIntentInput,
  AppendWorkNodeInput,
  WorkAppendRecord,
  WorkGraphStatus,
  WorkGraphPort,
  WorkGraphLifecyclePort,
  WorkGraphLedgerPort,
  StartAgentRunInput,
  AgentRunHandle,
  AgentRunEvent,
  AgentRuntimeExecutionPort,
} from "./domain/ports.js";

export {
  WorkGraphStatusError,
  WorkGraphIntentConflictError,
  WorkGraphNodeConflictError,
  WorkGraphNodeParentError,
  WorkGraphNotFoundError,
} from "./domain/errors.js";

export { WorkGraphService } from "./app/workGraphService.js";
export type { WorkGraphServiceDeps, WorkGraphStorePort } from "./app/workGraphService.js";

export { InMemoryWorkGraphStore } from "./adapters/inMemoryWorkGraphStore.js";
export { FixtureAgentRuntimeAdapter } from "./adapters/fixtureAgentRuntime.js";
export type { FixtureAgentRuntimeDeps } from "./adapters/fixtureAgentRuntime.js";
export { systemClockNow } from "./adapters/clock.js";
