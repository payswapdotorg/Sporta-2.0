import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunJournalError,
  FsAgentRunJournal,
  sha256AgentRunHash,
} from "../src/contract.js";
import type { AgentRunJournalMetadata } from "../src/contract.js";
import type { AgentRunEvent } from "../src/contract.js";

/**
 * FsAgentRunJournal — REAL durable-storage tests (the W6
 * FsSharedSessionStore evidence pattern). Every test runs against a
 * real temp directory on the real filesystem: journal records are
 * appended as real JSONL bytes, read back, corrupted by writing real
 * bytes, and durability is proven by FRESH instances over the same
 * directory (the restart simulation). No mocks — the only injected
 * seam is the constructor's root dir; the hash defaults to the real
 * sha-256 adapter.
 */

const metadata: AgentRunJournalMetadata = {
  runId: "run:wg:journal:org:1",
  workGraphId: "wg:journal",
  startedAt: "2026-06-01T00:00:00.000Z",
  task: "journal durability probe",
  organizationId: "org:journal",
  organizationVersion: 1,
};

function event(runId: string, seq: number, type: AgentRunEvent["type"] = "progress"): AgentRunEvent {
  return { runId, seq, type, detail: `event ${seq} (${type})`, at: "2026-06-01T00:00:01.000Z" };
}

async function realRoot(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), "sporta-agent-run-journal-"));
}

