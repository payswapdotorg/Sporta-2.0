/**
 * sporta-work — semantic owner of Intent -> WorkGraph state.
 *
 * State owner (canonical contracts): Sporta Work. Runs execute through
 * the ZCode AgentRuntime — never a second runtime — via the execution
 * seam declared in the domain layer (the Wave 2 ZCode adapter spawns the
 * real CLI; the fixture adapter simulates for fixture-labeled tests).
 *
 * Single public entrypoint. Declarations live in module-internal files
 * (src/domain/*, src/app/*, src/adapters/*) and are re-exported here —
 * the Wave 0 layout used by sporta-contracts. The v1 surface below is
 * unchanged; Wave 1 additions are additive (lifecycle, ledger, execution
 * seam, service and fixture adapters). Wave 2 adds the REAL ZCode
 * AgentRuntime adapter alongside the fixture (additive; the fixture
 * stays for fixture-labeled tests). Wave 3 adds the refs port (typed
 * cross-domain reference appends — ADR wave-3 read seams).
 */
export type {
  IntentSpec,
  SportaId,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphNodeRef,
  WorkGraphNodeRefKind,
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
  EscalateGapInput,
  RecordArenaResultInput,
  CommitArtifactRevisionInput,
  WorkGraphRefsPort,
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
  WorkGraphNodeNotFoundError,
  WorkGraphNodeKindError,
  WorkGraphNodeRefError,
} from "./domain/errors.js";

export { WorkGraphService } from "./app/workGraphService.js";
export type { WorkGraphServiceDeps, WorkGraphStorePort } from "./app/workGraphService.js";

export { InMemoryWorkGraphStore } from "./adapters/inMemoryWorkGraphStore.js";
export { FixtureAgentRuntimeAdapter } from "./adapters/fixtureAgentRuntime.js";
export type { FixtureAgentRuntimeDeps } from "./adapters/fixtureAgentRuntime.js";
export { ZCodeAgentRuntimeAdapter } from "./adapters/zcodeAgentRuntime.js";
export type { ZCodeAgentRuntimeDeps } from "./adapters/zcodeAgentRuntime.js";
export { systemClockNow } from "./adapters/clock.js";
