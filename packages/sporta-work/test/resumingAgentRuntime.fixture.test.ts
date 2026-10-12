import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunJournalError,
  AgentRunOrphanedError,
  FixtureAgentRuntimeAdapter,
  FsAgentRunJournal,
  ResumingAgentRuntime,
} from "../src/contract.js";
import type {
  AgentRunEvent,
  AgentRunHandle,
  AgentRuntimeExecutionPort,
  StartAgentRunInput,
} from "../src/contract.js";

/**
 * ResumingAgentRuntime — FIXTURE lanes: the fixture runtime (and small
 * deterministic in-test scripted runtimes) as the inner port, with the
 * REAL FsAgentRunJournal on real temp directories. No processes are
 * spawned here; evidence is fixture-grade by construction. These lanes
 * pin the decorator's replay/merge/orphan/divergence SEMANTICS
 * deterministically.
 */
const organization = {
  organizationId: "org:fixture-resume",
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

async function journalRoot(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), "sporta-resuming-fixture-"));
}

/**
 * Scripted inner runtime (FIXTURE): a deterministic, in-memory
 * AgentRuntimeExecutionPort whose event lists the test controls —
 * the fixture adapter is the default inner for replay tests; this
 * double exists for mid-flight states the stock fixture cannot
 * express (non-terminal pauses, growing history, divergence).
 */
class ScriptedRuntime implements AgentRuntimeExecutionPort {
  private readonly runs = new Map<string, AgentRunEvent[]>();

  async startRun(input: StartAgentRunInput): Promise<AgentRunHandle> {
    const runId = `run:${input.workGraphId}:${input.organization.organizationId}:${input.organization.version}`;
    if (!this.runs.has(runId)) {
      this.runs.set(runId, [
        {
          runId,
          seq: 1,
          type: "started",
          detail: `scripted run of task: ${input.task}`,
          at: "2026-06-01T00:00:00.000Z",
        },
      ]);
    }
    return { runId, workGraphId: input.workGraphId, startedAt: "2026-06-01T00:00:00.000Z" };
  }

  async observeRun(runRef: string): Promise<readonly AgentRunEvent[]> {
    return (this.runs.get(runRef) ?? []).map((event) => ({ ...event }));
  }

  /** Test control: append one event to a run (arrival order). */
  push(runRef: string, event: AgentRunEvent): void {
    const events = this.runs.get(runRef);
    if (events !== undefined) events.push(event);
  }

  /** Test control: rewrite a run's history (divergence probe). */
  rewrite(runRef: string, events: readonly AgentRunEvent[]): void {
    this.runs.set(runRef, [...events]);
  }
}

