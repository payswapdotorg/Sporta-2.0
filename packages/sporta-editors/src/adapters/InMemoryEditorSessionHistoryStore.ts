import type { EditorSessionRecord, Iso8601, SportaId } from "@sporta/contracts/contract";
import { UnknownEditorSessionError } from "../domain/errors.js";
import {
  compareEditorSessionsNewestFirst,
  matchesEditorSessionHistoryFilter,
} from "../domain/history.js";
import type {
  EditorSessionHistoryFilter,
  EditorSessionHistoryStorePort,
} from "../domain/history.js";
/**
 * In-memory editor session history store (fixture-grade, adapters layer).
 *
 * The projection behind the wave-3 rights-gated history reads: session
 * records appended by the broker (or directly in tests), first-write-wins
 * appends, first-close-wins closure, bounded newest-first listing.
 */
export class InMemoryEditorSessionHistoryStore implements EditorSessionHistoryStorePort {
  private readonly sessions = new Map<SportaId, EditorSessionRecord>();

  async append(record: EditorSessionRecord): Promise<void> {
    if (!this.sessions.has(record.editorSessionId)) {
      this.sessions.set(record.editorSessionId, record); // first write wins
    }
  }

  async close(editorSessionId: SportaId, closedAt: Iso8601): Promise<EditorSessionRecord> {
    const existing = this.sessions.get(editorSessionId);
    if (existing === undefined) {
      throw new UnknownEditorSessionError(
        `cannot close unknown editor session ${editorSessionId} in the history`,
        editorSessionId,
      );
    }
    if (existing.closedAt !== undefined) return existing; // first close wins
    const closed: EditorSessionRecord = { ...existing, closedAt };
    this.sessions.set(editorSessionId, closed);
    return closed;
  }

  async list(filter: EditorSessionHistoryFilter): Promise<readonly EditorSessionRecord[]> {
    const matches = [...this.sessions.values()]
      .filter((record) => matchesEditorSessionHistoryFilter(record, filter))
      .sort(compareEditorSessionsNewestFirst);
    return matches.slice(0, filter.limit);
  }
}
