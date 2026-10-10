/**
 * W4A-1 regression tests — the ZCodeAgentRuntimeAdapter's terminal-event
 * laws (the W3-C a17-real-execution flake root cause; see
 * docs/implementation/worker-a.md wave 4).
 *
 * EVIDENCE CLASS: REAL process leg — every test spawns a REAL child
 * process (real spawn, real pipes, real wall time, real exit code) driven
 * through small executable wrapper scripts (written to a temp dir) that
 * speak the zcode-cli headless interface (`--prompt <task>
 * --output-format stream-json` — stream-json lines on stdout, real exit
 * code). The wrapper scripts are fixture content; the process lifecycle
 * observations are real.
 *
 * Laws pinned (mirroring the adapter's documented W4A-1 laws):
 *   1. exactly ONE terminal-type event per run, synthesized only from
 *      the real process lifecycle (exit code / spawn error);
 *   2. stream lines that LOOK terminal are recorded as progress
 *      evidence verbatim — the stream never decides the verdict;
 *   3. the terminal event is the last event ever recorded;
 *   4. stdout parsing is line-buffered (a JSON line split across chunks
 *      parses as ONE event, never as raw-output fragments).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZCodeAgentRuntimeAdapter, systemClockNow } from "../src/contract.js";
import type { AgentRunEvent } from "../src/contract.js";

const organization = {
  organizationId: "org:adapter-law",
  version: 1,
  intentProfile: "sports-replay",
  roleGraph: [],
  agentBodies: [],
  cognitiveSubstrates: [],
  toolGraph: [],
  workflowGraph: [],
  environmentProfile: "local",
  fallbacks: [],
  budgets: {},
  learnedPreferences: [],
  evidence: [],
  policy: {
    rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

interface CliHarness {
  /** Runtime bound to the wrapper executable. */
  runtime: ZCodeAgentRuntimeAdapter;
  /** Root temp dir (removed on test end). */
  root: string;
}

/** Write one executable wrapper script (a real CLI double) and bind the adapter to it. */
async function makeCli(body: string): Promise<CliHarness> {
  const root = await fs.mkdtemp(join(tmpdir(), "sporta-adapter-law-"));
  const script = `#!/usr/bin/env node
const emit = (line) => process.stdout.write(line + "\\n");
${body}
`;
  const path = join(root, "cli.mjs");
  await fs.writeFile(path, script, "utf-8");
  await fs.chmod(path, 0o755);
  return {
    runtime: new ZCodeAgentRuntimeAdapter({ now: systemClockNow, zcodeCliPath: path }),
    root,
  };
}

async function cleanup(harness: CliHarness): Promise<void> {
  harness.runtime.dispose();
  await fs.rm(harness.root, { recursive: true, force: true });
}

const isTerminal = (event: AgentRunEvent | undefined): boolean =>
  event !== undefined && (event.type === "completed" || event.type === "failed");

/** Poll the REAL process until its terminal event (the a17 observation pattern). */
async function pollToTerminal(
  harness: CliHarness,
  workGraphId: string,
): Promise<{ runId: string; events: readonly AgentRunEvent[] }> {
  const handle = await harness.runtime.startRun({
    workGraphId,
    organization,
    task: "adapter-law probe",
  });
  const deadline = Date.now() + 10_000;
  let events: readonly AgentRunEvent[] = [];
  while (Date.now() < deadline) {
    events = await harness.runtime.observeRun(handle.runId);
    if (isTerminal(events[events.length - 1])) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return { runId: handle.runId, events };
}

test("laws 1+2+3: exactly one terminal event from the real exit code 0; terminal-looking stream lines stay progress evidence; terminal is last", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "started", message: "cli session started" }));
    emit(JSON.stringify({ type: "completed", message: "cli session completed" }));
    process.exitCode = 0;
  `);
  try {
    const { events } = await pollToTerminal(harness, "wg:law-1");

    const terminalTyped = events.filter((event) => isTerminal(event));
    assert.equal(terminalTyped.length, 1, "exactly one terminal-type event exists (law 1)");
    const terminal = terminalTyped[0];
    assert.equal(terminal?.type, "completed");
    assert.ok(
      terminal?.detail.includes("exited with code 0"),
      `the terminal verdict is the real exit code: ${terminal?.detail}`,
    );
    assert.equal(events[events.length - 1], terminal, "the terminal event is the last event (law 3)");

    // Law 2: the CLI's own "completed" line is preserved verbatim as
    // progress evidence — never dropped, never promoted to a verdict.
    assert.ok(
      events.some((event) => event.type === "progress" && event.detail === "cli session completed"),
      "the stream's terminal-looking line survives as progress evidence",
    );
    assert.ok(
      events.some((event) => event.type === "started" && event.detail === "cli session started"),
      "the stream's started line records as a started observation",
    );
    assert.equal(events[0]?.type, "started", "the adapter records the real spawn first (seq 1)");
    assert.deepEqual(
      events.map((event) => event.seq),
      events.map((_, index) => index + 1),
      "seq is strictly monotonic from 1",
    );
  } finally {
    await cleanup(harness);
  }
});

test("law 2 (failure side): a non-zero real exit is the ONLY source of a failed verdict, even after a completed-looking stream line", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "completed", message: "cli claims completion" }));
    process.exit(3);
  `);
  try {
    const { events } = await pollToTerminal(harness, "wg:law-2");

    const terminalTyped = events.filter((event) => isTerminal(event));
    assert.equal(terminalTyped.length, 1, "exactly one terminal-type event (law 1)");
    const terminal = terminalTyped[0];
    assert.equal(terminal?.type, "failed", "exit code 3 is a failed verdict");
    assert.ok(
      terminal?.detail.includes("exited with code 3"),
      `the terminal carries the real exit code: ${terminal?.detail}`,
    );
    assert.equal(events[events.length - 1], terminal, "terminal is last (law 3)");
    assert.ok(
      !events.some((event) => event.type === "completed"),
      "the stream's completed-looking line never became a completed verdict",
    );
    assert.ok(
      events.some((event) => event.type === "progress" && event.detail === "cli claims completion"),
      "the stream line is still preserved as evidence",
    );
  } finally {
    await cleanup(harness);
  }
});

