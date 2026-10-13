#!/usr/bin/env node
/**
 * zcode-app-action stand-in executable (W9C-5 test fixture).
 *
 * WHY THIS EXISTS (honest labeling — the W4C dependency law): the vendored
 * apps/zcode-cli workspace is unbuildable in this sandbox (missing internal
 * packages; see the W4C composition law), so the REAL agent-path spawn in
 * tests targets this stand-in. It is a REAL operating-system process (real
 * spawn, real pipes, real wall time, real exit code) speaking the SAME
 * headless interface as zcode-cli — `--prompt <task> --output-format
 * stream-json` — and, like the real CLI's agent would with its file/terminal
 * tools, it PERFORMS the granted application action on the app's real local
 * state directory (real fs reads/writes).
 *
 * EVIDENCE CLASS: fixture for WHAT the executable is; the spawned process,
 * its stream-json evidence, its real file effects and its exit code are
 * REAL observations.
 *
 * Behavior:
 *   - parses --prompt / --output-format exactly like the real CLI flags;
 *     unknown/missing arguments exit non-zero with a usage error on stderr;
 *   - extracts the machine-readable action directive (the JSON object
 *     embedded in the task prompt by the AppActionService) — the same
 *     contract a real zcode-cli agent reads to act with its tools;
 *   - cap:append-note (control): appends the note to the target app's real
 *     state.json (real read-modify-write, atomic-ish write);
 *   - cap:read-journal (observe): reads the journal WITHOUT mutating it;
 *   - unknown capabilityId: exits 3 (the real failure lane);
 *   - emits three stream-json session events on stdout with REAL
 *     timestamps and exits 0 on success.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);

const usage = () => {
  process.stderr.write("usage: zcode-app-action-standin --prompt <task> --output-format <format>\n");
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

/** Extract the LAST JSON object embedded in the task prompt (the directive). */
const extractDirective = (task) => {
  const start = task.lastIndexOf("{");
  const end = task.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(task.slice(start, end + 1));
  } catch {
    return null;
  }
};

const main = async () => {
  emit("started", `stand-in session started for task: ${prompt}`);
  const directive = extractDirective(prompt);
  if (directive === null || typeof directive !== "object") {
    emit("progress", "no action directive found in the task");
    process.exitCode = 4;
    return;
  }
  const { capabilityId, targetWorkspacePath, payload } = directive;
  const statePath = join(String(targetWorkspacePath), "state.json");

  if (capabilityId === "cap:append-note") {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const note = {
      id: `note-${notes.length + 1}`,
      text: typeof payload === "string" && payload.trim() !== "" ? payload : "(empty note)",
      at: new Date().toISOString(),
    };
    state.notes = [...notes, note];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    emit("progress", `appended ${note.id} to the journal (real file effect)`);
    await tick(10);
    emit("completed", `journal now holds ${state.notes.length} note(s)`);
    process.exitCode = 0;
    return;
  }

  if (capabilityId === "cap:read-journal" || capabilityId === "cap:read-status") {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const count = Array.isArray(state.notes) ? state.notes.length : 0;
    emit("progress", `read the journal without mutating it (${count} note(s))`);
    await tick(10);
    emit("completed", `journal observed: ${count} note(s), status ${String(state.status)}`);
    process.exitCode = 0;
    return;
  }

  emit("progress", `capability ${String(capabilityId)} is not implemented by this app`);
  process.exitCode = 3;
};

main();
