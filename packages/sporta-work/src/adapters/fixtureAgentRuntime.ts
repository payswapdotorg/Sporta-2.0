/**
 * Fixture execution adapter — DETERMINISTIC SIMULATION of AgentRuntime run
 * events for the declared execution seam.
 *
 * This is NOT the ZCode AgentRuntime and never becomes one
 * (architecture-lock invariant 2). It exists so the seam's types and event
 * shapes are executable in tests while the real adapter lands in a later
 * wave. Fixture-grade only: events carry "fixture simulation" details.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  AgentRunEvent,
  AgentRunHandle,
  AgentRuntimeExecutionPort,
  StartAgentRunInput,
} from "../domain/ports.js";

interface SimulatedRun {
  handle: AgentRunHandle;
  events: readonly AgentRunEvent[];
}

export interface FixtureAgentRuntimeDeps {
  /** Injectable ISO-8601 clock. */
  now: () => string;
}

export class FixtureAgentRuntimeAdapter implements AgentRuntimeExecutionPort {
  private readonly runs = new Map<SportaId, SimulatedRun>();
  private readonly now: () => string;

  constructor(deps: FixtureAgentRuntimeDeps) {
    this.now = deps.now;
  }

  async startRun(input: StartAgentRunInput): Promise<AgentRunHandle> {
    const runId = `run:${input.workGraphId}:${input.organization.organizationId}:${input.organization.version}`;
    const existing = this.runs.get(runId);
    if (existing) return { ...existing.handle };
    const handle: AgentRunHandle = {
      runId,
      workGraphId: input.workGraphId,
      startedAt: this.now(),
    };
    const events: AgentRunEvent[] = [
      {
        runId,
        seq: 1,
        type: "started",
        detail: `fixture simulation of task: ${input.task}`,
        at: handle.startedAt,
      },
      {
        runId,
        seq: 2,
        type: "progress",
        detail: "fixture simulation step (no real execution)",
        at: handle.startedAt,
      },
      {
        runId,
        seq: 3,
        type: "completed",
        detail: "fixture simulation completed deterministically",
        at: handle.startedAt,
      },
    ];
    this.runs.set(runId, { handle, events });
    return { ...handle };
  }

  async observeRun(runRef: SportaId): Promise<readonly AgentRunEvent[]> {
    const run = this.runs.get(runRef);
    if (run === undefined) return [];
    return run.events.map((event) => ({ ...event }));
  }
}
