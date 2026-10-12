import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunJournalError,
  AgentRunOrphanedError,
  FsAgentRunJournal,
  ResumingAgentRuntime,
  ZCodeAgentRuntimeAdapter,
  systemClockNow,
} from "../src/contract.js";
import type { AgentRunEvent } from "../src/contract.js";

/**
 * ResumingAgentRuntime — REAL execution-plane tests. Every test
 * spawns a REAL child process through the real ZCodeAgentRuntimeAdapter
 * (driven by small executable wrapper scripts speaking the zcode-cli
 * headless interface — the W4A-1 evidence pattern: the wrapper scripts
 * are fixture content; the process lifecycle, pipes, wall time, exit
 * codes and the kill-by-dispose are real). The journal is the REAL
 * FsAgentRunJournal on a real temp directory. Restarts are simulated
 * by FRESH decorator + journal instances over the same directory.
 */
const organization = {
  organizationId: "org:resume",
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
  runtime: ZCodeAgentRuntimeAdapter;
  root: string;
}

/** Write one executable wrapper script (a real CLI double) and bind the adapter to it. */
async function makeCli(body: string): Promise<CliHarness> {
  const root = await fs.mkdtemp(join(tmpdir(), "sporta-resuming-runtime-"));
  const script = `#!/usr/bin/env node
const emit = (line) => process.stdout.write(line + "\\n");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

async function journalRoot(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), "sporta-resuming-journal-"));
}

const isTerminal = (event: AgentRunEvent | undefined): boolean =>
  event !== undefined && (event.type === "completed" || event.type === "failed");

/** Poll the observed run until its terminal event (deadline-guarded). */
async function pollToTerminal(
  runtime: ResumingAgentRuntime,
  runId: string,
): Promise<readonly AgentRunEvent[]> {
  const deadline = Date.now() + 10_000;
  let events: readonly AgentRunEvent[] = [];
  while (Date.now() < deadline) {
    events = await runtime.observeRun(runId);
    if (isTerminal(events[events.length - 1])) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return events;
}

test("REAL: restart with live continuation — replay is byte-identical, then the journal grows with live events", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "started", message: "cli session started" }));
    await sleep(300);
    emit(JSON.stringify({ type: "progress", message: "step 1" }));
    await sleep(300);
    emit(JSON.stringify({ type: "progress", message: "step 2" }));
    await sleep(300);
    emit(JSON.stringify({ type: "progress", message: "step 3" }));
    process.exitCode = 0;
  `);
  const root = await journalRoot();
  try {
    const decorator1 = new ResumingAgentRuntime({
      inner: harness.runtime,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator1.startRun({
      workGraphId: "wg:resume-live",
      organization,
      task: "restart continuation probe",
    });

    // Observe once before the crash: whatever is live gets journaled.
    const before = await decorator1.observeRun(handle.runId);
    assert.ok(before.length >= 1, "the real spawn's started event is observed");
    const journaledBefore = await new FsAgentRunJournal(root).readJournal(handle.runId);
    assert.ok(journaledBefore !== null);
    assert.ok(
      !isTerminal(journaledBefore.events[journaledBefore.events.length - 1]),
      "the run is mid-flight at the restart point",
    );

    // RESTART: fresh decorator + fresh journal instance over the same
    // dir; the inner port still observes the still-running process.
    const decorator2 = new ResumingAgentRuntime({
      inner: harness.runtime,
      journal: new FsAgentRunJournal(root),
    });
    const replay = await decorator2.observeRun(handle.runId);
    assert.equal(
      replay.length,
      Math.max(journaledBefore.events.length, before.length),
      "replay returns the observed history",
    );
    for (let index = 0; index < journaledBefore.events.length; index += 1) {
      assert.deepEqual(
        replay[index],
        journaledBefore.events[index],
        `replayed event ${index} is byte-identical to the journaled record`,
      );
    }

    // Continue to the real terminal verdict (exit code 0 -> completed).
    const terminal = await pollToTerminal(decorator2, handle.runId);
    assert.ok(terminal.length > journaledBefore.events.length, "live continuation appended events");
    assert.equal(isTerminal(terminal[terminal.length - 1]), true);
    assert.equal(terminal[terminal.length - 1]?.type, "completed", "the verdict is the real exit code");

    // The journal holds the whole history durably for the next restart.
    const durable = await new FsAgentRunJournal(root).readJournal(handle.runId);
    assert.deepEqual(durable?.events, terminal, "journal and replay agree after continuation");
  } finally {
    harness.runtime.dispose();
    await fs.rm(harness.root, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: orphan honesty — a killed run reports AgentRunOrphanedError with the last journaled state, never a fabricated completion", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "started", message: "cli session started" }));
    emit(JSON.stringify({ type: "progress", message: "long work begins" }));
    setInterval(() => {}, 60000); // keeps the real process alive until killed below
  `);
  const root = await journalRoot();
  try {
    const decorator1 = new ResumingAgentRuntime({
      inner: harness.runtime,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator1.startRun({
      workGraphId: "wg:resume-orphan",
      organization,
      task: "orphan probe",
    });
    await new Promise((resolve) => setTimeout(resolve, 250)); // let the two stream lines land
    const observed = await decorator1.observeRun(handle.runId);
    assert.equal(observed.length, 3, "spawn record + two stream lines observed");
    assert.ok(!isTerminal(observed[observed.length - 1]));

    // HOST CRASH: kill the real child process and drop the whole stack.
    harness.runtime.dispose();

    // Fresh runtime (empty run table) + fresh decorator + fresh journal
    // instance over the same durable directory.
    const freshRuntime = new ZCodeAgentRuntimeAdapter({ now: systemClockNow });
    const decorator2 = new ResumingAgentRuntime({
      inner: freshRuntime,
      journal: new FsAgentRunJournal(root),
    });
    await assert.rejects(
      () => decorator2.observeRun(handle.runId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunOrphanedError, "typed orphan error");
        assert.equal(error.runId, handle.runId);
        assert.equal(error.eventCount, 3, "carries the observed event count");
        assert.equal(error.lastEvent?.seq, 3, "carries the last journaled event");
        assert.equal(error.lastEvent?.type, "progress", "the un-observed remainder stays unknown");
        assert.notEqual(error.lastEvent?.type, "completed", "never a fabricated completion");
        return true;
      },
    );
    // The durable journal still reads back (evidence for the operator).
    const evidence = await new FsAgentRunJournal(root).readJournal(handle.runId);
    assert.equal(evidence?.events.length, 3);
  } finally {
    await fs.rm(harness.root, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: re-execution after a restart is refused loudly (header conflict) — the durable history is never overwritten", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "started", message: "cli session started" }));
    process.exitCode = 0;
  `);
  const root = await journalRoot();
  try {
    const decorator1 = new ResumingAgentRuntime({
      inner: harness.runtime,
      journal: new FsAgentRunJournal(root),
    });
    const input = {
      workGraphId: "wg:resume-conflict",
      organization,
      task: "header conflict probe",
    };
    const handle = await decorator1.startRun(input);
    const terminal = await pollToTerminal(decorator1, handle.runId);
    assert.equal(terminal[terminal.length - 1]?.type, "completed");

    // Restart: a FRESH runtime (no run state) re-starts the same
    // deterministic runId — the journal refuses the overwrite.
    const freshRuntime = new ZCodeAgentRuntimeAdapter({ now: systemClockNow });
    const decorator2 = new ResumingAgentRuntime({
      inner: freshRuntime,
      journal: new FsAgentRunJournal(root),
    });
    await assert.rejects(
      () => decorator2.startRun(input),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError, "typed journal error");
        assert.match(error.reason, /header-conflict/);
        return true;
      },
    );
    // The original durable history is intact and still terminal.
    const history = await new FsAgentRunJournal(root).readJournal(handle.runId);
    assert.ok(history !== null);
    assert.equal(
      history.events[history.events.length - 1]?.type,
      "completed",
      "history stays intact",
    );
    freshRuntime.dispose();
  } finally {
    harness.runtime.dispose();
    await fs.rm(harness.root, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: same-instance startRun retry is idempotent — one header, no duplicated events", async () => {
  const harness = await makeCli(`
    emit(JSON.stringify({ type: "started", message: "cli session started" }));
    process.exitCode = 0;
  `);
  const root = await journalRoot();
  try {
    const decorator = new ResumingAgentRuntime({
      inner: harness.runtime,
      journal: new FsAgentRunJournal(root),
    });
    const input = {
      workGraphId: "wg:resume-idempotent",
      organization,
      task: "idempotency probe",
    };
    const first = await decorator.startRun(input);
    const second = await decorator.startRun(input);
    assert.deepEqual(second, first, "the retry returns the existing handle (no re-spawn)");

    await pollToTerminal(decorator, first.runId);
    const journalFile = await fs.readFile(
      new FsAgentRunJournal(root).journalPathFor(first.runId),
      "utf8",
    );
    assert.equal(
      journalFile.split("\n").filter((line) => line.includes('"kind":"header"')).length,
      1,
      "exactly one header record",
    );
    const contents = await new FsAgentRunJournal(root).readJournal(first.runId);
    const seqs = contents?.events.map((one) => one.seq) ?? [];
    assert.deepEqual([...seqs].sort((a, b) => a - b), seqs, "no duplicated observations");
  } finally {
    harness.runtime.dispose();
    await fs.rm(harness.root, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: pass-through — a run the decorator never started is observed honestly, unchanged", async () => {
  const harness = await makeCli(`process.exitCode = 0;`);
  const root = await journalRoot();
  try {
    const decorator = new ResumingAgentRuntime({
      inner: harness.runtime,
      journal: new FsAgentRunJournal(root),
    });
    assert.deepEqual(
      await decorator.observeRun("run:never-started:org:1"),
      [],
      "the seam's own honest answer for unknown runs",
    );
  } finally {
    harness.runtime.dispose();
    await fs.rm(harness.root, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});
