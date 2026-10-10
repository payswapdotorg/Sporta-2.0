/**
 * Per-tick reality frame projections (domain layer — pure, no IO).
 *
 * `frameAtTick` projects the tick's ACTIVE events (never invented —
 * exactly what the timelines declare) into one per-reality frame
 * record per declared reality kind (ADR wave-5, decisions 3 + 5):
 * the tactical reality gets a BOARD DELTA (declared ids/refs only —
 * geometry is the tactical render model's concern), the play-by-play
 * reality gets NARRATIVE SEGMENTS (event-anchored; phrasing is the
 * play-by-play render model's concern). Every frame carries the
 * read-only carry-forward header verbatim and is deeply frozen — the
 * read-only law is machine-checked, not only typed.
 */
import type {
  PlaybackProvenanceSummary,
  PlaybackRealityKind,
  PlaybackRightsScopeSummary,
  PlaybackSourceSummary,
} from "./ports.js";
import type { IndexedTimelineEvent, PlaybackTimelineIndex } from "./timeline.js";
import { activeEventsAtTick } from "./timeline.js";

/** An event active at a tick (kind-tagged, carried verbatim — never invented). */
export interface ActiveTimelineEvent {
  readonly kind: PlaybackRealityKind;
  readonly eventId: string;
  readonly atMs: number;
  readonly durationMs: number;
  readonly payloadRefs: readonly string[];
}

/** The tactical reality's board delta: declared ids/refs only. */
export interface TacticalFrameDelta {
  /** Sorted-unique ids of the tactical events active at the tick. */
  readonly eventIds: readonly string[];
  /** Sorted-unique payload refs of those events (entities they anchor). */
  readonly affectedEntities: readonly string[];
}

/** The tactical reality's per-tick frame record. */
export interface TacticalRealityFrame {
  readonly kind: "tactical";
  readonly tick: number;
  readonly timeMs: number;
  readonly delta: TacticalFrameDelta;
}

/** One narrative segment anchor (the event the narrative hangs on). */
export interface PlayByPlaySegment {
  readonly eventId: string;
  /** Order within the timeline's own declared order (the record's own order law). */
  readonly sequence: number;
  readonly payloadRefs: readonly string[];
}

/** The play-by-play reality's per-tick frame record. */
export interface PlayByPlayRealityFrame {
  readonly kind: "play-by-play";
  readonly tick: number;
  readonly timeMs: number;
  readonly segments: readonly PlayByPlaySegment[];
}

/** A per-reality frame record, discriminated by the kind tag. */
export type RealityFrame = TacticalRealityFrame | PlayByPlayRealityFrame;

/** The per-tick playback frame: the tick's output (SPEC "Time model"). */
export interface PlaybackFrame {
  readonly tick: number;
  readonly timeMs: number;
  /** Every event active at the tick (kind-tagged, canonical order). */
  readonly activeEvents: readonly ActiveTimelineEvent[];
  /** One frame record per declared reality kind, in declaration order. */
  readonly realities: readonly RealityFrame[];
  readonly source: PlaybackSourceSummary;
  readonly provenance: PlaybackProvenanceSummary;
  readonly rightsScope: PlaybackRightsScopeSummary;
}

/** Deep freeze a produced playback value (read-only carry-forward law). */
export function deepFreezePlaybackValue<T>(value: T): T {
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezePlaybackValue(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreezePlaybackValue((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function tacticalFrame(
  tick: number,
  timeMs: number,
  active: readonly IndexedTimelineEvent[],
): TacticalRealityFrame {
  const own = active.filter((event) => event.kind === "tactical");
  return {
    kind: "tactical",
    tick,
    timeMs,
    delta: {
      eventIds: sortedUnique(own.map((event) => event.eventId)),
      affectedEntities: sortedUnique(own.flatMap((event) => event.payloadRefs)),
    },
  };
}

function playByPlayFrame(
  tick: number,
  timeMs: number,
  active: readonly IndexedTimelineEvent[],
): PlayByPlayRealityFrame {
  const own = active
    .filter((event) => event.kind === "play-by-play")
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
  return {
    kind: "play-by-play",
    tick,
    timeMs,
    segments: own.map((event) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      payloadRefs: sortedUnique(event.payloadRefs),
    })),
  };
}

/**
 * The pure per-tick projection: active events + one frame record per
 * declared reality kind + the verbatim carry-forward header, deeply
 * frozen. Deterministic and idempotent per tick — same index + tick,
 * deep-equal frame.
 */
export function frameAtTick(index: PlaybackTimelineIndex, tick: number): PlaybackFrame {
  const active = activeEventsAtTick(index, tick);
  const timeMs = tick * index.tickMs;
  const realities: RealityFrame[] = [];
  for (const kind of index.kinds) {
    if (kind === "tactical") {
      realities.push(tacticalFrame(tick, timeMs, active));
    } else {
      realities.push(playByPlayFrame(tick, timeMs, active));
    }
  }
  const frame: PlaybackFrame = {
    tick,
    timeMs,
    activeEvents: active.map((event) => ({
      kind: event.kind,
      eventId: event.eventId,
      atMs: event.atMs,
      durationMs: event.durationMs,
      payloadRefs: [...event.payloadRefs],
    })),
    realities,
    source: { ...index.carry.source },
    provenance: { ...index.carry.provenance },
    rightsScope: {
      holders: [...index.carry.rightsScope.holders],
      usages: [...index.carry.rightsScope.usages],
      prohibitions: [...index.carry.rightsScope.prohibitions],
    },
  };
  return deepFreezePlaybackValue(frame);
}
