import type {
  EditorSessionHistoryReadPort,
  EditorSessionSummary,
} from "@sporta/contracts/contract";
import {
  resolveEditorSessionHistoryLimit,
  sessionVisibleToUsage,
  toEditorSessionSummary,
} from "../domain/history.js";
import type { EditorSessionHistoryDeps, EditorSessionHistoryListInput } from "../domain/history.js";
/**
 * EditorSessionHistoryService — the wave-3 editor-session history read
 * seam (app layer).
 *
 * Implements the frozen contracts `EditorSessionHistoryReadPort` EXACTLY
 * (bounded `listEditorSessions`), backed by an injected
 * `EditorSessionHistoryStorePort` (in-memory or the real FS ledger).
 * The input this service accepts is the ADDITIVE
 * `EditorSessionHistoryListInput`: the contracts query plus the caller's
 * usage context, which drives the invariant-22 rights gate.
 *
 * Honest-refusal law (see SPEC.md, Wave 3): sessions whose PolicySet
 * rights forbid the caller's usage are simply NOT returned. The seam is
 * a read seam, not an authorization oracle — it never errors on a rights
 * refusal and never explains an absence. A query without a usage context
 * lists nothing (fail-closed: permission cannot be affirmed).
 */
export class EditorSessionHistoryService implements EditorSessionHistoryReadPort {
  private readonly deps: EditorSessionHistoryDeps;

  constructor(deps: EditorSessionHistoryDeps) {
    this.deps = deps;
  }

  async listEditorSessions(
    input: EditorSessionHistoryListInput,
  ): Promise<readonly EditorSessionSummary[]> {
    const limit = resolveEditorSessionHistoryLimit(input.limit);
    // The bound applies to the STORE page read (the resource-protection
    // bound of the bounded-query law); the rights gate then filters that
    // page, so a result may be shorter than the limit when prohibited
    // sessions occupy early page slots. That shortness is honest absence.
    const page = await this.deps.history.list({
      revisionId: input.revisionId,
      editorSessionId: input.editorSessionId,
      openOnly: input.openOnly,
      limit,
    });
    return page
      .filter((record) => sessionVisibleToUsage(record.policy.rights, input.usage))
      .map(toEditorSessionSummary);
  }
}
