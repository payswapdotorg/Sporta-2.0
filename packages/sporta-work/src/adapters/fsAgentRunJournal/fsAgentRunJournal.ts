/**
 * FsAgentRunJournal — durable, append-only event journal for
 * AgentRuntimeExecutionPort runs (adapters layer), following the
 * FsSharedSessionStore persistence pattern (sporta-editors W6):
 * hash-addressed per-id files, typed integrity errors, fresh-instance
 * durability.
 *
 * Public layout (documented, stable):
 *   rootDir/<sha256(runId)[0:2]>/<sha256(runId)>.jsonl
 * (default root: <os tmpdir>/sporta-agent-run-journals). One journal
 * file per run: line 1 is the header record (run metadata — the
 * startRun facts), every following line is one observed
 * AgentRunEvent in arrival order.
 *
 * Appends are atomic per record: one fs.appendFile of one complete
 * JSONL line (a single O_APPEND write syscall). Previously journaled
 * bytes are never rewritten, so a host crash mid-append can tear only
 * the trailing record — which readJournal detects and surfaces as a
 * typed AgentRunJournalError (never silent truncation). A crash
 * BETWEEN events loses nothing already journaled, and the journal
 * never fabricates the un-observed remainder: replay ends honestly at
 * the last durable event.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SportaId } from "@sporta/contracts/contract";
import type { AgentRunEvent } from "../../domain/ports.js";
import { AgentRunJournalError } from "./errors.js";
import {
  agentRunMetadataEquals,
  parseAgentRunJournal,
  sha256AgentRunHash,
  serializeEventRecord,
  serializeHeaderRecord,
  type AgentRunJournalContents,
  type AgentRunJournalMetadata,
} from "./records.js";

/** Injectable hash for journal addressing (sha-256 by default). */
export type AgentRunJournalHashFn = (input: string) => string;

/** Instance cache: the tail state of one journaled run. */
interface JournaledTail {
  metadata: AgentRunJournalMetadata;
  lastSeq: number;
}

export class FsAgentRunJournal {
  private readonly rootDir: string;
  private readonly hash: AgentRunJournalHashFn;
  private readonly tails = new Map<SportaId, JournaledTail>();

  constructor(
    rootDir: string = join(tmpdir(), "sporta-agent-run-journals"),
    hash: AgentRunJournalHashFn = sha256AgentRunHash,
  ) {
    this.rootDir = rootDir;
    this.hash = hash;
  }

  /**
   * Open (create) the journal for a run: appends the header record
   * when absent. An existing EQUAL header is an idempotent no-op
   * (same-input retry); an existing DIFFERENT header is a typed
   * header-conflict error — re-execution over an unresolved journal
   * never silently overwrites durable history.
   */
  async openJournal(metadata: AgentRunJournalMetadata): Promise<void> {
    const journalPath = this.pathFor(metadata.runId);
    const existing = await this.readQuietly(journalPath);
    if (existing === null) {
      await fs.mkdir(dirname(journalPath), { recursive: true });
      await fs.appendFile(journalPath, serializeHeaderRecord(metadata), "utf8");
      this.tails.set(metadata.runId, { metadata, lastSeq: 0 });
      return;
    }
    const contents = this.parseAt(journalPath, existing.toString("utf8"));
    if (!agentRunMetadataEquals(contents.metadata, metadata)) {
      throw new AgentRunJournalError(
        `agent-run journal ${journalPath} already holds a different header for run ${metadata.runId}` +
          ` (journal startedAt ${contents.metadata.startedAt}, task ${contents.metadata.task};` +
          ` new startedAt ${metadata.startedAt}, task ${metadata.task})`,
        journalPath,
        "header-conflict",
      );
    }
    this.warmTail(contents);
  }

  /**
   * Append one observed event (atomic append write). The journal
   * must be open for the run, the event's runId must match, and the
   * event seq must be strictly greater than the last recorded seq
   * (arrival order — duplicates and regressions are typed errors;
   * gaps are honest: the journal records what was observed).
   */
  async appendEvent(runId: SportaId, event: AgentRunEvent): Promise<void> {
    if (event.runId !== runId) {
      throw new AgentRunJournalError(
        `cannot append event of run ${event.runId} to the journal of run ${runId}`,
        this.pathFor(runId),
        "event-runId-mismatch",
      );
    }
    let tail = this.tails.get(runId);
    if (tail === undefined) {
      // A fresh instance (restart simulation) warms its tail cache
      // from the durable file first — fail-closed when absent/corrupt.
      const contents = await this.readJournal(runId);
      if (contents === null) {
        throw new AgentRunJournalError(
          `cannot append to run ${runId}: no journal entry (the run was never opened)`,
          this.pathFor(runId),
          "journal-not-open",
        );
      }
      tail = this.tails.get(runId) as JournaledTail;
    }
    if (event.seq <= tail.lastSeq) {
      throw new AgentRunJournalError(
        `cannot append event seq ${event.seq} to run ${runId}: last recorded seq is ${tail.lastSeq}` +
          " (arrival order is strictly increasing)",
        this.pathFor(runId),
        `seq-regression:${event.seq}<=${tail.lastSeq}`,
      );
    }
    await fs.appendFile(this.pathFor(runId), serializeEventRecord(event), "utf8");
    tail.lastSeq = event.seq;
  }

  /**
   * Read back + integrity-verify the journal: the metadata and the
   * full ordered event list. Null when the run was never opened.
   * Durability law: a FRESH instance over the same directory reads
   * everything earlier instances wrote.
   */
  async readJournal(runId: SportaId): Promise<AgentRunJournalContents | null> {
    const journalPath = this.pathFor(runId);
    const raw = await this.readQuietly(journalPath);
    if (raw === null) return null;
    const contents = this.parseAt(journalPath, raw.toString("utf8"));
    this.warmTail(contents);
    return contents;
  }

  /** Whether a journal file exists for the run (no parse — presence only). */
  async hasJournal(runId: SportaId): Promise<boolean> {
    try {
      await fs.stat(this.pathFor(runId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /** Public diagnostic path for a run's journal file (`rootDir/<hash[0:2]>/<hash>.jsonl`). */
  journalPathFor(runId: SportaId): string {
    return this.pathFor(runId);
  }

  /** Journal path for a run: `rootDir/<hash[0:2]>/<hash>.jsonl`. */
  private pathFor(runId: SportaId): string {
    const idHash = this.hash(runId);
    return join(this.rootDir, idHash.substring(0, 2), `${idHash}.jsonl`);
  }

  /** The id hash a journal file is addressed by (file name minus .jsonl). */
  private idHashOf(journalFile: string): string {
    return journalFile
      .split(/[\\/]/)
      .pop()!
      .replace(/\.jsonl$/, "");
  }

  /** Parse + verify raw journal bytes at a path. */
  private parseAt(journalPath: string, source: string): AgentRunJournalContents {
    return parseAgentRunJournal(source, journalPath, this.idHashOf(journalPath));
  }

  /** Cache the tail state of a verified read-back. */
  private warmTail(contents: AgentRunJournalContents): void {
    this.tails.set(contents.metadata.runId, {
      metadata: contents.metadata,
      lastSeq: contents.events.length === 0 ? 0 : (contents.events.at(-1)?.seq ?? 0),
    });
  }

  /** Read a journal if present; null only for ENOENT, everything else rethrows. */
  private async readQuietly(journalPath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(journalPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
