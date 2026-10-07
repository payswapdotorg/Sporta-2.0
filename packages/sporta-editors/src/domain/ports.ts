import type { ArtifactGraphPort } from "@sporta/artifacts/contract";
import type {
  ArtifactRevisionRecord,
  EditDeltaRecord,
  EditorSessionRecord,
  Iso8601,
  SportaId,
} from "@sporta/contracts/contract";
import type { EditOperation } from "./operations.js";
/**
 * sporta-editors ports and operational types (domain layer — pure).
 *
 * Re-exported through src/contract.ts, the single public entrypoint. The
 * v1 shapes are frozen; Wave 1 adds optional idempotency/format fields and
 * the adapter/store/clock/hash seams (all additive).
 */

/** Injectable clock; session timestamps come only from here. */
export interface EditorClock {
  now(): Iso8601;
}

/** Injected sha-256 helper (the real implementation lives in adapters). */
export type EditorHashFn = (input: string) => string;

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
  /** Optional caller-supplied session id — the idempotency key. */
  editorSessionId?: SportaId;
}

/** Input for reconciling a closed/changed editor session. */
export interface ReconcileSessionInput {
  editorSessionId: SportaId;
  changedProjectHash: string;
  externalTool: { name: string; version: string };
  /** Project format of the changed project state, when known. */
  projectFormat?: string;
  /** Changed project state payload (fixture-grade, JSON-shaped). */
  projectState?: unknown;
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

/**
 * One external editor adapter. Adapters are capabilities, never semantic
 * authorities: they declare what they understand and derive typed
 * operations; the broker owns every canonical decision.
 */
export interface EditorAdapterPort {
  readonly editorId: string;
  readonly editorVersion: string;
  /** 1 = export, 2 = round-trip, 3 = live/shared session. */
  readonly integrationLevel: 1 | 2 | 3;
  readonly licensing: string;
  /** Project formats this adapter can round-trip (understood formats). */
  readonly knownProjectFormats: readonly string[];
  /** Derive typed edit operations from a changed project state. */
  deriveOperations(projectState: unknown): readonly EditOperation[];
}

/**
 * Editor session state store. The sole owner of session records, the
 * mutable current-revision pointer (starts at the checkpoint) and the
 * reconcile-result memos.
 */
export interface EditorSessionStorePort {
  save(record: EditorSessionRecord): Promise<void>;
  find(editorSessionId: SportaId): Promise<EditorSessionRecord | null>;
  currentRevisionId(editorSessionId: SportaId): Promise<SportaId | null>;
  /** Advance the session's current revision (retries are memoized). */
  advanceRevision(editorSessionId: SportaId, revisionId: SportaId): Promise<void>;
  findReconcileResult(
    editorSessionId: SportaId,
    changedProjectHash: string,
  ): Promise<ReconcileResult | null>;
  saveReconcileResult(
    editorSessionId: SportaId,
    changedProjectHash: string,
    result: ReconcileResult,
  ): Promise<void>;
}

/** Constructor wiring for EditorBrokerService (all seams injected). */
export interface EditorBrokerDeps {
  readonly clock: EditorClock;
  readonly hash: EditorHashFn;
  readonly artifactGraph: ArtifactGraphPort;
  readonly sessionStore: EditorSessionStorePort;
  readonly adapters: readonly EditorAdapterPort[];
}
