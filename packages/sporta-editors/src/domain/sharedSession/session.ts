import type { ContentHash, Iso8601, PolicySet, SportaId } from "@sporta/contracts/contract";
import type { EditorResolution } from "../ports.js";
import {
  SharedSessionAdmissionError,
  SharedSessionClosedError,
  UnknownSharedParticipantError,
} from "./errors.js";
import { joinPresence, leavePresence, type ParticipantPresence } from "./presence.js";
/**
 * The shared-session record and its typed transitions (domain layer —
 * pure). A live/shared editor session (integration level 3) is ONE
 * coordinated editing surface over an immutable artifact checkpoint:
 * the broker owns rights/checkpoints/reconcile; this record owns
 * admission, participants and lifecycle.
 *
 * The admission authority is the CHECKPOINT REVISION's PolicySet,
 * snapshotted at open (revisions are immutable, so the snapshot equals
 * every later read). A participant NEVER gains rights the checkpoint
 * revision does not carry; an absent/empty usage context admits NO ONE.
 */

/** The caller's declared usage context (mirrors the read-seam shape). */
export interface SharedSessionUsageContext {
  readonly usages: readonly string[];
}

/** Why a participant stopped being part of the session. */
export type SharedSessionLeaveReason = "left" | "disconnected" | "evicted" | "closed";

/**
 * The admission authority: the checkpoint revision's PolicySet, carried
 * with the revision id it was read from (provenance for every join).
 */
export interface SharedSessionAdmission {
  readonly checkpointRevisionId: SportaId;
  readonly policy: PolicySet;
}

/** One admitted participant (admission facts; liveness lives in presence). */
export interface SharedSessionParticipant {
  readonly participantId: string;
  readonly admittedAt: Iso8601;
  readonly capabilities: readonly string[];
  /** The usage context declared at admission (provenance). */
  readonly usage: SharedSessionUsageContext;
  /** Declared usages the checkpoint rights affirmatively permit. */
  readonly effectiveUsages: readonly string[];
  /** The checkpoint revision this admission was derived from. */
  readonly admission: { readonly checkpointRevisionId: SportaId };
  readonly leftAt?: Iso8601;
  readonly leaveReason?: SharedSessionLeaveReason;
}

/** A join (or re-join) request. */
export interface ParticipantAdmissionRequest {
  readonly participantId: string;
  readonly capabilities?: readonly string[];
  readonly usage?: SharedSessionUsageContext;
}

/**
 * The shared session record. `integrationLevel` is 3 by construction:
 * the level-3 surface is this coordination layer composed over the
 * resolved round-trip editor (whose own level lives in `resolution`).
 */
export interface SharedSessionRecord {
  readonly sessionId: SportaId;
  readonly integrationLevel: 3;
  readonly state: "open" | "closed";
  readonly openedAt: Iso8601;
  readonly closedAt?: Iso8601;
  /** The explainable broker resolution this session was opened with. */
  readonly resolution: EditorResolution;
  /** The underlying broker editor session (rights + checkpoint owner). */
  readonly underlyingEditorSessionId: SportaId;
  /** The artifact checkpoint the session edits. */
  readonly artifactRef: {
    readonly artifactId: SportaId;
    readonly checkpointRevisionId: SportaId;
    readonly checkpointContentHash: ContentHash;
  };
  readonly admission: SharedSessionAdmission;
  readonly participants: readonly SharedSessionParticipant[];
  readonly presence: readonly ParticipantPresence[];
}

/**
 * The admission gate (invariant 22 at the level-3 boundary — the SAME
 * rights/usage-context gate family as session opens, fail-closed):
 *
 * 1. absent/empty usage context admits NO ONE;
 * 2. the context must declare "edit" (a shared EDITING session);
 * 3. the checkpoint rights must affirmatively permit "edit";
 * 4. NO declared usage may be prohibited (mixed context judged whole);
 * 5. effective usages = declared ∩ checkpoint-permitted.
 *
 * Returns the effective usages or throws a typed admission refusal.
 */
