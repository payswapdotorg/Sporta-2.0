/**
 * Real ZCode AgentRuntime adapter — SPAWNS a real zcode-cli process and captures real events.
 *
 * This adapter implements the AgentRuntimeExecutionPort interface by spawning
 * the actual ZCode CLI as a child process and observing its real execution events.
 * The fixture adapter remains for tests that explicitly label it fixture.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  AgentRunEvent,
  AgentRunHandle,
  AgentRuntimeExecutionPort,
  StartAgentRunInput,
} from "../domain/ports.js";
import { spawn, ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

interface ActiveRun {
  process: ChildProcess;
  events: AgentRunEvent[];
  completed: boolean;
}

export interface ZCodeAgentRuntimeDeps {
  /** Path to zcode-cli executable (defaults to repo-relative apps/zcode-cli/dist/zcode.cjs) */
  zcodeCliPath?: string;
  /** Injectable ISO-8601 clock. */
  now: () => string;
}

/**
 * Real execution adapter that spawns zcode-cli processes and captures real events.
 * Implements the AgentRuntimeExecutionPort interface with actual process execution.
 */
export class ZCodeAgentRuntimeAdapter implements AgentRuntimeExecutionPort {
  private readonly activeRuns = new Map<SportaId, ActiveRun>();
  private readonly eventEmitter = new EventEmitter();
  private readonly zcodeCliPath: string;
  private readonly now: () => string;

  constructor(deps: ZCodeAgentRuntimeDeps) {
    this.zcodeCliPath = deps.zcodeCliPath || "./apps/zcode-cli/dist/zcode.cjs";
    this.now = deps.now;
  }

  async startRun(input: StartAgentRunInput): Promise<AgentRunHandle> {
    const runId = `run:${input.workGraphId}:${input.organization.organizationId}:${input.organization.version}`;
    
    // Check if run already exists
    const existing = this.activeRuns.get(runId);
    if (existing && !existing.completed) {
      return {
        runId,
        workGraphId: input.workGraphId,
        startedAt: existing.events[0]?.at || this.now(),
      };
    }

    // Create a new run
    const handle: AgentRunHandle = {
      runId,
      workGraphId: input.workGraphId,
      startedAt: this.now(),
    };

    // Build the zcode-cli command
    const args = [
      "target", // Use target command for programmatic execution
      input.task, // The task to execute
      "--json", // JSON output for easier parsing
      "--output-format", "stream-json", // Stream JSON for real-time events
    ];

    // Spawn the zcode-cli process
    const process = spawn(this.zcodeCliPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Ensure clean environment for reproducible runs
        NODE_ENV: "test",
      },
    });

    const events: AgentRunEvent[] = [];
    let completed = false;

    // Handle process output
    process.stdout.on("data", (data: Buffer) => {
      try {
        const lines = data.toString().split("\n").filter(line => line.trim());
        for (const line of lines) {
          const event = this.parseEvent(line, runId);
          if (event) {
            events.push(event);
            this.eventEmitter.emit("event", runId, event);
          }
        }
      } catch (error) {
        // Emit error event instead of logging
        const errorEvent: AgentRunEvent = {
          runId,
          seq: events.length + 1,
          type: "failed",
          detail: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
          at: this.now(),
        };
        events.push(errorEvent);
        this.eventEmitter.emit("event", runId, errorEvent);
      }
    });

    // Handle process errors
    process.stderr.on("data", (data: Buffer) => {
      const errorEvent: AgentRunEvent = {
        runId,
        seq: events.length + 1,
        type: "failed",
        detail: `Process error: ${data.toString()}`,
        at: this.now(),
      };
      events.push(errorEvent);
      this.eventEmitter.emit("event", runId, errorEvent);
    });

    // Handle process exit
    process.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      completed = true;
      const exitEvent: AgentRunEvent = {
        runId,
        seq: events.length + 1,
        type: code === 0 ? "completed" : "failed",
        detail: `Process exited with code ${code}${signal ? `, signal: ${signal}` : ""}`,
        at: this.now(),
      };
      events.push(exitEvent);
      this.eventEmitter.emit("event", runId, exitEvent);
    });

    // Store the active run
    this.activeRuns.set(runId, { process, events, completed });

    // Return the handle
    return handle;
  }

  async observeRun(runRef: SportaId): Promise<readonly AgentRunEvent[]> {
    const run = this.activeRuns.get(runRef);
    if (!run) return [];
    
    // Return a copy of the events to prevent external mutation
    return run.events.map(event => ({ ...event }));
  }

  /**
   * Clean up all active runs by killing their processes.
   * Called when the adapter is being disposed.
   */
  dispose(): void {
    for (const [runId, run] of this.activeRuns) {
      if (!run.completed && !run.process.killed) {
        run.process.kill();
        const cleanupEvent: AgentRunEvent = {
          runId,
          seq: run.events.length + 1,
          type: "failed",
          detail: "Process killed by adapter disposal",
          at: this.now(),
        };
        run.events.push(cleanupEvent);
      }
    }
    this.activeRuns.clear();
  }

  /**
   * Parse a line of zcode-cli JSON output into an AgentRunEvent.
   */
  private parseEvent(line: string, runId: SportaId): AgentRunEvent | null {
    try {
      const data = JSON.parse(line);
      
      // Map zcode-cli event types to AgentRunEvent types
      let type: AgentRunEvent["type"];
      switch (data.type?.toLowerCase()) {
        case "start":
        case "started":
          type = "started";
          break;
        case "progress":
        case "working":
          type = "progress";
          break;
        case "complete":
        case "completed":
          type = "completed";
          break;
        case "error":
        case "fail":
        case "failed":
          type = "failed";
          break;
        default:
          // Unknown type, treat as progress
          type = "progress";
      }

      return {
        runId,
        seq: data.sequence || 1,
        type,
        detail: data.message || data.detail || JSON.stringify(data),
        at: data.timestamp || this.now(),
      };
    } catch (error) {
      // If parsing fails, create a generic progress event
      return {
        runId,
        seq: 1,
        type: "progress",
        detail: `Raw output: ${line}`,
        at: this.now(),
      };
    }
  }
}