test("REAL: open + append + read-back — metadata and events in arrival order", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    await journal.openJournal(metadata);
    await journal.appendEvent(metadata.runId, event(metadata.runId, 1, "started"));
    await journal.appendEvent(metadata.runId, event(metadata.runId, 2));
    await journal.appendEvent(metadata.runId, event(metadata.runId, 3, "completed"));

    const contents = await journal.readJournal(metadata.runId);
    assert.ok(contents !== null, "the journal reads back");
    assert.deepEqual(contents.metadata, metadata, "run metadata survives verbatim");
    assert.equal(contents.events.length, 3);
    assert.deepEqual(
      contents.events.map((one) => one.seq),
      [1, 2, 3],
      "events replay in arrival order",
    );
    assert.equal(contents.events[0]?.type, "started");
    assert.equal(contents.events[2]?.type, "completed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: restart simulation — a FRESH instance over the same directory reads everything back", async () => {
  const root = await realRoot();
  try {
    const first = new FsAgentRunJournal(root);
    await first.openJournal(metadata);
    await first.appendEvent(metadata.runId, event(metadata.runId, 1, "started"));
    await first.appendEvent(metadata.runId, event(metadata.runId, 2));

    // "Restart": drop the instance, open a fresh one over the same dir.
    const second = new FsAgentRunJournal(root);
    const replayed = await second.readJournal(metadata.runId);
    assert.ok(replayed !== null);
    assert.equal(replayed.events.length, 2, "nothing already journaled is lost");
    assert.deepEqual(replayed.metadata, metadata);

    // The fresh instance can CONTINUE the journal (late-observed event).
    await second.appendEvent(metadata.runId, event(metadata.runId, 3, "completed"));
    const third = new FsAgentRunJournal(root);
    const after = await third.readJournal(metadata.runId);
    assert.equal(after?.events.length, 3, "the continuation is durable for the next instance");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: public layout — one .jsonl file per run at rootDir/<sha256(runId)[0:2]>/<sha256(runId)>.jsonl", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    await journal.openJournal(metadata);
    const idHash = sha256AgentRunHash(metadata.runId);
    const expected = join(root, idHash.substring(0, 2), `${idHash}.jsonl`);
    assert.equal(journal.journalPathFor(metadata.runId), expected);
    const stat = await fs.stat(expected);
    assert.ok(stat.isFile(), "the journal file exists at the documented address");
    assert.equal(await journal.hasJournal(metadata.runId), true);
    assert.equal(await journal.hasJournal("run:never-opened"), false);
    assert.equal(await journal.readJournal("run:never-opened"), null, "unknown runs read null");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: corrupt tail — a torn trailing record is a typed AgentRunJournalError, never silent truncation", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    await journal.openJournal(metadata);
    await journal.appendEvent(metadata.runId, event(metadata.runId, 1, "started"));
    await journal.appendEvent(metadata.runId, event(metadata.runId, 2));

    // Simulate a host crash mid-append: a torn record without its newline.
    await fs.appendFile(journal.journalPathFor(metadata.runId), '{"kind":"event","even', "utf8");
    await assert.rejects(
      () => journal.readJournal(metadata.runId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError, "typed error, not a truncated list");
        assert.match(error.reason, /line:4:corrupt-record/);
        return true;
      },
    );

    // A garbage full line mid-file is equally fail-closed.
    await fs.writeFile(journal.journalPathFor(metadata.runId), "not json at all\n", "utf8");
    await assert.rejects(
      () => journal.readJournal(metadata.runId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /line:1:corrupt-header/);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: id-address law — a journal file that does not hash back to its runId is a typed error", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    await journal.openJournal(metadata);
    const foreignId = "run:someone-else:org:1";
    // Hand-place run A's journal at run B's hash-addressed path.
    const foreignHash = sha256AgentRunHash(foreignId);
    const foreignPath = join(root, foreignHash.substring(0, 2), `${foreignHash}.jsonl`);
    await fs.mkdir(join(root, foreignHash.substring(0, 2)), { recursive: true });
    await fs.copyFile(journal.journalPathFor(metadata.runId), foreignPath);
    await assert.rejects(
      () => journal.readJournal(foreignId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /id-address-mismatch/);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: append discipline — append before open, duplicate/regressive seq and runId mismatch are typed errors", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    await assert.rejects(
      () => journal.appendEvent("run:never-opened", event("run:never-opened", 1)),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /journal-not-open/);
        return true;
      },
    );

    await journal.openJournal(metadata);
    await journal.appendEvent(metadata.runId, event(metadata.runId, 1, "started"));
    await assert.rejects(
      () => journal.appendEvent(metadata.runId, event(metadata.runId, 1)),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /seq-regression:1<=1/);
        return true;
      },
    );
    // An honest gap (seq 3 after seq 1) is legal — the journal records
    // what was observed, never invents the missing seq 2.
    await journal.appendEvent(metadata.runId, event(metadata.runId, 3));
    const afterGap = await journal.readJournal(metadata.runId);
    assert.equal(afterGap?.events.length, 2, "an honest gap (1 -> 3) is recorded, never fabricated");

    await assert.rejects(
      () => journal.appendEvent(metadata.runId, event("run:foreign:org:1", 4)),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /event-runId-mismatch/);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: header discipline — matching retry is a no-op; a conflicting header is a typed error", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    await journal.openJournal(metadata);
    await journal.appendEvent(metadata.runId, event(metadata.runId, 1, "started"));

    // Same facts again: idempotent no-op, still exactly one header.
    await journal.openJournal({ ...metadata });
    const source = await fs.readFile(journal.journalPathFor(metadata.runId), "utf8");
    assert.equal(
      source.split("\n").filter((line) => line.includes('"kind":"header"')).length,
      1,
      "the retry did not append a second header",
    );

    // A re-execution (different startedAt/task facts) never overwrites.
    await assert.rejects(
      () => journal.openJournal({ ...metadata, startedAt: "2026-06-02T00:00:00.000Z" }),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /header-conflict/);
        return true;
      },
    );
    const stillOriginal = await new FsAgentRunJournal(root).readJournal(metadata.runId);
    assert.equal(stillOriginal?.metadata.startedAt, metadata.startedAt, "history stays intact");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: empty journal file is fail-closed (typed error), not an empty success", async () => {
  const root = await realRoot();
  const journal = new FsAgentRunJournal(root);
  try {
    const idHash = sha256AgentRunHash(metadata.runId);
    const path = join(root, idHash.substring(0, 2), `${idHash}.jsonl`);
    await fs.mkdir(join(root, idHash.substring(0, 2)), { recursive: true });
    await fs.writeFile(path, "", "utf8");
    await assert.rejects(
      () => journal.readJournal(metadata.runId),
      (error: unknown) => {
        assert.ok(error instanceof AgentRunJournalError);
        assert.match(error.reason, /empty-journal/);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