export function sharedSessionAdmission(
  admission: SharedSessionAdmission,
  usage: SharedSessionUsageContext | undefined,
): readonly string[] {
  if (usage === undefined || usage.usages.length === 0) {
    throw new SharedSessionAdmissionError(
      "an absent or empty usage context admits no participant (fail-closed)",
      "usage-context-empty",
    );
  }
  if (!usage.usages.includes("edit")) {
    throw new SharedSessionAdmissionError(
      "the declared usage context does not declare the edit usage",
      `edit-not-declared:usages=[${usage.usages.join(", ")}]`,
    );
  }
  const rights = admission.policy.rights;
  if (!rights.usages.includes("edit") || rights.prohibitions.includes("edit")) {
    throw new SharedSessionAdmissionError(
      "the checkpoint revision's rights do not carry the edit usage — a participant never gains rights the checkpoint does not carry",
      `checkpoint=${admission.checkpointRevisionId} usages=[${rights.usages.join(
        ", ",
      )}] prohibitions=[${rights.prohibitions.join(", ")}]`,
    );
  }
  for (const candidate of usage.usages) {
    if (rights.prohibitions.includes(candidate)) {
      throw new SharedSessionAdmissionError(
        "the declared usage context includes a usage the checkpoint rights prohibit (mixed context judged as a whole)",
        `prohibited-usage:${candidate}`,
      );
    }
  }
  return usage.usages.filter((candidate) => rights.usages.includes(candidate));
}

/**
 * Derive the underlying broker editor-session id for a shared session —
 * deterministic, so an interrupted open retries onto the same broker
 * session (the broker's own idempotency law).
 */
export function underlyingEditorSessionIdFor(sessionId: SportaId): SportaId {
  return `${sessionId}#es`;
}

/**
 * Build the initial shared-session record, admitting the OPENER as
 * participant #1 through the same admission gate as everyone else.
 */
export function openSharedSessionRecord(input: {
  readonly sessionId: SportaId;
  readonly resolution: EditorResolution;
  readonly underlyingEditorSessionId: SportaId;
  readonly checkpoint: {
    readonly artifactId: SportaId;
    readonly revisionId: SportaId;
    readonly contentHash: ContentHash;
    readonly policy: PolicySet;
  };
  readonly opener: {
    readonly participantId: string;
    readonly capabilities?: readonly string[];
    readonly usage: SharedSessionUsageContext;
  };
  readonly openedAt: Iso8601;
}): SharedSessionRecord {
  const admission: SharedSessionAdmission = {
    checkpointRevisionId: input.checkpoint.revisionId,
    policy: input.checkpoint.policy,
  };
  const effectiveUsages = sharedSessionAdmission(admission, input.opener.usage);
  const capabilities = [...(input.opener.capabilities ?? [])];
  const participant: SharedSessionParticipant = {
    participantId: input.opener.participantId,
    admittedAt: input.openedAt,
    capabilities,
    usage: { usages: [...input.opener.usage.usages] },
    effectiveUsages: [...effectiveUsages],
    admission: { checkpointRevisionId: input.checkpoint.revisionId },
  };
  return {
    sessionId: input.sessionId,
    integrationLevel: 3,
    state: "open",
    openedAt: input.openedAt,
    resolution: input.resolution,
    underlyingEditorSessionId: input.underlyingEditorSessionId,
    artifactRef: {
      artifactId: input.checkpoint.artifactId,
      checkpointRevisionId: input.checkpoint.revisionId,
      checkpointContentHash: input.checkpoint.contentHash,
    },
    admission,
    participants: [participant],
    presence: joinPresence(
      [],
      { participantId: participant.participantId, capabilities },
      input.openedAt,
    ),
  };
}

/**
 * Admit a participant (join/re-join). Joining an already-live
 * participant is idempotent (record unchanged); a previously left
 * participant is re-admitted through the gate under the SAME id.
 */
