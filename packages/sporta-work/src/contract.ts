/**
 * sporta-work — semantic owner of Intent -> WorkGraph state.
 *
 * State owner (canonical contracts): Sporta Work. Runs execute through
 * the ZCode AgentRuntime — never a second runtime — via the execution
 * seam owned by this module's adapters layer.
 */
import type {
  IntentSpec,
  SportaId,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphRecord,
} from "@sporta/contracts/contract";

export type {
  IntentSpec,
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

/**
 * The WorkGraph port. One canonical owner per graph. Appends are
 * idempotent per (workGraphId, nodeId); retries never duplicate nodes.
 */
export interface WorkGraphPort {
  openIntent(input: OpenIntentInput): Promise<WorkGraphRecord>;
  readWorkGraph(workGraphId: SportaId): Promise<WorkGraphRecord | null>;
  appendNode(input: AppendWorkNodeInput): Promise<WorkGraphNode>;
}
