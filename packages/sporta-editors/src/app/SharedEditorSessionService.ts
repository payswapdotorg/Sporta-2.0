import type { SportaId } from "@sporta/contracts/contract";
import { UnknownRevisionError } from "../domain/errors.js";
import {
  advanceCoordinationHead,
  broadcastSharedDelta,
  initialSharedSessionCoordination,
  validateSharedSessionReconcile,
} from "../domain/sharedSession/coordination.js";
import type { SharedSessionCoordination } from "../domain/sharedSession/coordination.js";
import {
  SharedSessionAdmissionError,
  SharedSessionClosedError,
  UnknownSharedSessionError,
} from "../domain/sharedSession/errors.js";
import { heartbeatPresence, liveParticipantIds } from "../domain/sharedSession/presence.js";
import type {
  BroadcastSharedDeltaInput,
  CloseSharedSessionInput,
  HeartbeatSharedSessionInput,
  JoinSharedSessionInput,
  LeaveSharedSessionInput,
  OpenSharedSessionInput,
  SaveSharedSessionInput,
  SharedDeltaBroadcastReceipt,
  SharedEditorSessionDeps,
  SharedSessionCloseResult,
  SharedSessionSaveResult,
} from "../domain/sharedSession/ports.js";
import {
  closeSharedSessionRecord,
  joinSharedSession,
  leaveSharedSession,
  openSharedSessionRecord,
  requireLiveParticipant,
  sharedSessionLeaveSummary,
  underlyingEditorSessionIdFor,
} from "../domain/sharedSession/session.js";
import type { SharedSessionRecord } from "../domain/sharedSession/session.js";
/**
 * SharedEditorSessionService — the level-3 live/shared editor session
 * service (app layer, over injected ports).
 *
 * Lifecycle (the editor-integration law's session rules):
 * open (broker resolve + checkpoint + admission) → join (presence +
 * rights gate) → broadcast deltas (the coordination law's total order)
 * → save/close (reconcile, hash, revision, EditDelta emission, then
 * validation). The broker owns rights/checkpoints/reconcile; this
 * service owns admission, presence, ordering and the close memo. The
 * optional `deltaSink`/`historyRead` ports are additive (W4-B pattern):
 * absent ports never change the core lifecycle.
 */
export class SharedEditorSessionService {
  private readonly deps: SharedEditorSessionDeps;
  private nextSessionSequence = 0;

  constructor(deps: SharedEditorSessionDeps) {
    this.deps = deps;
  }

  /**
   * Open a live/shared session on an artifact revision. Idempotent per
   * `sessionId` (first write wins); the underlying broker session id is
   * derived deterministically (`<sessionId>#es`) so interrupted opens
   * retry onto the same broker session.
   */
  async openSharedSession(input: OpenSharedSessionInput): Promise<SharedSessionRecord> {
    const sessionId = input.sessionId ?? this.mintSessionId();
    const existing = await this.deps.sharedSessionStore.findSession(sessionId);
    if (existing !== null) return existing;

    // Resolve first: a shared session needs round-trip (level >= 2);
    // the level-3 surface is this coordination layer over that editor.
    const resolution = await this.deps.broker.resolveEditor({
      revisionId: input.revisionId,
      operation: "round-trip",
      userPreference: input.userPreference,
      availability: input.availability,
    });
    // The admission authority: the checkpoint revision's own PolicySet
    // (a refused admission leaves no trace — nothing was opened yet).
    const checkpoint = await this.deps.artifactGraph.readRevision(input.revisionId);
    if (checkpoint === null) {
      throw new UnknownRevisionError(
        `cannot open a shared session on unknown revision ${input.revisionId}`,
        input.revisionId,
      );
    }
    const underlyingEditorSessionId = underlyingEditorSessionIdFor(sessionId);
    const record = openSharedSessionRecord({
      sessionId,
      resolution,
      underlyingEditorSessionId,
      checkpoint: {
        artifactId: checkpoint.artifactId,
        revisionId: checkpoint.revisionId,
        contentHash: checkpoint.contentHash,
        policy: checkpoint.policy,
      },
      opener: input.opener,
      openedAt: this.deps.clock.now(),
    });
    // The broker applies every Wave 1 + W4B gate (session policy,
    // checkpoint rights, retention) and creates the checkpoint session.
    await this.deps.broker.openSession({
      revisionId: input.revisionId,
      editorId: resolution.editorId,
      mode: input.mode,
      policy: input.policy,
      editorSessionId: underlyingEditorSessionId,
    });
    await this.coherenceCheck(underlyingEditorSessionId, input.opener.usage);
    await this.deps.sharedSessionStore.saveSession(record);
    await this.deps.sharedSessionStore.saveCoordination(
      initialSharedSessionCoordination(sessionId, checkpoint.revisionId),
    );
    return record;
  }