test("law 4: a JSON line split across stdout chunks parses as ONE event (line-buffered stream)", async () => {
  const line = JSON.stringify({ type: "progress", message: "split-line-message-survives" });
  // Write the line in two pieces ~60ms apart (guaranteed separate pipe
  // chunks), then exit 0 — the parent must buffer the partial line.
  const harness = await makeCli(`
    const line = ${JSON.stringify(line)};
    process.stdout.write(line.slice(0, 24));
    setTimeout(() => {
      process.stdout.write(line.slice(24) + "\\n");
      process.exitCode = 0;
    }, 60);
  `);
  try {
    const { events } = await pollToTerminal(harness, "wg:law-4");

    assert.ok(
      events.every((event) => !event.detail.startsWith("raw output:")),
      `no raw-output fragments from split lines: ${events.map((event) => event.detail).join(" | ")}`,
    );
    assert.ok(
      events.some(
        (event) => event.type === "progress" && event.detail === "split-line-message-survives",
      ),
      "the split line parsed as one complete event",
    );
    // Adapter spawn (seq 1) + stream line (seq 2) + terminal (seq 3).
    assert.equal(
      events.length,
      3,
      `exact event count: ${events.map((event) => `${event.seq}:${event.detail}`).join(" | ")}`,
    );
    const terminal = events[events.length - 1];
    assert.ok(terminal?.type === "completed" && terminal.detail.includes("exited with code 0"));
  } finally {
    await cleanup(harness);
  }
});

test("law 1 (spawn side): a spawn failure (ENOENT) is the single failed terminal event", async () => {
  const runtime = new ZCodeAgentRuntimeAdapter({
    now: systemClockNow,
    zcodeCliPath: "/nonexistent/path/to/a/missing/cli",
  });
  const handle = await runtime.startRun({
    workGraphId: "wg:enoent",
    organization,
    task: "spawn failure probe",
  });
  const deadline = Date.now() + 10_000;
  let events: readonly AgentRunEvent[] = [];
  while (Date.now() < deadline) {
    events = await runtime.observeRun(handle.runId);
    if (isTerminal(events[events.length - 1])) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const terminalTyped = events.filter((event) => isTerminal(event));
  assert.equal(terminalTyped.length, 1);
  const terminal = terminalTyped[0];
  assert.equal(terminal?.type, "failed");
  assert.ok(
    terminal?.detail.includes("failed to start"),
    `typed spawn-failure evidence: ${terminal?.detail}`,
  );
  assert.equal(events[events.length - 1], terminal);
  runtime.dispose();
});

test("dispose kills a live run (observed: the child's heartbeat stops) and discards run state", async () => {
  const harness = await makeCli(`
    import { appendFileSync } from "node:fs";
    const heartbeat = new URL("./heartbeat.txt", import.meta.url);
    appendFileSync(heartbeat, "x");
    setInterval(() => appendFileSync(heartbeat, "x"), 40);
  `);
  try {
    const handle = await harness.runtime.startRun({
      workGraphId: "wg:dispose",
      organization,
      task: "disposal probe",
    });
    // Let the child run long enough to prove it is alive (heartbeat grows).
    await new Promise((resolve) => setTimeout(resolve, 150));
    const heartbeat = join(harness.root, "heartbeat.txt");
    const before = (await fs.readFile(heartbeat, "utf-8")).length;
    assert.ok(before >= 2, `the child is alive and heartbeating (${before} ticks)`);

    harness.runtime.dispose();

    // REAL kill observation: the heartbeat stops growing once the child dies.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = (await fs.readFile(heartbeat, "utf-8")).length;
    assert.equal(after, before, "the child process was killed by dispose (no further ticks)");

    // Post-dispose contract: run state is discarded, never fabricated.
    assert.deepEqual(
      await harness.runtime.observeRun(handle.runId),
      [],
      "dispose discards run state (the seam never fabricates history)",
    );
  } finally {
    await cleanup(harness);
  }
});

test("the seam never fabricates history: unknown runs observe an empty event list", async () => {
  const runtime = new ZCodeAgentRuntimeAdapter({ now: systemClockNow });
  assert.deepEqual(await runtime.observeRun("run:wg:unknown:org:none:9"), []);
  runtime.dispose();
});

test("startRun is idempotent per deterministic runId: a retry never re-spawns", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "progress", message: "one spawn only" }));
    process.exitCode = 0;
  `);
  try {
    const input = { workGraphId: "wg:idem", organization, task: "idempotency probe" };
    const first = await harness.runtime.startRun(input);
    const retry = await harness.runtime.startRun(input);
    assert.equal(retry.runId, first.runId);
    assert.equal(retry.startedAt, first.startedAt);
    const deadline = Date.now() + 10_000;
    let events: readonly AgentRunEvent[] = [];
    while (Date.now() < deadline) {
      events = await harness.runtime.observeRun(first.runId);
      if (isTerminal(events[events.length - 1])) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(
      events.filter((event) => event.detail === "one spawn only").length,
      1,
      "the retry did not spawn a second process",
    );
  } finally {
    await cleanup(harness);
  }
});
