/**
 * sporta-work public types and ports (declarations).
 *
 * Declarations live in this module-internal file; `src/contract.ts` is the
 * single public entrypoint re-exporting this surface (Wave 0 layout, same
 * as sporta-contracts src/records/*). The v1 surface (ActorDescriptor,
 * OpenIntentInput, AppendWorkNodeInput, WorkGraphPort) moved here verbatim;
 * Wave 1 additions are additive. Wave 3 adds the refs port (typed
 * cross-domain reference appends at status transitions the service already
 * owns — ADR: docs/architecture/adr-wave3-read-seams.md).
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
 * this port (Wave 2: src/adapters/zcodeAgentRuntime.ts spawns the real
 * CLI process); sporta-work never implements a second
 * runtime (architecture-lock invariant 2). The fixture adapter in
 * src/adapters remains for fixture-labeled tests.
 */
export interface AgentRuntimeExecutionPort {
  startRun(input: StartAgentRunInput): Promise<AgentRunHandle>;
  observeRun(runRef: SportaId): Promise<readonly AgentRunEvent[]>;
}

/**
 * Wave 3 — escalate a capability gap on one node of a WorkGraph. Appends a
 * `capability-gap` ref (gapId) and an `escalation` ref (escalationId) to
 * the owning node AND takes the escalation status edge the service already
 * owns (executing/awaiting-user -> escalated). Idempotent per input.
 */
export interface EscalateGapInput {
  workGraphId: SportaId;
  /** The node that owns the gap (must exist in the graph). */
  nodeId: SportaId;
  gapId: SportaId;
  escalationId: SportaId;
}

/**
 * Wave 3 — record a validated Arena result on one node. Appends an
 * `arena-result` ref (resultId) to the owning node; when the graph is
 * escalated the result resolves the arena frontier back to `executing`
 * (the resolution edge the service already owns). Idempotent per input.
 */
export interface RecordArenaResultInput {
  workGraphId: SportaId;
  /** The node that owns the escalated gap (must exist in the graph). */
  nodeId: SportaId;
  resultId: SportaId;
}

/**
 * Wave 3 — commit an artifact revision onto an artifact node. Appends an
 * `artifact-revision` ref (revisionId) to the artifact node. No status
 * change: revision commits are not graph status transitions. Idempotent
 * per input.
 */
export interface CommitArtifactRevisionInput {
  workGraphId: SportaId;
  /** The artifact node carrying the lineage (must exist and be kind `artifact`). */
  nodeId: SportaId;
  revisionId: SportaId;
}

/**
 * Wave 3 additive — typed cross-domain reference appends at the status
 * transitions sporta-work already owns (ADR wave-3 read seams). Refs are
 * an immutable append-only ledger: never removed, never rewritten. Only
 * the four produced kinds (capability-gap, escalation, arena-result,
 * artifact-revision) are appendable through this port — editor-session and
 * learning-artifact refs are other lanes' outputs and stay read-only here.
 */
export interface WorkGraphRefsPort {
  escalateGap(input: EscalateGapInput): Promise<WorkGraphRecord>;
  recordArenaResult(input: RecordArenaResultInput): Promise<WorkGraphRecord>;
  commitArtifactRevision(input: CommitArtifactRevisionInput): Promise<WorkGraphNode>;
}
