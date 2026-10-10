import type { Confidence, Iso8601, SportaId } from "@sporta/contracts/contract";
import { sortedUniqueIds } from "../snapshot.js";
import type { CalibratedState, CalibratedTrack } from "./calibration.js";
import { EventReconstructionError } from "./errors.js";
import type { PerceivedPosition } from "./provenance.js";
import { isFiniteNumber, isNonEmptyString, isPlainObject, joinIdSegments } from "./provenance.js";

/**
 * Stage 6 — event reconstruction (domain layer — pure).
 *
 * Reconstructed event records in the contract's event vocabulary, each
 * with per-event provenance refs to its SOURCE OBSERVATIONS. Detection
 * laws (never guessing): a zone-entry fires only on a consecutive
 * state pair (outside -> inside) — a first state already inside emits
 * NOTHING (the entry was not observed); a possession-change fires only
 * between consecutive states whose declared possessions differ (a
 * change to/from an absent possession is carried honestly; equal or
 * both-absent possessions emit nothing). Confidence is min over the
 * event's source states — carry or lower only.
 */

/** Axis-aligned ground-plane zone bounds. */
export interface ZoneBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Rule: fire when a watched entity's track crosses into a zone. */
export interface ZoneEntryRule {
  kind: "zone-entry";
  ruleId: SportaId;
  zoneId: SportaId;
  bounds: ZoneBounds;
  watchedEntities: readonly SportaId[];
}

/** Rule: fire when the declared ball's possession changes. */
export interface PossessionChangeRule {
  kind: "possession-change";
  ruleId: SportaId;
  ballEntityId: SportaId;
}

export type EventReconstructionRule = ZoneEntryRule | PossessionChangeRule;

export interface ZoneEntryDetail {
  zoneId: SportaId;
}

export interface PossessionChangeDetail {
  fromPossession?: SportaId;
  toPossession?: SportaId;
}

/** A reconstructed event — strictly derived from calibrated tracks. */
export interface ReconstructedEvent {
  /** Deterministic: kind + rule + entity + triggering observation. */
  eventId: SportaId;
  kind: "zone-entry" | "possession-change";
  ruleId: SportaId;
  domain: string;
  entityId: SportaId;
  /** The calibrated timestamp of the triggering state. */
  capturedAt: Iso8601;
  /** min over the event's source states — carry or lower only. */
  confidence: Confidence;
  /** Per-event provenance refs to the source observations. */
  sourceObservationIds: readonly SportaId[];
  sourceFactIds: readonly SportaId[];
  acquisitionIds: readonly SportaId[];
  detail: ZoneEntryDetail | PossessionChangeDetail;
}

/**
 * Reconstruct events from calibrated tracks. Events are deduplicated
 * by eventId and sorted by eventId (the batch output order is
 * independent of the input order). Rules are validated even when the
 * batch is empty; the domain must be declared (events self-describe
 * their domain for downstream observers).
 */
export function reconstructEvents(
  tracks: readonly CalibratedTrack[],
  rules: readonly EventReconstructionRule[],
  domain: string,
): ReconstructedEvent[] {
  if (!isNonEmptyString(domain)) {
    throw new EventReconstructionError(
      "event reconstruction requires a declared domain",
      `domain:${String(domain)}`,
    );
  }
  validateRules(rules);
  const events = new Map<SportaId, ReconstructedEvent>();
  for (const rule of rules) {
    if (rule.kind === "zone-entry") {
      detectZoneEntries(rule, tracks, domain, events);
    } else {
      detectPossessionChanges(rule, tracks, domain, events);
    }
  }
  return [...events.values()].sort((left, right) =>
    left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0,
  );
}

function validateRules(rules: readonly EventReconstructionRule[]): void {
  if (!Array.isArray(rules)) {
    throw new EventReconstructionError("event rules must be an array", "rules");
  }
  const seenRuleIds = new Set<SportaId>();
  for (const rule of rules) {
    if (rule === null || typeof rule !== "object") {
      throw new EventReconstructionError("event rule must be an object", "rule");
    }
    if (rule.kind !== "zone-entry" && rule.kind !== "possession-change") {
      throw new EventReconstructionError(
        `event rule kind "${String(rule.kind)}" is not in the declared vocabulary`,
        `kind:${String(rule.kind)}`,
      );
    }
    if (!isNonEmptyString(rule.ruleId)) {
      throw new EventReconstructionError("ruleId must be a non-empty string", "ruleId");
    }
    if (seenRuleIds.has(rule.ruleId)) {
      throw new EventReconstructionError(
        `duplicate ruleId "${rule.ruleId}" in one batch`,
        `duplicate:${rule.ruleId}`,
      );
    }
    seenRuleIds.add(rule.ruleId);
    if (rule.kind === "zone-entry") {
      validateZoneRule(rule);
    } else if (!isNonEmptyString(rule.ballEntityId)) {
      throw new EventReconstructionError(
        `possession-change rule "${rule.ruleId}" must declare a ballEntityId`,
        `ball-entity:${rule.ruleId}`,
      );
    }
  }
}