test("FIXTURE: the fixture runtime replays byte-identically through a fresh decorator + journal", async () => {
  const root = await journalRoot();
  try {
    const fixture = new FixtureAgentRuntimeAdapter({ now: () => "2026-06-01T00:00:00.000Z" });
    const decorator = new ResumingAgentRuntime({
      inner: fixture,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator.startRun({
      workGraphId: "wg:fixture-replay",
      organization,
      task: "fixture replay probe",
    });
    const observed = await decorator.observeRun(handle.runId);
    assert.equal(observed.length, 3, "the fixture's deterministic event list");
    assert.equal(observed[observed.length - 1]?.type, "completed");

    // Restart simulation: fresh decorator + fresh journal instance over
    // the same dir (the fixture runtime instance stays observable).
    const replayed = await new ResumingAgentRuntime({
      inner: fixture,
      journal: new FsAgentRunJournal(root),
    }).observeRun(handle.runId);
    assert.deepEqual(replayed, observed, "byte-identical replay in the same order");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("FIXTURE: terminal journal returns the journaled list verbatim — even if the inner grows post-terminal noise", async () => {
  const root = await journalRoot();
  try {
    const scripted = new ScriptedRuntime();
    const decorator = new ResumingAgentRuntime({
      inner: scripted,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator.startRun({
      workGraphId: "wg:fixture-terminal",
      organization,
      task: "terminal replay probe",
    });
    const runId = handle.runId;
    scripted.push(runId, {
      runId,
      seq: 2,
      type: "completed",
      detail: "scripted completion",
      at: "2026-06-01T00:00:01.000Z",
    });
    const observed = await decorator.observeRun(runId);
    assert.equal(observed[observed.length - 1]?.type, "completed");

    // Post-terminal noise on the live side must not leak into replay.
    scripted.push(runId, {
      runId,
      seq: 3,
      type: "progress",
      detail: "post-terminal noise the journal never observed",
      at: "2026-06-01T00:00:02.000Z",
    });
    const replayed = await new ResumingAgentRuntime({
      inner: scripted,
      journal: new FsAgentRunJournal(root),
    }).observeRun(runId);
    assert.deepEqual(
      replayed,
      observed,
      "a durably terminal journal is recorded truth — replay never extends past it",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("FIXTURE: orphan honesty — a mid-flight journal whose run vanished reports the last journaled state", async () => {
  const root = await journalRoot();
  try {
    const scripted = new ScriptedRuntime();
    const decorator = new ResumingAgentRuntime({
      inner: scripted,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator.startRun({
      workGraphId: "wg:fixture-orphan",
      organization,
      task: "orphan probe",
    });
    const runId = handle.runId;
    scripted.push(runId, {
      runId,
      seq: 2,
      type: "progress",
      detail: "mid-flight step",
      at: "2026-06-01T00:00:01.000Z",
    });
    const observed = await decorator.observeRun(runId);
    assert.equal(observed.length, 2);
    assert.equal(observed[observed.length - 1]?.type, "progress");

    // Restart with a FRESH runtime that dropped the run (orphaned).
    const freshDecorator = new ResumingAgentRuntime({
      inner: new ScriptedRuntime(),
      journal: new FsAgentRunJournal(root),
    });
    await assert.rejects(
      () => freshDecorator.observeRun(runId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunOrphanedError, "typed orphan error");
        assert.equal(error.eventCount, 2);
        assert.equal(error.lastEvent?.seq, 2);
        assert.equal(error.lastEvent?.type, "progress", "the remainder stays honestly unknown");
        assert.equal(error.workGraphId, "wg:fixture-orphan");
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("FIXTURE: divergent replay — a runtime re-emitting different history for the same seq is a typed error", async () => {
  const root = await journalRoot();
  try {
    const scripted = new ScriptedRuntime();
    const decorator = new ResumingAgentRuntime({
      inner: scripted,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator.startRun({
      workGraphId: "wg:fixture-divergence",
      organization,
      task: "divergence probe",
    });
    const runId = handle.runId;
    const original: AgentRunEvent = {
      runId,
      seq: 2,
      type: "progress",
      detail: "original history",
      at: "2026-06-01T00:00:01.000Z",
    };
    scripted.push(runId, original);
    await decorator.observeRun(runId);

    // The runtime "re-executes" and rewrites seq 2 with different facts.
    scripted.rewrite(runId, [
      { runId, seq: 1, type: "started", detail: "scripted run of task: divergence probe", at: "2026-06-01T00:00:00.000Z" },
      { runId, seq: 2, type: "progress", detail: "REWRITTEN history", at: "2026-06-01T09:00:00.000Z" },
    ]);
    await assert.rejects(
      () => decorator.observeRun(runId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError, "typed journal error");
        assert.match(error.reason, /divergent-replay:2/);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("FIXTURE: continuation is append-only — re-observing never duplicates journaled events", async () => {
  const root = await journalRoot();
  try {
    const scripted = new ScriptedRuntime();
    const decorator = new ResumingAgentRuntime({
      inner: scripted,
      journal: new FsAgentRunJournal(root),
    });
    const handle = await decorator.startRun({
      workGraphId: "wg:fixture-continuation",
      organization,
      task: "continuation probe",
    });
    const runId = handle.runId;

    // Event 2 arrives, is observed (journaled), then event 3 arrives.
    scripted.push(runId, {
      runId,
      seq: 2,
      type: "progress",
      detail: "step",
      at: "2026-06-01T00:00:01.000Z",
    });
    const afterTwo = await decorator.observeRun(runId);
    scripted.push(runId, {
      runId,
      seq: 3,
      type: "completed",
      detail: "done",
      at: "2026-06-01T00:00:02.000Z",
    });

    // Fresh decorator over the same dir + same inner: replay + continue.
    const freshDecorator = new ResumingAgentRuntime({
      inner: scripted,
      journal: new FsAgentRunJournal(root),
    });
    const merged = await freshDecorator.observeRun(runId);
    assert.equal(merged.length, 3, "replay + continuation, no duplicates");
    assert.deepEqual(merged.slice(0, 2), afterTwo, "the replayed prefix is byte-identical");
    assert.equal(merged[merged.length - 1]?.type, "completed");

    // Re-observing the terminal journal neither appends nor errors.
    const again = await freshDecorator.observeRun(runId);
    assert.deepEqual(again, merged);
    const durable = await new FsAgentRunJournal(root).readJournal(runId);
    assert.deepEqual(durable?.events, merged, "journal and replay agree");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
