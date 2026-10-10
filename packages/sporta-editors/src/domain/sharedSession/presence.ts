import type { Iso8601 } from "@sporta/contracts/contract";
import { UnknownSharedParticipantError } from "./errors.js";
/**
 * Participant presence for live/shared editor sessions (domain layer —
 * pure record transforms: NO timers, NO IO).
 *
 * `lastHeartbeatAt` is a RECORD FIELD with clock-provided values; the
 * semantic (how stale a heartbeat may be before a participant counts as
 * gone) belongs to hosts above this layer — this module never computes
 * time, it only carries it.
 */

/** Presence capabilities a participant declares when joining. */
export interface SharedPresenceCapabilities {
  readonly participantId: string;
  /** Free-form declared capability names (e.g. "timeline", "live"). */
  readonly capabilities: readonly string[];
}

/** One participant's live presence inside a shared session. */
export interface ParticipantPresence {
  readonly participantId: string;
  /** Presence capabilities declared at join/refresh time. */
  readonly capabilities: readonly string[];
  readonly joinedAt: Iso8601;
  /** Clock-provided timestamp of the last heartbeat (semantic only). */
  readonly lastHeartbeatAt: Iso8601;
  readonly state: "live" | "left";
}

/**
 * Record a participant going live (join or re-join). Idempotent for an
 * already-live participant: the record is refreshed in place (one
 * presence record per participant id, deterministic).
 */
export function joinPresence(
  presence: readonly ParticipantPresence[],
  declared: SharedPresenceCapabilities,
  at: Iso8601,
): readonly ParticipantPresence[] {
  const existing = presence.find((entry) => entry.participantId === declared.participantId);
  if (existing !== undefined && existing.state === "live") {
    // Idempotent live re-join: refresh capabilities + heartbeat only.
    return presence.map((entry) =>
      entry.participantId === declared.participantId
        ? {
            ...entry,
            capabilities: [...declared.capabilities],
            lastHeartbeatAt: at,
          }
        : entry,
    );
  }
  if (existing !== undefined) {
    // Re-join after leaving: one record per participant, live again.
    return presence.map((entry) =>
      entry.participantId === declared.participantId
        ? {
            participantId: declared.participantId,
            capabilities: [...declared.capabilities],
            joinedAt: at,
            lastHeartbeatAt: at,
            state: "live",
          }
        : entry,
    );
  }
  return [
    ...presence,
    {
      participantId: declared.participantId,
      capabilities: [...declared.capabilities],
      joinedAt: at,
      lastHeartbeatAt: at,
      state: "live",
    },
  ];
}

/**
 * Refresh a live participant's heartbeat. Pure: the timestamp comes from
 * the injected clock at the service boundary. Unknown participant or a
 * left one is a typed refusal (a heartbeat cannot resurrect admission).
 */
export function heartbeatPresence(
  presence: readonly ParticipantPresence[],
  participantId: string,
  at: Iso8601,
): readonly ParticipantPresence[] {
  const existing = presence.find((entry) => entry.participantId === participantId);
  if (existing === undefined) {
    throw new UnknownSharedParticipantError(
      `cannot record a heartbeat for unknown participant "${participantId}"`,
      participantId,
    );
  }
  if (existing.state !== "live") {
    throw new UnknownSharedParticipantError(
      `participant "${participantId}" is not live; a heartbeat cannot resurrect presence`,
      participantId,
    );
  }
  return presence.map((entry) =>
    entry.participantId === participantId ? { ...entry, lastHeartbeatAt: at } : entry,
  );
}

/** Mark a participant as left (first leave wins; unknown is typed). */
export function leavePresence(
  presence: readonly ParticipantPresence[],
  participantId: string,
): readonly ParticipantPresence[] {
  const existing = presence.find((entry) => entry.participantId === participantId);
  if (existing === undefined) {
    throw new UnknownSharedParticipantError(
      `cannot remove unknown participant "${participantId}" from presence`,
      participantId,
    );
  }
  if (existing.state !== "live") return presence; // idempotent: already left
  return presence.map((entry) =>
    entry.participantId === participantId ? { ...entry, state: "left" } : entry,
  );
}

/** The participant ids currently live (who would receive broadcasts). */
export function liveParticipantIds(presence: readonly ParticipantPresence[]): readonly string[] {
  return presence.filter((entry) => entry.state === "live").map((entry) => entry.participantId);
}

/** Find one participant's presence record, when present. */
export function findPresence(
  presence: readonly ParticipantPresence[],
  participantId: string,
): ParticipantPresence | undefined {
  return presence.find((entry) => entry.participantId === participantId);
}
