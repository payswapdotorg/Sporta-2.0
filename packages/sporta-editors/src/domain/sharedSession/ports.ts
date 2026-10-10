import type { EditorSessionSummary, PolicySet, SportaId } from "@sporta/contracts/contract";
import type { ArtifactGraphPort } from "@sporta/artifacts/contract";
import type { EditorSessionHistoryListInput } from "../history.js";
import type {
  EditorAvailability,
  EditorBrokerPort,
  EditorClock,
  EditorHashFn,
  EditorResolution,
  ReconcileResult,
} from "../ports.js";
import type { OrderedSharedDelta, SharedSessionCoordination } from "./coordination.js";
import type {
  ParticipantAdmissionRequest,
  SharedSessionLeaveReason,
  SharedSessionRecord,
  SharedSessionUsageContext,
} from "./session.js";
/**
 * Ports and service-facing types for live/shared editor sessions
 * (domain layer — pure). The level-3 service is built over INJECTED
 * ports; `deltaSink` and `historyRead` are OPTIONAL additive wiring
 * (the W4-B optional-deps pattern) — absent ports never change the
 * core lifecycle.
 */

/**
 * Sole owner of shared-session state: records, coordination state and
 * close memos. `saveSession`/`saveCoordination` are last-write-wins
 * state transitions; `saveCloseResult` is first-write-wins (memo).
 */
export interface SharedSessionStorePort {
  saveSession(record: SharedSessionRecord): Promise<void>;
  findSession(sessionId: SportaId): Promise<SharedSessionRecord | null>;
  saveCoordination(coordination: SharedSessionCoordination): Promise<void>;
  findCoordination(sessionId: SportaId): Promise<SharedSessionCoordination | null>;
  saveCloseResult(sessionId: SportaId, result: SharedSessionCloseResult): Promise<void>;
  findCloseResult(sessionId: SportaId): Promise<SharedSessionCloseResult | null>;
}

/** One live fan-out delivery to the session's live participants. */
export interface SharedDeltaDelivery {
  readonly sessionId: SportaId;
  readonly entry: OrderedSharedDelta;
  /** Live participant ids at delivery time (recipients). */
  readonly recipients: readonly string[];
}

/**
 * Live delta fan-out sink (OPTIONAL, additive). When wired, every NEWLY
 * delivered delta is published to it; deduplicated retries are not.
 */
export interface SharedDeltaSinkPort {
  publish(delivery: SharedDeltaDelivery): Promise<void>;
}

/** Input for opening a live/shared editor session. */
export interface OpenSharedSessionInput {
  /** Optional caller-supplied session id — the idempotency key. */
  readonly sessionId?: SportaId;
  /** The artifact revision to checkpoint the shared session on. */
  readonly revisionId: SportaId;
  /** Editor availability to resolve from (the broker resolves). */
  readonly availability: readonly EditorAvailability[];
  readonly userPreference?: string;
  readonly mode: "local" | "remote" | "embedded" | "external";
  /** The session policy (verified by the broker at open, Wave 1 + W4B). */
  readonly policy: PolicySet;
  /** The opener — admitted through the SAME gate as every participant. */
  readonly opener: {
    readonly participantId: string;
    readonly capabilities?: readonly string[];
    readonly usage: SharedSessionUsageContext;
  };
}

/** Input for joining (or re-joining) a shared session. */
export interface JoinSharedSessionInput extends ParticipantAdmissionRequest {
  readonly sessionId: SportaId;
}

/** Input for leaving a shared session. */
export interface LeaveSharedSessionInput {
  readonly sessionId: SportaId;
  readonly participantId: string;
  readonly reason?: SharedSessionLeaveReason;
}

/** Input for a presence heartbeat. */
export interface HeartbeatSharedSessionInput {
  readonly sessionId: SportaId;
  readonly participantId: string;
}

