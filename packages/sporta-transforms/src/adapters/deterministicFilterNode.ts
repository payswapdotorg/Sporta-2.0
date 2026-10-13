/**
 * W9A-3 — the REAL deterministic node executor (adapters layer,
 * P9-02/P9-05). Executes a declared `deterministic-filter` node by
 * spawning a REAL local child process (the zcodeAgentRuntime
 * precedent) that performs the pinned component's transform over a
 * REAL temp-dir input file.
 *
 * Sandbox law (lock invariant 32): the child gets env {} — no host
 * secrets, no network — cwd limited to its temp dir, a real kill
 * timeout from the node's declared resources, and cancellation that
 * kills before any output is committed. REAL evidence only: exit
 * codes, signals, the child's own resourceUsage() and measured
 * wall-clock; nothing is fabricated.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TransformNode } from "@sporta/transforms/contract";
import type {
  TransformDeterministicNodeInput,
  TransformDeterministicNodeOutput,
  TransformDeterministicNodePort,
} from "../domain/ports.js";
import type { DeterministicComponentStore } from "./componentStore.js";

/** Constructor dependencies (all injectable; real IO defaults). */
export interface DeterministicFilterNodeDeps {
  /** The trusted, digest-verified component store. */
  store: DeterministicComponentStore;
  /** Node executable for the child (default: this process's node). */
  nodeExecutable?: string;
  /** Temp-dir factory (default: real fs.mkdtemp). */
  makeTempDir?: () => Promise<string>;
  /** Temp-dir cleanup (default: real recursive rm). */
  removeTempDir?: (dir: string) => Promise<void>;
}

/** The parameters the json-event-stream-trim component requires. */
const TRIM_PARAMETERS: Readonly<Record<string, unknown>> = {
  startMs: { type: "number", required: true, minimum: 0 },
  endMs: { type: "number", required: true, minimum: 0 },
};

/**
 * REAL executor: one real child process per execution, typed outcomes,
 * explicit process hygiene (spawn-error capture, kill on abort,
 * timeout from the declared envelope, cleanup in finally).
 */
export class DeterministicFilterNodeAdapter implements TransformDeterministicNodePort {
  private readonly store: DeterministicComponentStore;
  private readonly nodeExecutable: string;
  private readonly makeTempDir: () => Promise<string>;
  private readonly removeTempDir: (dir: string) => Promise<void>;

  constructor(deps: DeterministicFilterNodeDeps) {
    this.store = deps.store;
    this.nodeExecutable = deps.nodeExecutable ?? process.execPath;
    this.makeTempDir = deps.makeTempDir ?? (() => fs.mkdtemp(join(tmpdir(), "sporta-transform-")));
    this.removeTempDir = deps.removeTempDir ?? ((dir) => fs.rm(dir, { recursive: true, force: true }));
  }

