#!/usr/bin/env node
/**
 * zcode-cli STAND-IN executable for the A17 real-execution test (fixture).
 *
 * WHY THIS EXISTS (honest labeling): the vendored apps/zcode-cli workspace
 * is missing several internal packages its own dependency graph requires
 * (@zcode/model-option-map, @zcode/provider, @zcode/provider-node,
 * @zcode/zcode-cua, @zcode/shared), so the real zcode-cli bundle CANNOT be
 * built in this sandbox (see the work report's BLOCKERS). This script is a
 * process-level test double: it is a REAL operating-system process (real
 * spawn, real pipes, real wall time, real exit code) that speaks the SAME
 * headless interface as zcode-cli — `--prompt <task> --output-format
 * stream-json` (apps/zcode-cli/packages/cli/src/arguments.ts + run.ts) —
 * and emits stream-json session events like the real CLI's headless mode.
 *
 * EVIDENCE CLASS: fixture for WHAT the executable is; the spawned process
 * itself, its wall time and its exit code are REAL observations.
 *
 * Behavior:
 *   - parses --prompt / --output-format exactly like the real CLI flags;
 *   - unknown/missing arguments exit non-zero with a usage error on stderr
 *     (like a real CLI);
 *   - emits three stream-json session events on stdout with REAL
 *     timestamps, one per real timer tick;
 *   - exits 0 on success.
 *
 * W4A-1 flush determinism: the session events are awaited through
 * stdout's write-completion callbacks and the success path exits
 * NATURALLY with `process.exitCode = 0` (never `process.exit(0)`, which
 * can truncate pending asynchronous pipe writes). The exit code, the
 * pipes and the wall time stay REAL; only the write scheduling is made
 * deterministic.
 */
const args = process.argv.slice(2);

class UsageError extends Error {}

const usage = () => {
  process.stderr.write("usage: zcode-cli-standin --prompt <task> --output-format <format>\n");
  process.exitCode = 1;
  throw new UsageError("stand-in usage error");
};

let prompt = null;
let outputFormat = null;

const emit = async (type, message) => {
  const line = `${JSON.stringify({ type, sequence: null, message, timestamp: new Date().toISOString() })}\n`;
  // Await the write callback: the line is flushed to the pipe before
  // the next tick (deterministic delivery; output is never truncated).
  await new Promise((resolve) => process.stdout.write(line, resolve));
};

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  await emit("started", `stand-in session started for task: ${prompt}`);
  await tick(15);
  await emit("progress", "stand-in working (real timer tick, no LLM provider)");
  await tick(15);
  await emit("completed", "stand-in session completed");
  // Natural exit: the event loop is empty, every write is flushed, and
  // the real exit code is 0.
  process.exitCode = 0;
};

try {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--prompt") {
      prompt = args[i + 1] ?? usage();
      i += 1;
    } else if (args[i] === "--output-format") {
      outputFormat = args[i + 1] ?? usage();
      i += 1;
    } else {
      usage();
    }
  }
  if (prompt === null || prompt.trim() === "") usage();
  if (outputFormat !== "stream-json") usage();
  main().catch((error) => {
    process.exitCode = 1;
    throw error;
  });
} catch (error) {
  // Usage errors exit quietly with code 1 (the usage line is flushed on
  // stderr before the natural exit); anything else is a real bug and
  // must surface.
  if (!(error instanceof UsageError)) throw error;
}
