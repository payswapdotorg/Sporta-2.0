/**
 * sporta-editors — the Editor Broker and external editor adapters.
 *
 * Integration levels: 1 export, 2 round-trip, 3 live/shared session.
 * External applications are capabilities/adapters, never semantic
 * authorities; their project files never become canonical Sporta state.
 */
import type {
  ArtifactRevisionRecord,
  EditDeltaRecord,
  EditorSessionRecord,
  SportaId,
} from "@sporta/contracts/contract";

export type { EditDeltaRecord, EditorSessionRecord } from "@sporta/contracts/contract";

/** What the broker resolves an editor for. */
export interface ResolveEditorInput {
  revisionId: SportaId;
  operation: "edit" | "inspect" | "export" | "round-trip";
  userPreference?: string;
  availability: readonly EditorAvailability[];
}

/** One known editor installation or remote editor capability. */
export interface EditorAvailability {
  editorId: string;
  version?: string;
  integrationLevel: 1 | 2 | 3;
  projectFormat?: string;
  licensing: string;
}

/** Explainable editor resolution. */
export interface EditorResolution {
  editorId: string;
  integrationLevel: 1 | 2 | 3;
  rationale: string;
}

/** Input for opening a bounded editor session. */
export interface OpenEditorSessionInput {
  revisionId: SportaId;
  editorId: string;
  mode: EditorSessionRecord["mode"];
  policy: EditorSessionRecord["policy"];
}

/** Input for reconciling a closed/changed editor session. */
export interface ReconcileSessionInput {
  editorSessionId: SportaId;
  changedProjectHash: string;
  externalTool: { name: string; version: string };
}

/** Result of reconciliation: a new revision plus its delta. */
export interface ReconcileResult {
  revision: ArtifactRevisionRecord;
  delta: EditDeltaRecord;
  /** False when the project is only partially understood (opaque import). */
  understood: boolean;
}

/**
 * The Editor Broker port. Unknown or partially understood projects
 * import as opaque revisions and never overwrite canonical history.
 */
export interface EditorBrokerPort {
  resolveEditor(input: ResolveEditorInput): Promise<EditorResolution>;
  openSession(input: OpenEditorSessionInput): Promise<EditorSessionRecord>;
  reconcileSession(input: ReconcileSessionInput): Promise<ReconcileResult>;
}