function validateZoneRule(rule: ZoneEntryRule): void {
  if (!isNonEmptyString(rule.zoneId)) {
    throw new EventReconstructionError(
      `zone-entry rule "${rule.ruleId}" must declare a zoneId`,
      `zone-id:${rule.ruleId}`,
    );
  }
  const bounds = rule.bounds;
  if (!isPlainObject(bounds)) {
    throw new EventReconstructionError(
      `zone-entry rule "${rule.ruleId}" must declare bounds`,
      `bounds:${rule.ruleId}`,
    );
  }
  for (const bound of [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]) {
    if (!isFiniteNumber(bound)) {
      throw new EventReconstructionError(
        `zone-entry rule "${rule.ruleId}" bounds must be finite numbers`,
        `bounds:${rule.ruleId}`,
      );
    }
  }
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) {
    throw new EventReconstructionError(
      `zone-entry rule "${rule.ruleId}" bounds must satisfy min < max on both axes`,
      `bounds-order:${rule.ruleId}`,
    );
  }
  if (!Array.isArray(rule.watchedEntities) || rule.watchedEntities.length === 0) {
    throw new EventReconstructionError(
      `zone-entry rule "${rule.ruleId}" must declare a non-empty watchedEntities list`,
      `watched:${rule.ruleId}`,
    );
  }
  const seen = new Set<SportaId>();
  for (const entity of rule.watchedEntities) {
    if (!isNonEmptyString(entity)) {
      throw new EventReconstructionError(
        `zone-entry rule "${rule.ruleId}" watchedEntities must be non-empty strings`,
        `watched:${rule.ruleId}`,
      );
    }
    if (seen.has(entity)) {
      throw new EventReconstructionError(
        `zone-entry rule "${rule.ruleId}" watches entity "${entity}" twice`,
        `watched-duplicate:${rule.ruleId}:${entity}`,
      );
    }
    seen.add(entity);
  }
}

function insideZone(bounds: ZoneBounds, position: PerceivedPosition): boolean {
  return (
    position.x >= bounds.minX &&
    position.x <= bounds.maxX &&
    position.y >= bounds.minY &&
    position.y <= bounds.maxY
  );
}

function detectZoneEntries(
  rule: ZoneEntryRule,
  tracks: readonly CalibratedTrack[],
  domain: string,
  events: Map<SportaId, ReconstructedEvent>,
): void {
  for (const track of tracks) {
    if (!rule.watchedEntities.includes(track.entityId)) continue;
    let previous: CalibratedState | undefined;
    for (const state of track.states) {
      // A zone-entry fires only on an OBSERVED outside -> inside crossing.
      if (
        previous !== undefined &&
        !insideZone(rule.bounds, previous.position) &&
        insideZone(rule.bounds, state.position)
      ) {
        const event = buildEvent(rule.kind, rule.ruleId, domain, track, previous, state, {
          zoneId: rule.zoneId,
        });
        events.set(event.eventId, event);
      }
      previous = state;
    }
  }
}

function detectPossessionChanges(
  rule: PossessionChangeRule,
  tracks: readonly CalibratedTrack[],
  domain: string,
  events: Map<SportaId, ReconstructedEvent>,
): void {
  // Possession is a ball-state fact: the ball's ball-state track.
  const ballTrack = tracks.find(
    (track) => track.entityId === rule.ballEntityId && track.kind === "ball-state",
  );
  if (ballTrack === undefined) return; // no ball data — honestly nothing
  let previous: CalibratedState | undefined;
  for (const state of ballTrack.states) {
    if (previous !== undefined && possessionsDiffer(previous, state)) {
      const detail: PossessionChangeDetail = {};
      if (previous.possession !== undefined) detail.fromPossession = previous.possession;
      if (state.possession !== undefined) detail.toPossession = state.possession;
      const event = buildEvent(rule.kind, rule.ruleId, domain, ballTrack, previous, state, detail);
      events.set(event.eventId, event);
    }
    previous = state;
  }
}

/** Differ: equal possessions (including both absent) emit nothing. */
function possessionsDiffer(left: CalibratedState, right: CalibratedState): boolean {
  if (left.possession === undefined && right.possession === undefined) return false;
  return left.possession !== right.possession;
}

function buildEvent(
  kind: "zone-entry" | "possession-change",
  ruleId: SportaId,
  domain: string,
  track: CalibratedTrack,
  previous: CalibratedState,
  triggering: CalibratedState,
  detail: ZoneEntryDetail | PossessionChangeDetail,
): ReconstructedEvent {
  return {
    eventId: joinIdSegments(`event:${kind}`, ruleId, track.entityId, triggering.observationId),
    kind,
    ruleId,
    domain,
    entityId: track.entityId,
    capturedAt: triggering.capturedAt,
    confidence: Math.min(previous.confidence, triggering.confidence),
    sourceObservationIds: sortedUniqueIds([previous.observationId, triggering.observationId]),
    sourceFactIds: sortedUniqueIds([previous.factId, triggering.factId]),
    acquisitionIds: sortedUniqueIds([...track.acquisitionIds]),
    detail,
  };
}