  /** Admit a participant (join/re-join; idempotent while live). */
  async joinSharedSession(input: JoinSharedSessionInput): Promise<SharedSessionRecord> {
    const record = await this.requireOpenSession(input.sessionId);
    const joined = joinSharedSession(
      record,
      {
        participantId: input.participantId,
        capabilities: input.capabilities,
        usage: input.usage,
      },
      this.deps.clock.now(),
    );
    await this.deps.sharedSessionStore.saveSession(joined);
    return joined;
  }

  /** A participant leaves (typed reason; first leave wins). */
  async leaveSharedSession(input: LeaveSharedSessionInput): Promise<SharedSessionRecord> {
    const record = await this.requireOpenSession(input.sessionId);
    const left = leaveSharedSession(
      record,
      input.participantId,
      input.reason ?? "left",
      this.deps.clock.now(),
    );
    await this.deps.sharedSessionStore.saveSession(left);
    return left;
  }

  /** Refresh a live participant's heartbeat (pure record transform). */
  async heartbeatSharedSession(input: HeartbeatSharedSessionInput): Promise<SharedSessionRecord> {
    const record = await this.requireOpenSession(input.sessionId);
    const updated: SharedSessionRecord = {
      ...record,
      presence: heartbeatPresence(record.presence, input.participantId, this.deps.clock.now()),
    };
    await this.deps.sharedSessionStore.saveSession(updated);
    return updated;
  }

  /**
   * Broadcast one delta into the session's total order. Idempotent per
   * delta id (an absent id is derived content-addressed over the delta
   * itself, so identical resubmissions dedupe by construction). Newly
   * delivered deltas are fanned out through the optional sink.
   */
  async broadcastDelta(input: BroadcastSharedDeltaInput): Promise<SharedDeltaBroadcastReceipt> {
    const session = await this.requireOpenSession(input.sessionId);
    requireLiveParticipant(session, input.participantId);
    const coordination = await this.coordinationFor(session);
    const deltaId =
      input.deltaId ??
      this.deriveDeltaId(
        input.sessionId,
        input.participantId,
        input.baseRevisionId,
        input.operations,
      );
    const broadcast = broadcastSharedDelta(
      coordination,
      {
        deltaId,
        participantId: input.participantId,
        baseRevisionId: input.baseRevisionId,
        operations: input.operations,
      },
      this.deps.clock.now(),
    );
    if (broadcast.deduplicated) {
      return { entry: broadcast.entry, deduplicated: true };
    }
    await this.deps.sharedSessionStore.saveCoordination(broadcast.coordination);
    if (this.deps.deltaSink !== undefined) {
      await this.deps.deltaSink.publish({
        sessionId: input.sessionId,
        entry: broadcast.entry,
        recipients: liveParticipantIds(session.presence),
      });
    }
    return { entry: broadcast.entry, deduplicated: false };
  }

  /**
   * Mid-session save (the Wave 1 multi-save law at level 3): reconcile
   * WITHOUT closing; the head advances and stale-based deltas conflict
   * from now on. Idempotent per the broker's own reconcile memo.
   */
  async saveSharedSession(input: SaveSharedSessionInput): Promise<SharedSessionSaveResult> {
    const session = await this.requireOpenSession(input.sessionId);
    const coordination = await this.coordinationFor(session);
    const reconcile = await this.reconcileUnderlying(session, input);
    validateSharedSessionReconcile(coordination, reconcile);
    const advanced = advanceCoordinationHead(coordination, reconcile.revision.revisionId);
    await this.deps.sharedSessionStore.saveCoordination(advanced);
    return {
      sessionId: input.sessionId,
      savedAt: this.deps.clock.now(),
      reconcile,
      headRevisionId: reconcile.revision.revisionId,
    };
  }