/** Input for broadcasting one delta into the shared session. */
export interface BroadcastSharedDeltaInput {
  readonly sessionId: SportaId;
  /** Optional delta id — the delivery idempotency key. */
  readonly deltaId?: SportaId;
  readonly participantId: string;
  /** The revision this edit was based on (must match the session head). */
  readonly baseRevisionId: SportaId;
  readonly operations: readonly string[];
}

/** Receipt for a broadcast: the ordered entry + dedupe flag. */
export interface SharedDeltaBroadcastReceipt {
  readonly entry: OrderedSharedDelta;
  readonly deduplicated: boolean;
}

/** Input for a mid-session save (reconcile without closing). */
export interface SaveSharedSessionInput {
  readonly sessionId: SportaId;
  /** Content address of the changed (merged) project state. */
  readonly changedProjectHash: string;
  readonly projectFormat?: string;
  readonly projectState?: unknown;
  readonly externalTool: { name: string; version: string };
}

/** Result of a mid-session save: the reconcile plus the advanced head. */
export interface SharedSessionSaveResult {
  readonly sessionId: SportaId;
  readonly savedAt: string;
  readonly reconcile: ReconcileResult;
  /** The head AFTER the save (the new revision id). */
  readonly headRevisionId: SportaId;
}

/** Input for closing (reconcile-on-close). */
export interface CloseSharedSessionInput {
  readonly sessionId: SportaId;
  /** Content address of the final changed (merged) project state. */
  readonly changedProjectHash: string;
  readonly projectFormat?: string;
  readonly projectState?: unknown;
  readonly externalTool: { name: string; version: string };
}

/** Result of reconcile-on-close (memoized per session id). */
export interface SharedSessionCloseResult {
  readonly sessionId: SportaId;
  readonly closedAt: string;
  /** The broker reconcile: new revision + emitted EditDelta. */
  readonly reconcile: ReconcileResult;
  /** Summary of the total order that was broadcast. */
  readonly broadcast: {
    readonly count: number;
    readonly lastSequence: number;
    readonly deltaIds: readonly SportaId[];
  };
  /** Participants at close, with their final leave reasons. */
  readonly participants: readonly { participantId: string; leaveReason: string }[];
}

/**
 * The additive history-read consumption shape for shared sessions: the
 * frozen contracts query PLUS the caller's usage context (exactly the
 * wave-3 `EditorSessionHistoryListInput` the rights-gated read seam
 * accepts — `EditorSessionHistoryService` satisfies this structurally).
 */
export interface SharedSessionHistoryReadPort {
  listEditorSessions(
    input: EditorSessionHistoryListInput,
  ): Promise<readonly EditorSessionSummary[]>;
}

/** Constructor wiring for SharedEditorSessionService (all seams injected). */
export interface SharedEditorSessionDeps {
  readonly clock: EditorClock;
  readonly hash: EditorHashFn;
  /** The Editor Broker — rights, checkpoints, reconcile (frozen laws). */
  readonly broker: EditorBrokerPort;
  /** The artifact graph — checkpoint revision reads (admission authority). */
  readonly artifactGraph: ArtifactGraphPort;
  readonly sharedSessionStore: SharedSessionStorePort;
  /**
   * Optional live fan-out (additive). When present, every newly
   * delivered delta is published with the live participants as
   * recipients. Absent ⇒ no fan-out, coordination unchanged.
   */
  readonly deltaSink?: SharedDeltaSinkPort;
  /**
   * Optional rights-gated history read (additive, the W4-B pattern).
   * When present, openSharedSession runs a coherence check: the
   * underlying editor session must be VISIBLE to the opener's declared
   * usage context through the read seam (the usage that admits a
   * participant must be able to see the editor session carrying it).
   * Absent ⇒ no check.
   */
  readonly historyRead?: SharedSessionHistoryReadPort;
}

/** Re-exported for the service surface (resolution provenance). */
export type { EditorResolution };