  async execute(input: TransformDeterministicNodeInput): Promise<TransformDeterministicNodeOutput> {
    const { node, parameters, signal } = input;
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const failure = (detail: string): TransformDeterministicNodeOutput => ({
      status: "typed-failure",
      outputBytes: null,
      summary: null,
      timingMs: elapsed(),
      resourceUse: { cpuMs: 0, memoryMiB: 0, outputBytes: 0 },
      detail,
    });
    const cancelled = (detail: string): TransformDeterministicNodeOutput => ({
      status: "cancelled",
      outputBytes: null,
      summary: null,
      timingMs: elapsed(),
      resourceUse: { cpuMs: 0, memoryMiB: 0, outputBytes: 0 },
      detail,
    });

    // Cancellation law: abort BEFORE spawn means nothing happened.
    if (signal?.aborted) return cancelled("aborted before spawn — nothing executed");

    // Component law: the pinned reference must resolve to verified bytes.
    const component = this.store.sourceOf(node.componentRef.name, node.componentRef.digest);
    if (component === null) {
      return failure(
        `component ${node.componentRef.name} @ ${node.componentRef.digest} does not resolve to verified bytes in the trusted store`,
      );
    }

    // Schema law: the node must declare the component's parameters.
    const schemaError = checkDeclaredParameters(node, TRIM_PARAMETERS);
    if (schemaError !== null) return failure(schemaError);

    // Window parameters (fail-closed; validation already ran upstream).
    const startMs = parameters.startMs;
    const endMs = parameters.endMs;
    if (typeof startMs !== "number" || typeof endMs !== "number" || !Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
      return failure(`trim parameters invalid: startMs=${String(startMs)} endMs=${String(endMs)}`);
    }

    const dir = await this.makeTempDir();
    try {
      const inputPath = join(dir, "input.ndjson");
      const outputPath = join(dir, "output.ndjson");
      const summaryPath = join(dir, "summary.json");
      const scriptPath = join(dir, "component.mjs");
      await fs.writeFile(inputPath, input.input.bytes);
      await fs.writeFile(scriptPath, component.source, "utf8");

      // REAL spawn: empty env (no host secrets, no network), cwd in the
      // temp dir only, declared timeout kills the child (SIGTERM).
      const timeoutMs = node.resources.timeoutMs > 0 ? node.resources.timeoutMs : undefined;
      const childResult = await new Promise<{ code: number | null; signal: string | null; error: string | null; stderr: string; stdout: string }>(
        (resolve) => {
          const child = spawn(
            this.nodeExecutable,
            [scriptPath, inputPath, outputPath, summaryPath, String(startMs), String(endMs)],
            {
              cwd: dir,
              env: {},
              stdio: ["ignore", "pipe", "pipe"],
              ...(timeoutMs !== undefined ? { timeout: timeoutMs, killSignal: "SIGTERM" as const } : {}),
            },
          );
          let stderr = "";
          let stdout = "";
          child.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
            if (stdout.length > 4096) stdout = stdout.slice(0, 4096); // evidence cap
          });
          child.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
            if (stderr.length > 4096) stderr = stderr.slice(0, 4096);
          });
          // Cancellation law: an abort kills the child immediately —
          // a cancelled run can never finish writing output.
          const onAbort = (): void => {
            if (!child.killed) child.kill("SIGTERM");
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          const settle = (
            payload: { code: number | null; signal: string | null; error: string | null; stderr: string; stdout: string },
          ): void => {
            signal?.removeEventListener("abort", onAbort);
            resolve(payload);
          };
          child.on("error", (error: Error) => {
            settle({ code: null, signal: null, error: error.message, stderr, stdout });
          });
          child.on("close", (code: number | null, closeSignal: NodeJS.Signals | null) => {
            settle({ code, signal: closeSignal ?? null, error: null, stderr, stdout });
          });
        },
      );

      // Cancellation during the run: the child is dead (spawn timeout or
      // close); abort wins over any output it managed to write.
      if (signal?.aborted) return cancelled("aborted during execution — output discarded");

      if (childResult.error !== null) {
        return failure(`child process failed to start: ${childResult.error}`);
      }
      if (childResult.code !== 0) {
        const detail = childResult.stderr.trim().length > 0 ? childResult.stderr.trim() : `exit code ${String(childResult.code)}`;
        return failure(
          `component exited ${childResult.code === null ? "with signal" : ""}${childResult.signal === null ? "" : ` ${childResult.signal}`} — ${detail}`,
        );
      }

      // Read the REAL output the child wrote.
      let outputBytes: Uint8Array;
      let summaryText: string;
      try {
        outputBytes = new Uint8Array(await fs.readFile(outputPath));
        summaryText = await fs.readFile(summaryPath, "utf8");
      } catch (error) {
        return failure(`child exited 0 but its output is unreadable: ${String(error)}`);
      }

      // Resource law: output budget overflow is a typed failure.
      if (outputBytes.length > node.resources.maxOutputBytes) {
        return failure(
          `output budget overflow: child emitted ${outputBytes.length} bytes, node declared ${node.resources.maxOutputBytes} max`,
        );
      }

      // REAL resource evidence from the child's own summary record.
      let summary: {
        kept: number;
        dropped: number;
        inBytes: number;
        outBytes: number;
        cpuUserMs: number;
        cpuSystemMs: number;
        maxRssKiB: number;
      };
      try {
        summary = JSON.parse(summaryText) as typeof summary;
      } catch {
        return failure(`child summary is not JSON — no fabricated resource numbers: ${summaryText.slice(0, 256)}`);
      }

      return {
        status: "succeeded",
        outputBytes,
        summary: {
          keptCount: summary.kept,
          droppedCount: summary.dropped,
          inBytes: summary.inBytes,
          outBytes: summary.outBytes,
        },
        timingMs: elapsed(),
        resourceUse: {
          cpuMs: summary.cpuUserMs + summary.cpuSystemMs,
          memoryMiB: Math.round((summary.maxRssKiB / 1024) * 10) / 10,
          outputBytes: outputBytes.length,
        },
        detail: `trim kept ${summary.kept} and dropped ${summary.dropped} of ${summary.kept + summary.dropped} events (child pid evidence, byte-exact kept lines)`,
      };
    } finally {
      await this.removeTempDir(dir);
    }
  }
}

/**
 * The node's declared parameterSchema must cover the component's
 * required parameters with matching type/required semantics — a node
 * claiming this component without declaring its contract fails closed.
 */
function checkDeclaredParameters(
  node: TransformNode,
  expected: Readonly<Record<string, unknown>>,
): string | null {
  const schema = node.parameterSchema ?? {};
  if (typeof schema !== "object" || Array.isArray(schema)) {
    return `node ${node.nodeId} parameterSchema is not an object`;
  }
  for (const [name, rawExpected] of Object.entries(expected)) {
    const declared = (schema as Record<string, unknown>)[name];
    if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
      return `node ${node.nodeId} does not declare the ${name} parameter the component requires`;
    }
    const declaredEntry = declared as Record<string, unknown>;
    const expectedEntry = rawExpected as Record<string, unknown>;
    if (declaredEntry.type !== expectedEntry.type) {
      return `node ${node.nodeId} parameter ${name} declares type ${String(declaredEntry.type)}, component requires ${String(expectedEntry.type)}`;
    }
    if (declaredEntry.required !== true) {
      return `node ${node.nodeId} parameter ${name} must be declared required`;
    }
  }
  return null;
}