  /**
   * Reconcile-on-close (the session rules law): reconcile, hash, create
   * revision, emit EditDelta, then run validation; the closed record,
   * the advanced head and the close memo are written only after the
   * validation passes. Idempotent per session id (first close wins).
   */
  async closeSharedSession(input: CloseSharedSessionInput): Promise<SharedSessionCloseResult> {
    const memo = await this.deps.sharedSessionStore.findCloseResult(input.sessionId);
    if (memo !== null) return memo;
    const session = await this.requireSession(input.sessionId);
    if (session.state === "closed") {
      throw new SharedSessionClosedError(
        `shared session ${input.sessionId} is already closed (no close memo found — a torn close; refusing honestly)`,
        input.sessionId,
      );
    }
    const coordination = await this.coordinationFor(session);
    const reconcile = await this.reconcileUnderlying(session, input);
    validateSharedSessionReconcile(coordination, reconcile);
    const closedAt = this.deps.clock.now();
    const closed = closeSharedSessionRecord(session, closedAt);
    const result: SharedSessionCloseResult = {
      sessionId: input.sessionId,
      closedAt,
      reconcile,
      broadcast: {
        count: coordination.log.length,
        lastSequence: coordination.lastSequence,
        deltaIds: coordination.log.map((entry) => entry.deltaId),
      },
      participants: sharedSessionLeaveSummary(closed),
    };
    await this.deps.sharedSessionStore.saveSession(closed);
    await this.deps.sharedSessionStore.saveCoordination(
      advanceCoordinationHead(coordination, reconcile.revision.revisionId),
    );
    await this.deps.sharedSessionStore.saveCloseResult(input.sessionId, result);
    return result;
  }

  /** Reconcile the underlying broker session (the frozen broker law). */
  private async reconcileUnderlying(
    session: SharedSessionRecord,
    input: SaveSharedSessionInput | CloseSharedSessionInput,
  ) {
    return this.deps.broker.reconcileSession({
      editorSessionId: session.underlyingEditorSessionId,
      changedProjectHash: input.changedProjectHash,
      projectFormat: input.projectFormat,
      projectState: input.projectState,
      externalTool: input.externalTool,
    });
  }

  /**
   * The additive coherence check (W4-B pattern): when `historyRead` is
   * wired, the usage context that admits the opener must also be able
   * to SEE the underlying editor session through the rights-gated read
   * seam. Absence is a typed fail-closed admission refusal.
   */
  private async coherenceCheck(
    underlyingEditorSessionId: SportaId,
    usage: { readonly usages: readonly string[] },
  ): Promise<void> {
    if (this.deps.historyRead === undefined) return;
    const listed = await this.deps.historyRead.listEditorSessions({
      editorSessionId: underlyingEditorSessionId,
      usage: { usages: usage.usages },
    });
    if (!listed.some((summary) => summary.editorSessionId === underlyingEditorSessionId)) {
      throw new SharedSessionAdmissionError(
        "the declared usage context is not coherent with the underlying editor session's policy (fail-closed)",
        `usage-context-incoherent:${underlyingEditorSessionId}`,
      );
    }
  }

  /** The session's coordination state (defensively initialized). */
  private async coordinationFor(session: SharedSessionRecord): Promise<SharedSessionCoordination> {
    return (
      (await this.deps.sharedSessionStore.findCoordination(session.sessionId)) ??
      initialSharedSessionCoordination(session.sessionId, session.artifactRef.checkpointRevisionId)
    );
  }

  private async requireSession(sessionId: SportaId): Promise<SharedSessionRecord> {
    const record = await this.deps.sharedSessionStore.findSession(sessionId);
    if (record === null) {
      throw new UnknownSharedSessionError(`unknown shared editor session ${sessionId}`, sessionId);
    }
    return record;
  }

  private async requireOpenSession(sessionId: SportaId): Promise<SharedSessionRecord> {
    const record = await this.requireSession(sessionId);
    if (record.state === "closed") {
      throw new SharedSessionClosedError(`shared session ${sessionId} is closed`, sessionId);
    }
    return record;
  }

  /**
   * Content-addressed delta id: identical resubmissions (same session,
   * participant, base and operations, no caller-supplied id) derive the
   * same id and dedupe by construction.
   */
  private deriveDeltaId(
    sessionId: string,
    participantId: string,
    baseRevisionId: string,
    operations: readonly string[],
  ): string {
    const digest = this.deps.hash(
      `shared-delta\n${sessionId}\n${participantId}\n${baseRevisionId}\n${operations.join("\n")}`,
    );
    return `sd:${digest}`;
  }

  private mintSessionId(): string {
    this.nextSessionSequence += 1;
    return `ss:${this.nextSessionSequence}`;
  }
}