export function joinSharedSession(
  record: SharedSessionRecord,
  request: ParticipantAdmissionRequest,
  at: Iso8601,
): SharedSessionRecord {
  if (record.state === "closed") {
    throw new SharedSessionClosedError(
      `shared session ${record.sessionId} is closed and admits no participants`,
      record.sessionId,
    );
  }
  const effectiveUsages = sharedSessionAdmission(record.admission, request.usage);
  const existing = record.participants.find(
    (candidate) => candidate.participantId === request.participantId,
  );
  if (existing !== undefined && existing.leftAt === undefined) return record; // idempotent live join
  const capabilities = [...(request.capabilities ?? [])];
  const participant: SharedSessionParticipant = {
    participantId: request.participantId,
    admittedAt: at,
    capabilities,
    usage: { usages: [...(request.usage?.usages ?? [])] },
    effectiveUsages: [...effectiveUsages],
    admission: { checkpointRevisionId: record.admission.checkpointRevisionId },
  };
  const participants =
    existing === undefined
      ? [...record.participants, participant]
      : record.participants.map((candidate) =>
          candidate.participantId === request.participantId ? participant : candidate,
        );
  return {
    ...record,
    participants,
    presence: joinPresence(
      record.presence,
      { participantId: request.participantId, capabilities },
      at,
    ),
  };
}

/**
 * A participant leaves (typed reason; first leave wins). `"closed"` is
 * reserved for the close transition itself.
 */
export function leaveSharedSession(
  record: SharedSessionRecord,
  participantId: string,
  reason: SharedSessionLeaveReason,
  at: Iso8601,
): SharedSessionRecord {
  if (record.state === "closed") {
    throw new SharedSessionClosedError(
      `shared session ${record.sessionId} is closed; its participants already left`,
      record.sessionId,
    );
  }
  const existing = record.participants.find(
    (candidate) => candidate.participantId === participantId,
  );
  if (existing === undefined) {
    throw new UnknownSharedParticipantError(
      `participant "${participantId}" is not admitted to shared session ${record.sessionId}`,
      participantId,
    );
  }
  if (existing.leftAt !== undefined) return record; // idempotent: first leave wins
  return {
    ...record,
    participants: record.participants.map((candidate) =>
      candidate.participantId === participantId
        ? { ...candidate, leftAt: at, leaveReason: reason }
        : candidate,
    ),
    presence: leavePresence(record.presence, participantId),
  };
}

/**
 * Close the session (first close wins, idempotent): every live
 * participant leaves with reason `"closed"`.
 */
export function closeSharedSessionRecord(
  record: SharedSessionRecord,
  at: Iso8601,
): SharedSessionRecord {
  if (record.state === "closed") return record;
  return {
    ...record,
    state: "closed",
    closedAt: at,
    participants: record.participants.map((candidate) =>
      candidate.leftAt === undefined
        ? { ...candidate, leftAt: at, leaveReason: "closed" }
        : candidate,
    ),
    presence: record.presence.map((candidate) =>
      candidate.state === "live" ? { ...candidate, state: "left" } : candidate,
    ),
  };
}

/**
 * Require that a participant is admitted AND live (the broadcast law:
 * only live admitted participants may broadcast into the session).
 */
export function requireLiveParticipant(record: SharedSessionRecord, participantId: string): void {
  const participant = record.participants.find(
    (candidate) => candidate.participantId === participantId,
  );
  if (participant === undefined) {
    throw new UnknownSharedParticipantError(
      `participant "${participantId}" is not admitted to shared session ${record.sessionId}`,
      participantId,
    );
  }
  if (participant.leftAt !== undefined) {
    throw new SharedSessionAdmissionError(
      `participant "${participantId}" left shared session ${record.sessionId} (${participant.leaveReason ?? "left"}) and is no longer live`,
      `not-live:${participantId}`,
    );
  }
}

/** Leave summary for close results (participant + final leave reason). */
export function sharedSessionLeaveSummary(
  record: SharedSessionRecord,
): readonly { participantId: string; leaveReason: SharedSessionLeaveReason }[] {
  return record.participants.map((participant) => ({
    participantId: participant.participantId,
    leaveReason: participant.leaveReason ?? "left",
  }));
}
