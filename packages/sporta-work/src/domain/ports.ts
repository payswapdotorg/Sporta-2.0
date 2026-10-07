/**
 * sporta-work public types and ports (declarations).
 *
 * Declarations live in this module-internal file; `src/contract.ts` is the
 * single public entrypoint re-exporting this surface (Wave 0 layout, same
 * as sporta-contracts src/records/*). The v1 surface (ActorDescriptor,
 * OpenIntentInput, AppendWorkNodeInput, WorkGraphPort) moved here verbatim;
 * Wave 1 additions are additive.
 */
import type {
  IntentSpec,
  Iso8601,
  OrganizationVersionRecord,
  SportaId,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphRecord,
} from "@sporta/contracts/contract";

/** Who is appending to the graph (agent run, user, editor session, Arena observer). */
export interface ActorDescriptor {
  actorKind: "agent-run" | "user" | "editor-session" | "arena-session";
  actorRef: SportaId;
}

/** Input for admitting an intent. `workGraphId` provides idempotency. */
export interface OpenIntentInput {
  workGraphId?: SportaId;
  intent: IntentSpec;
}

/** Input for appending one node to a WorkGraph. `nodeId` provides idempotency. */
export interface AppendWorkNodeInput {
  workGraphId: SportaId;
  nodeId?: SportaId;
  kind: WorkGraphNodeKind;
  parent?: SportaId;
  actor: ActorDescriptor;
}

/** One append with actor provenance — manual takeover is first-class evidence. */
export interface WorkAppendRecord {
  workGraphId: SportaId;
  nodeId: SportaId;
  kind: WorkGraphNodeKind;
  parent?: SportaId;
  seq: number;
  actor: ActorDescriptor;
  appendedAt: Iso8601;
}

/** WorkGraph lifecycle status (from the frozen WorkGraphRecord contract). */
export type WorkGraphStatus = WorkGraphRecord["status"];

/**
 * The WorkGraph port. One canonical owner per graph. Appends are
 * idempotent per (workGraphId, nodeId); retries never duplicate nodes.
 */
export interface WorkGraphPort {
  openIntent(input: OpenIntentInput): Promise<WorkGraphRecord>;
  readWorkGraph(workGraphId: SportaId): Promise<WorkGraphRecord | null>;
  appendNode(input: AppendWorkNodeInput): Promise<WorkGraphNode>;
}

/**
 * Explicit lifecycle control for edges appends cannot express
 * (e.g. Arena escalation / resolution). Idempotent per target status.
 */
export interface WorkGraphLifecyclePort {
  transitionStatus(workGraphId: SportaId, next: WorkGraphStatus): Promise<WorkGraphRecord>;
}

/** Append ledger: actor provenance per node (user takeover evidence trail). */
export interface WorkGraphLedgerPort {
  readAppends(workGraphId: SportaId): Promise<readonly WorkAppendRecord[]>;
}

/** Task handed to the execution seam for one run. */
export interface StartAgentRunInput {
  workGraphId: SportaId;
  organization: OrganizationVersionRecord;
  task: string;
}

/** Handle for one started run. */
export interface AgentRunHandle {
  runId: SportaId;
  workGraphId: SportaId;
  startedAt: Iso8601;
}

/** One observed run event. */
export interface AgentRunEvent {
  runId: SportaId;
  seq: number;
  type: "started" | "progress" | "completed" | "failed";
  detail: string;
  at: Iso8601;
}

/**
 * Execution seam declaration ONLY. ZCode's AgentRuntime adapter implements
 * this port in a later wave; sporta-work never implements a second
 * runtime (architecture-lock invariant 2). The adapter in src/adapters is
 * a deterministic fixture simulation, not a runtime.
 */
export interface AgentRuntimeExecutionPort {
  startRun(input: StartAgentRunInput): Promise<AgentRunHandle>;
  observeRun(runRef: SportaId): Promise<readonly AgentRunEvent[]>;
}
