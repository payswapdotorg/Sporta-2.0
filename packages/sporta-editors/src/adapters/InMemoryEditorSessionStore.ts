import type { EditorSessionRecord, SportaId } from "@sporta/contracts/contract";
import type { EditorSessionStorePort, ReconcileResult } from "../domain/ports.js";
/**
 * In-memory editor session store (fixture-grade).
 *
 * Sole owner of session records, the mutable current-revision pointer
 * (starts at the session checkpoint and only advances on reconcile) and
 * the per-(session, changedProjectHash) reconcile-result memos.
 */
export class InMemoryEditorSessionStore implements EditorSessionStorePort {
  private readonly sessions = new Map<SportaId, EditorSessionRecord>();
  private readonly currentRevisions = new Map<SportaId, SportaId>();
  private readonly reconcileResults = new Map<string, ReconcileResult>();

  async save(record: EditorSessionRecord): Promise<void> {
    this.sessions.set(record.editorSessionId, record);
  }

  async find(editorSessionId: SportaId): Promise<EditorSessionRecord | null> {
    return this.sessions.get(editorSessionId) ?? null;
  }

  async currentRevisionId(editorSessionId: SportaId): Promise<SportaId | null> {
    return this.currentRevisions.get(editorSessionId) ?? null;
  }

  async advanceRevision(editorSessionId: SportaId, revisionId: SportaId): Promise<void> {
    this.currentRevisions.set(editorSessionId, revisionId);
  }

  async findReconcileResult(
    editorSessionId: SportaId,
    changedProjectHash: string,
  ): Promise<ReconcileResult | null> {
    return this.reconcileResults.get(this.memoKey(editorSessionId, changedProjectHash)) ?? null;
  }

  async saveReconcileResult(
    editorSessionId: SportaId,
    changedProjectHash: string,
    result: ReconcileResult,
  ): Promise<void> {
    this.reconcileResults.set(this.memoKey(editorSessionId, changedProjectHash), result);
  }

  private memoKey(editorSessionId: SportaId, changedProjectHash: string): string {
    return `${editorSessionId}\n${changedProjectHash}`;
  }
}
