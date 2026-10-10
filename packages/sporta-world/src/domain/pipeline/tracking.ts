import type { Confidence, Iso8601, SportaId } from "@sporta/contracts/contract";
import { isValidConfidence, sortedUniqueIds } from "../snapshot.js";
import type { PerceivedFact } from "./perception.js";
import { TrackingError } from "./errors.js";
import type { PerceptionFactKind, PerceivedPosition } from "./provenance.js";
import { isFiniteNumber } from "./provenance.js";

/**
 * Stage 4 — tracking (domain layer — pure).
 *
 * Entity continuity across observations. Identity association is by
 * DECLARED keys ONLY (the (entityId, kind) the perception rule
 * declared) — positional proximity is NEVER used to associate identity
 * (that would be guessing). Continuity gaps beyond the declared budget
 * are RECORDED as typed gap records, never interpolated: no state is
 * invented between observations. Confidence is min over member states,
 * further narrowed by the declared gap ceiling when gaps exist — carry
 * or lower only.
 */

/** Declared tracking parameters (the continuity budget is required). */
export interface TrackingParams {
  /** Positive finite continuity budget in milliseconds. */
  maxGapMs: number;
  /** Declared ceiling applied (by min) to tracks whose continuity broke. */
  gapConfidenceCeiling?: Confidence;
}

/** One tracked state — a perceived fact slotted into its entity's track. */
export interface TrackedState {
  factId: SportaId;
  observationId: SportaId;
  mediaRef: SportaId;
  position: PerceivedPosition;
  possession?: SportaId;
  capturedAt: Iso8601;
  confidence: Confidence;
}

/** A recorded continuity gap (never interpolated). */
export interface TrackGap {
  fromCapturedAt: Iso8601;
  toCapturedAt: Iso8601;
  gapMs: number;
}

/** Entity continuity across observations — identity by declared keys. */
export interface EntityTrack {
  /** Deterministic: `track:<kind>:<entityId>`. */
  trackId: SportaId;
  entityId: SportaId;
  kind: PerceptionFactKind;
  /** Ordered by capturedAt (ties broken by factId). */
  states: readonly TrackedState[];
  gaps: readonly TrackGap[];
  /** min over member states (and the gap ceiling when gaps exist). */
  confidence: Confidence;
  /** Sorted unique authorized-chain citations. */
  acquisitionIds: readonly SportaId[];
}

interface FactGroup {
  entityId: SportaId;
  kind: PerceptionFactKind;
  facts: PerceivedFact[];
}

/**
 * Track a batch of perceived facts. Tracks are sorted by trackId; the
 * params are validated even when the batch is empty (the continuity
 * budget is part of the pipeline's declared law).
 */
export function trackEntities(
  facts: readonly PerceivedFact[],
  params: TrackingParams,
): EntityTrack[] {
  if (
    params === null ||
    typeof params !== "object" ||
    !isFiniteNumber(params.maxGapMs) ||
    params.maxGapMs <= 0
  ) {
    throw new TrackingError(
      `maxGapMs must be a positive finite number (got ${String(params?.maxGapMs)})`,
      `max-gap-ms:${String(params?.maxGapMs)}`,
    );
  }
  if (
    params.gapConfidenceCeiling !== undefined &&
    !isValidConfidence(params.gapConfidenceCeiling)
  ) {
    throw new TrackingError(
      `gapConfidenceCeiling ${params.gapConfidenceCeiling} is outside [0, 1]`,
      `gap-ceiling:${params.gapConfidenceCeiling}`,
    );
  }
  if (facts.length === 0) return [];
  // Identity association by DECLARED keys only: group by (kind, entityId).
  const groups = new Map<string, FactGroup>();
  const seenFactIds = new Set<SportaId>(); // dedup by factId
  for (const fact of facts) {
    if (seenFactIds.has(fact.factId)) continue;
    seenFactIds.add(fact.factId);
    const key = `${fact.kind}:${fact.entityId}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { entityId: fact.entityId, kind: fact.kind, facts: [fact] });
    } else {
      existing.facts.push(fact);
    }
  }
  const tracks: EntityTrack[] = [];
  for (const group of groups.values()) {
    tracks.push(buildTrack(group, params));
  }
  return tracks.sort((left, right) =>
    left.trackId < right.trackId ? -1 : left.trackId > right.trackId ? 1 : 0,
  );
}

function buildTrack(group: FactGroup, params: TrackingParams): EntityTrack {
  const states = group.facts
    .map((fact) => toTrackedState(fact))
    .sort((left, right) => {
      const leftTime = Date.parse(left.capturedAt);
      const rightTime = Date.parse(right.capturedAt);
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0;
    });
  const gaps: TrackGap[] = [];
  let confidence: Confidence = 1;
  let previous: TrackedState | undefined;
  for (const state of states) {
    confidence = Math.min(confidence, state.confidence);
    if (previous !== undefined) {
      const delta = Date.parse(state.capturedAt) - Date.parse(previous.capturedAt);
      // A gap is RECORDED, never interpolated.
      if (delta > params.maxGapMs) {
        gaps.push({
          fromCapturedAt: previous.capturedAt,
          toCapturedAt: state.capturedAt,
          gapMs: delta,
        });
      }
    }
    previous = state;
  }
  if (gaps.length > 0 && params.gapConfidenceCeiling !== undefined) {
    confidence = Math.min(confidence, params.gapConfidenceCeiling);
  }
  return {
    trackId: `track:${group.kind}:${group.entityId}`,
    entityId: group.entityId,
    kind: group.kind,
    states,
    gaps,
    confidence,
    acquisitionIds: sortedUniqueIds(group.facts.flatMap((fact) => [...fact.acquisitionIds])),
  };
}

function toTrackedState(fact: PerceivedFact): TrackedState {
  const state: TrackedState = {
    factId: fact.factId,
    observationId: fact.observationId,
    mediaRef: fact.mediaRef,
    position: { ...fact.position },
    capturedAt: fact.capturedAt,
    confidence: fact.confidence,
  };
  if (fact.possession !== undefined) state.possession = fact.possession;
  return state;
}
