/**
 * Typed errors for the durable agent-run journal (adapters layer).
 *
 * The journal is fail-closed: a corrupt record — including a torn
 * tail from a crash mid-append — surfaces as a typed
 * `AgentRunJournalError`, never silent truncation and never a
 * fabricated event.
 */

/** Where the journal file lives on disk (diagnostics evidence). */
export type AgentRunJournalLocation = string;

/**
 * Any integrity violation of one run journal: unreadable bytes, a
 * corrupt or missing header, a malformed or torn event record, an
 * id-address mismatch, or an illegal append (duplicate/regressive
 * seq, runId mismatch, append without an open journal, header
 * conflict, divergent replay).
 */
export class AgentRunJournalError extends Error {
  /** The journal file's path (when known). */
  readonly journalPath: AgentRunJournalLocation;
  /** Machine-readable reason for logs and tests. */
  readonly reason: string;

  constructor(message: string, journalPath: AgentRunJournalLocation, reason: string) {
    super(message);
    this.name = "AgentRunJournalError";
    this.journalPath = journalPath;
    this.reason = reason;
  }
}
