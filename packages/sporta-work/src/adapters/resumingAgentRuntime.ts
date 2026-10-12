/**
 * ResumingAgentRuntime — a DECORATOR over any AgentRuntimeExecutionPort
 * (adapters layer) providing P8 persistent-worker resume semantics
 * over a durable FsAgentRunJournal.
 *
 * It never implements a second runtime (architecture-lock invariant
 * 2): startRun DELEGATES to the inner port (the real ZCode adapter in
 * REAL lanes; the fixture adapter in fixture-labeled tests) and
 * observeRun merges the durable journal with live observation:
 *
 *   no journal            -> pass-through (the inner's own answer);
 *   journal terminal      -> replay returns the journaled list
 *                            verbatim (the outcome was observed and
 *                            journaled BEFORE the drop — recorded
 *                            truth, never a fabricated completion);
 *   journal non-terminal,
 *   inner still has the run -> replay first (byte-identical order),
 *                            then continue with live events newer than
 *                            the journaled tail (appended durably);
 *   journal non-terminal,
 *   inner cannot observe   -> typed AgentRunOrphanedError carrying
 *                            the LAST journaled state — the honest
 *                            state at the crash, never a fabricated
 *                            completion.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  AgentRunEvent,
  AgentRunHandle,
  AgentRuntimeExecutionPort,
  StartAgentRunInput,
} from "../domain/ports.js";
import { AgentRunJournalError } from "./fsAgentRunJournal/errors.js";
import {
  agentRunEventsEqual,
  type AgentRunJournalContents,
} from "./fsAgentRunJournal/records.js";
import type { FsAgentRunJournal } from "./fsAgentRunJournal/fsAgentRunJournal.js";

/**
 * A run whose journal is non-terminal but which the inner port can no
 * longer observe (orphaned by a host restart): its fate is honestly
 * unknown — this error carries the last durably observed state and
 * NEVER fabricates a completion.
 */
export class AgentRunOrphanedError extends Error {
  readonly runId: SportaId;
  readonly workGraphId: SportaId | undefined;
  /** How many events were durably observed before the run vanished. */
  readonly eventCount: number;
  /** The last journaled event, or null when only the header survived. */
  readonly lastEvent: AgentRunEvent | null;

  constructor(
    message: string,
    details: {
      runId: SportaId;
      workGraphId: SportaId | undefined;
      eventCount: number;
      lastEvent: AgentRunEvent | null;
    },
  ) {
    super(message);
    this.name = "AgentRunOrphanedError";
    this.runId = details.runId;
    this.workGraphId = details.workGraphId;
    this.eventCount = details.eventCount;
    this.lastEvent = details.lastEvent;
  }
}

export interface ResumingAgentRuntimeDeps {
  /** The wrapped runtime (real ZCode adapter or fixture adapter). */
  readonly inner: AgentRuntimeExecutionPort;
  /** The durable journal runs are persisted through. */
  readonly journal: FsAgentRunJournal;
}

export class ResumingAgentRuntime implements AgentRuntimeExecutionPort {
  private readonly inner: AgentRuntimeExecutionPort;
  private readonly journal: FsAgentRunJournal;

  constructor(deps: ResumingAgentRuntimeDeps) {
    this.inner = deps.inner;
    this.journal = deps.journal;
  }

  async startRun(input: StartAgentRunInput): Promise<AgentRunHandle> {
    // The runId and startedAt are the inner's own facts — the
    // decorator never derives them (no second runtime).
    const handle = await this.inner.startRun(input);
    await this.journal.openJournal({
      runId: handle.runId,
      workGraphId: handle.workGraphId,
      startedAt: handle.startedAt,
      task: input.task,
      organizationId: input.organization.organizationId,
      organizationVersion: input.organization.version,
    });
    return handle;
  }

  async observeRun(runRef: SportaId): Promise<readonly AgentRunEvent[]> {
    const journaled = await this.journal.readJournal(runRef);
    // Pass-through: the decorator journals exactly the runs it
    // started; runs it merely finds live are observed honestly.
    if (journaled === null) return this.inner.observeRun(runRef);

    const lastJournaled = journaled.events.at(-1);
    if (lastJournaled !== undefined && isTerminal(lastJournaled)) {
      // The outcome was observed and journaled before the drop —
      // replay is recorded truth, not a fabricated completion.
      return copyEvents(journaled.events);
    }

    const live = await this.inner.observeRun(runRef);
    if (live.length === 0) {
      // Non-terminal journal + unobservable run: orphaned honestly.
      throw new AgentRunOrphanedError(
        `run ${runRef} was orphaned by a restart: the journal holds ${journaled.events.length}` +
          ` observed event(s) (last: ${describeLast(lastJournaled)}) but the runtime can no` +
          " longer observe the run — its un-observed remainder is honestly unknown",
        {
          runId: runRef,
          workGraphId: journaled.metadata.workGraphId,
          eventCount: journaled.events.length,
          lastEvent: lastJournaled ?? null,
        },
      );
    }
    return this.mergeLive(journaled, live, runRef);
  }

  /**
   * Additive process hygiene (NOT part of the port): delegate to the
   * inner adapter's own dispose when it has one, so hosts can kill
   * live children through the decorator.
   */
  dispose(): void {
    const maybeDisposable = this.inner as { dispose?: () => void };
    if (typeof maybeDisposable.dispose === "function") {
      maybeDisposable.dispose();
    }
  }

  /**
   * Replay the journaled history byte-identically, then continue with
   * live events newer than the journaled tail (appending each through
   * the journal). A live event overlapping the journaled seq range
   * must deep-equal the journaled record — divergent histories fail
   * with a typed error, never a silent merge.
   */
  private async mergeLive(
    journaled: AgentRunJournalContents,
    live: readonly AgentRunEvent[],
    runRef: SportaId,
  ): Promise<readonly AgentRunEvent[]> {
    const journalPath = this.journal.journalPathFor(runRef);
    const bySeq = new Map<number, AgentRunEvent>();
    for (const event of journaled.events) bySeq.set(event.seq, event);
    let lastSeq = journaled.events.at(-1)?.seq ?? 0;

    const merged: AgentRunEvent[] = [...journaled.events];
    for (const event of live) {
      if (event.seq <= lastSeq) {
        const recorded = bySeq.get(event.seq);
        if (recorded === undefined || !agentRunEventsEqual(recorded, event)) {
          throw new AgentRunJournalError(
            `divergent replay for run ${runRef}: live event seq ${event.seq} differs from the` +
              " journaled record (the runtime re-emitted different history for the same run)",
            journalPath,
            `divergent-replay:${event.seq}`,
          );
        }
        continue; // already journaled, byte-identical — replay, not re-append
      }
      await this.journal.appendEvent(runRef, event);
      bySeq.set(event.seq, event);
      merged.push(event);
      lastSeq = event.seq;
    }
    return merged;
  }
}

function isTerminal(event: AgentRunEvent): boolean {
  return event.type === "completed" || event.type === "failed";
}

function copyEvents(events: readonly AgentRunEvent[]): AgentRunEvent[] {
  return events.map((event) => ({ ...event }));
}

function describeLast(lastJournaled: AgentRunEvent | undefined): string {
  if (lastJournaled === undefined) return "none — only the header survived";
  return `seq ${lastJournaled.seq} (${lastJournaled.type})`;
}
