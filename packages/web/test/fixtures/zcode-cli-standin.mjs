#!/usr/bin/env node
/**
 * zcode-cli STAND-IN executable for the W4C-3 web host composition test (copied from packages/sporta-product/test/fixtures/zcode-cli-standin.mjs — same law, same labeling) (fixture).
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
 */
const args = process.argv.slice(2);

const usage = () => {
  process.stderr.write("usage: zcode-cli-standin --prompt <task> --output-format <format>\n");
  process.exit(1);
};

let prompt = null;
let outputFormat = null;
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

const emit = (type, message) => {
  process.stdout.write(
    `${JSON.stringify({ type, sequence: null, message, timestamp: new Date().toISOString() })}\n`,
  );
};

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  emit("started", `stand-in session started for task: ${prompt}`);
  await tick(15);
  emit("progress", "stand-in working (real timer tick, no LLM provider)");
  await tick(15);
  emit("completed", "stand-in session completed");
  process.exit(0);
};

main();
