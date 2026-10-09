/**
 * Real ZCode AgentRuntime adapter — SPAWNS the zcode-cli binary as a real
 * child process and turns its real process lifecycle into typed
 * AgentRunEvent evidence on the declared AgentRuntimeExecutionPort seam.
 *
 * Real evidence only: events carry the observed process output, the real
 * wall-clock timestamps come from the injected clock, and the terminal
 * event's verdict comes from the REAL process exit code (never inferred
 * from stderr chatter). The fixture adapter
 * (fixtureAgentRuntime.ts) remains for tests that explicitly label their
 * evidence fixture-grade.
 *
 * zcode-cli headless invocation (see apps/zcode-cli/packages/cli/src/
 * arguments.ts + run.ts): `zcode --prompt <task> --output-format
 * stream-json` — session events stream as JSON lines on stdout.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  AgentRunEvent,
  AgentRunHandle,
  AgentRuntimeExecutionPort,
  StartAgentRunInput,
} from "../domain/ports.js";
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

interface ActiveRun {
  child: ChildProcess;
  events: AgentRunEvent[];
  completed: boolean;
}

export interface ZCodeAgentRuntimeDeps {
  /**
   * Executable spawned per run. Defaults to the repo-built zcode-cli
   * bundle (apps/zcode-cli/packages/cli/dist/zcode.cjs), resolved from
   * this module so the caller's cwd cannot skew it.
   */
  zcodeCliPath?: string;
  /** Injectable ISO-8601 clock. */
  now: () => string;
}

/**
 * Default CLI path resolved from this module: adapters/ -> src|dist ->
 * sporta-work -> packages -> repo root, then into the zcode-cli bundle.
 * (Same depth from src/ and dist/ because both live one level under the
 * package root.)
 */
const DEFAULT_ZCODE_CLI_PATH = fileURLToPath(
  new URL("../../../../apps/zcode-cli/packages/cli/dist/zcode.cjs", import.meta.url),
);

/**
 * Real execution adapter: one real child process per run, typed events,
 * deterministic-runId idempotency, and explicit process hygiene
 * (spawn-error capture, stdio drain before the terminal event, kill on
 * dispose). Implements the AgentRuntimeExecutionPort seam declared in
 * domain/ports.ts — this is the ZCode substrate, never a second runtime.
 */
export class ZCodeAgentRuntimeAdapter implements AgentRuntimeExecutionPort {
  private readonly activeRuns = new Map<SportaId, ActiveRun>();
  private readonly eventEmitter = new EventEmitter();
  private readonly zcodeCliPath: string;
  private readonly now: () => string;

  constructor(deps: ZCodeAgentRuntimeDeps) {
    this.zcodeCliPath = deps.zcodeCliPath ?? DEFAULT_ZCODE_CLI_PATH;
    this.now = deps.now;
  }

  async startRun(input: StartAgentRunInput): Promise<AgentRunHandle> {
    const runId = `run:${input.workGraphId}:${input.organization.organizationId}:${input.organization.version}`;
    // Idempotent per deterministic runId (spec law): a re-start of the
    // same run returns the existing handle — completed runs are NOT
    // silently re-executed.
    const existing = this.activeRuns.get(runId);
    if (existing !== undefined) {
      return {
        runId,
        workGraphId: input.workGraphId,
        startedAt: existing.events[0]?.at ?? this.now(),
      };
    }

    const startedAt = this.now();
    // Real zcode-cli headless interface: --prompt <task> with the
    // stream-json event format on stdout.
    const args = ["--prompt", input.task, "--output-format", "stream-json"];

    // NOTE: the spawn result is bound to `child`, NOT `process` — a local
    // named `process` would shadow the Node global inside its own options
    // initializer (TS7022/TS2448).
    const child = spawn(this.zcodeCliPath, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      // The adapter never drives the CLI's stdin; stdout/stderr are the
      // observed evidence channels.
      stdio: ["ignore", "pipe", "pipe"],
    });

