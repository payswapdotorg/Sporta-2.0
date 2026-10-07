import type { SportaId } from "@sporta/contracts/contract";
/**
 * Typed sporta-editors errors (domain layer — pure, no IO).
 *
 * Editor/rights failures are typed refusals, never silent degradation.
 */

/** Base class for all typed sporta-editors errors. */
export class EditorError extends Error {
  /** Machine-readable detail for logs and tests. */
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = new.target.name;
    this.detail = detail;
  }
}

/** No eligible editor for the requested operation (typed refusal). */
export class EditorResolutionError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, `resolution-refused:${detail}`);
  }
}

/** Policy rights do not permit opening an editing session. */
export class EditorRightsRefusalError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, `rights-refused:${detail}`);
  }
}

/** The checkpoint revision does not exist in the artifact graph. */
export class UnknownRevisionError extends EditorError {
  readonly revisionId: SportaId;

  constructor(message: string, revisionId: string) {
    super(message, `unknown-revision:${revisionId}`);
    this.revisionId = revisionId;
  }
}

/** The editor has no registered adapter (it is not a known capability). */
export class UnknownEditorError extends EditorError {
  readonly editorId: string;

  constructor(message: string, editorId: string) {
    super(message, `unknown-editor:${editorId}`);
    this.editorId = editorId;
  }
}

/** The editor session id does not exist. */
export class UnknownEditorSessionError extends EditorError {
  readonly editorSessionId: SportaId;

  constructor(message: string, editorSessionId: string) {
    super(message, `unknown-editor-session:${editorSessionId}`);
    this.editorSessionId = editorSessionId;
  }
}