    const events: AgentRunEvent[] = [];
    const activeRun: ActiveRun = { child, events, completed: false };
    this.activeRuns.set(runId, activeRun);

    /** Adapter-owned monotonic seq — ordering evidence is ours, not the CLI's. */
    const record = (type: AgentRunEvent["type"], detail: string, at: string = this.now()) => {
      const event: AgentRunEvent = { runId, seq: events.length + 1, type, detail, at };
      events.push(event);
      this.eventEmitter.emit("event", runId, event);
      return event;
    };

    // Real spawn observation: seq 1 records the real start moment.
    record("started", `spawned zcode-cli for task: ${input.task}`, startedAt);

    // stdout: parse the CLI's stream-json lines into typed events.
    child.stdout?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line.trim() === "") continue;
        const parsed = this.parseEvent(line);
        if (parsed !== null) record(parsed.type, parsed.detail, parsed.at);
      }
    });

    // stderr is REAL observation evidence, not a verdict: a CLI may warn
    // on stderr and still exit 0. The terminal verdict comes from the
    // exit code below.
    child.stderr?.on("data", (chunk: Buffer) => {
      record("progress", `stderr: ${chunk.toString().trim()}`);
    });

    /** Terminal transition — exactly one per run, whatever fires first. */
    const finish = (type: "completed" | "failed", detail: string) => {
      if (activeRun.completed) return;
      activeRun.completed = true;
      record(type, detail);
    };

    // Process hygiene: spawn failures (ENOENT, EACCES, ...) surface here
    // as REAL typed failure evidence instead of an unhandled 'error'.
    child.on("error", (error: Error) => {
      finish("failed", `zcode-cli process failed to start: ${error.message}`);
    });

    // 'close' (not 'exit'): fires only after the stdio streams drained,
    // so the terminal event is genuinely the last observed event.
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      finish(
        code === 0 ? "completed" : "failed",
        `zcode-cli exited with code ${code === null ? "null" : code}${signal === null ? "" : `, signal: ${signal}`}`,
      );
    });

    return { runId, workGraphId: input.workGraphId, startedAt };
  }

  async observeRun(runRef: SportaId): Promise<readonly AgentRunEvent[]> {
    const run = this.activeRuns.get(runRef);
    // The seam never fabricates history: unknown runs have no events yet.
    if (run === undefined) return [];
    return run.events.map((event) => ({ ...event }));
  }

  /**
   * Process hygiene: kill every still-running child and mark it failed.
   * Runs that already reached their terminal event are left alone.
   */
  dispose(): void {
    for (const [runId, run] of this.activeRuns) {
      if (run.completed) continue;
      run.completed = true;
      if (!run.child.killed) run.child.kill();
      run.events.push({
        runId,
        seq: run.events.length + 1,
        type: "failed",
        detail: "zcode-cli process killed by adapter disposal",
        at: this.now(),
      });
    }
    this.activeRuns.clear();
  }

  /**
   * Parse one zcode-cli stream-json line into event fields (the seq is
   * assigned by the adapter's own monotonic counter). Unparseable lines
   * become raw progress evidence — output is never dropped.
   */
  private parseEvent(line: string): Pick<AgentRunEvent, "type" | "detail" | "at"> | null {
    try {
      const data: { type?: unknown; message?: unknown; detail?: unknown; timestamp?: unknown } =
        JSON.parse(line);
      let type: AgentRunEvent["type"];
      switch (typeof data.type === "string" ? data.type.toLowerCase() : "") {
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
          type = "progress";
      }
      const detail =
        typeof data.message === "string"
          ? data.message
          : typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data);
      const at = typeof data.timestamp === "string" ? data.timestamp : this.now();
      return { type, detail, at };
    } catch {
      return { type: "progress", detail: `raw output: ${line.trim()}`, at: this.now() };
    }
  }
}
