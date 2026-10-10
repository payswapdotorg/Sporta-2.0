/**
 * Timeline validation + the merged playback index (domain layer — pure, no IO).
 *
 * The index is built ONCE per controller construction and is
 * input-sized (O(declared events)) — the bounded-memory law. It never
 * grows afterwards: per-tick projections allocate only the
 * active-event window. Validation precedes mutation: a refused
 * construction leaves no trace.
 */
import {
  DuplicateRealityKindError,
  EmptyTimelineError,
  InvalidPlaybackOptionsError,
  MalformedCarryForwardError,
  MalformedTimelineEventError,
  TimelineCarryMismatchError,
  UnknownRealityKindError,
} from "./errors.js";
import {
  copyCarryForward,
  structurallyEqual,
  validateCarryForward,
  type PlaybackCarryForward,
} from "./carry.js";
import {
  DEFAULT_FRAME_BUFFER_CAPACITY,
  DEFAULT_TICK_MS,
  type PlaybackControllerOptions,
  type PlaybackRealityKind,
  type RenderTimelinePort,
} from "./ports.js";

/** The runtime vocabulary of the v1 reality kinds (closed; additive extension law). */
export const PLAYBACK_REALITY_KINDS: readonly PlaybackRealityKind[] = ["tactical", "play-by-play"];

/** One validated merged event (an index entry). */
export interface IndexedTimelineEvent {
  readonly kind: PlaybackRealityKind;
  readonly eventId: string;
  readonly atMs: number;
  readonly durationMs: number;
  readonly endMs: number;
  /** Order within its own timeline (the record's own declared order). */
  readonly sequence: number;
  readonly payloadRefs: readonly string[];
}

/** The validated merged timeline index (built once; input-sized). */
export interface PlaybackTimelineIndex {
  readonly tickMs: number;
  readonly defaultEventDurationMs: number;
  readonly frameBufferCapacity: number;
  readonly kinds: readonly PlaybackRealityKind[];
  readonly events: readonly IndexedTimelineEvent[];
  readonly durationMs: number;
  readonly totalTicks: number;
  readonly carry: PlaybackCarryForward;
}

/** Resolved (validated) controller options. */
export interface ResolvedPlaybackOptions {
  readonly tickMs: number;
  readonly defaultEventDurationMs: number;
  readonly frameBufferCapacity: number;
}

/** Resolves + validates controller options (defaults: tickMs 1000, capacity 64, duration = tickMs). */
export function resolvePlaybackOptions(
  options: PlaybackControllerOptions = {},
): ResolvedPlaybackOptions {
  const { tickMs, frameBufferCapacity, defaultEventDurationMs } = options;
  if (tickMs !== undefined && (!Number.isFinite(tickMs) || tickMs <= 0)) {
    throw new InvalidPlaybackOptionsError(
      `tickMs must be a finite number > 0 (got ${String(tickMs)})`,
      `tickMs:${String(tickMs)}`,
    );
  }
  if (
    frameBufferCapacity !== undefined &&
    (!Number.isInteger(frameBufferCapacity) || frameBufferCapacity <= 0)
  ) {
    throw new InvalidPlaybackOptionsError(
      `frameBufferCapacity must be an integer > 0 (got ${String(frameBufferCapacity)})`,
      `frameBufferCapacity:${String(frameBufferCapacity)}`,
    );
  }
  if (
    defaultEventDurationMs !== undefined &&
    (!Number.isFinite(defaultEventDurationMs) || defaultEventDurationMs <= 0)
  ) {
    throw new InvalidPlaybackOptionsError(
      `defaultEventDurationMs must be a finite number > 0 (got ${String(defaultEventDurationMs)})`,
      `defaultEventDurationMs:${String(defaultEventDurationMs)}`,
    );
  }
  const resolvedTickMs = tickMs ?? DEFAULT_TICK_MS;
  return {
    tickMs: resolvedTickMs,
    defaultEventDurationMs: defaultEventDurationMs ?? resolvedTickMs,
    frameBufferCapacity: frameBufferCapacity ?? DEFAULT_FRAME_BUFFER_CAPACITY,
  };
}

function malformedEvent(
  kind: string,
  eventAt: string,
  reason: string,
): MalformedTimelineEventError {
  return new MalformedTimelineEventError(
    `event ${eventAt} of the "${kind}" timeline is malformed: ${reason}`,
    `${kind}:${eventAt}:${reason}`,
  );
}

function validateTimelineEvents(
  timeline: RenderTimelinePort,
  defaultEventDurationMs: number,
): IndexedTimelineEvent[] {
  const { kind, events } = timeline;
  if (!Array.isArray(events) || events.length === 0) {
    throw new EmptyTimelineError(`the "${kind}" timeline declares no events`, `kind:${kind}`);
  }
  const seen = new Set<string>();
  const indexed: IndexedTimelineEvent[] = [];
  for (let sequence = 0; sequence < events.length; sequence += 1) {
    const event = events[sequence];
    const eventAt = `#${sequence}`;
    if (event === null || typeof event !== "object") {
      throw malformedEvent(kind, eventAt, "not an event object");
    }
    const { eventId, atMs, durationMs, payloadRefs } = event;
    if (typeof eventId !== "string" || eventId.length === 0) {
      throw malformedEvent(kind, eventAt, "eventId must be a non-empty string");
    }
    if (seen.has(eventId)) {
      throw malformedEvent(kind, eventAt, `duplicate eventId "${eventId}" within one timeline`);
    }
    seen.add(eventId);
    if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) {
      throw malformedEvent(
        kind,
        eventAt,
        `atMs must be a finite number >= 0 (got ${String(atMs)})`,
      );
    }
    if (
      durationMs !== undefined &&
      (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0)
    ) {
      throw malformedEvent(
        kind,
        eventAt,
        `durationMs must be a finite number > 0 (got ${String(durationMs)})`,
      );
    }
    if (payloadRefs !== undefined && !Array.isArray(payloadRefs)) {
      throw malformedEvent(kind, eventAt, "payloadRefs must be an array");
    }
    if (payloadRefs !== undefined) {
      for (const ref of payloadRefs) {
        if (typeof ref !== "string" || ref.length === 0) {
          throw malformedEvent(kind, eventAt, "payloadRefs contains a non-string/empty entry");
        }
      }
    }
    const effectiveDuration = durationMs ?? defaultEventDurationMs;
    indexed.push({
      kind,
      eventId,
      atMs,
      durationMs: effectiveDuration,
      endMs: atMs + effectiveDuration,
      sequence,
      payloadRefs: payloadRefs === undefined ? [] : [...payloadRefs],
    });
  }
  return indexed;
}

/**
 * Builds the merged, validated playback index. Laws enforced here:
 * the v1 kind vocabulary; one timeline per kind; non-empty timelines;
 * well-formed events (unique ids per timeline); deep-equal
 * carry-forward headers across timelines (one session = one
 * snapshot's realities); canonical merged order (atMs, then kind
 * declaration order, then eventId).
 */
export function buildPlaybackTimelineIndex(
  timelines: readonly RenderTimelinePort[],
  resolved: ResolvedPlaybackOptions,
): PlaybackTimelineIndex {
  if (!Array.isArray(timelines)) {
    throw new EmptyTimelineError("no render-model timelines were provided", "not-an-array");
  }
  if (timelines.length === 0) {
    throw new EmptyTimelineError("no render-model timelines were provided", "no-timelines");
  }
  // Array.isArray's any[] predicate would degrade the element type; re-establish it.
  const declaredTimelines: readonly RenderTimelinePort[] = timelines;
  const kinds: PlaybackRealityKind[] = [];
  const kindRank = new Map<string, number>();
  let carry: PlaybackCarryForward | undefined;
  let merged: IndexedTimelineEvent[] = [];
  for (let position = 0; position < declaredTimelines.length; position += 1) {
    const timeline = declaredTimelines[position];
    if (timeline === null || typeof timeline !== "object") {
      throw new MalformedCarryForwardError(
        `timeline #${position} is not a timeline object`,
        `position:${position}`,
      );
    }
    const { kind } = timeline;
    if (typeof kind !== "string" || !PLAYBACK_REALITY_KINDS.includes(kind as PlaybackRealityKind)) {
      throw new UnknownRealityKindError(
        `timeline #${position} declares unknown reality kind "${String(kind)}"`,
        `position:${position}:${String(kind)}`,
      );
    }
    const realityKind: PlaybackRealityKind = kind;
    if (kindRank.has(realityKind)) {
      throw new DuplicateRealityKindError(
        `the reality kind "${realityKind}" is declared by more than one timeline`,
        `kind:${realityKind}`,
      );
    }
    kindRank.set(realityKind, kinds.length);
    kinds.push(realityKind);
    validateCarryForward(timeline);
    const timelineCarry = copyCarryForward(timeline);
    if (carry === undefined) {
      carry = timelineCarry;
    } else if (!structurallyEqual(carry, timelineCarry)) {
      throw new TimelineCarryMismatchError(
        `the "${kind}" timeline's carry-forward header disagrees with the first timeline's (one playback session = one snapshot's realities)`,
        `kind:${kind}`,
      );
    }
    merged = merged.concat(validateTimelineEvents(timeline, resolved.defaultEventDurationMs));
  }
  merged.sort((a, b) => {
    if (a.atMs !== b.atMs) return a.atMs < b.atMs ? -1 : 1;
    const rankA = kindRank.get(a.kind) ?? 0;
    const rankB = kindRank.get(b.kind) ?? 0;
    if (rankA !== rankB) return rankA - rankB;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });
  let durationMs = 0;
  for (const event of merged) {
    if (event.endMs > durationMs) durationMs = event.endMs;
  }
  return {
    tickMs: resolved.tickMs,
    defaultEventDurationMs: resolved.defaultEventDurationMs,
    frameBufferCapacity: resolved.frameBufferCapacity,
    kinds,
    events: merged,
    durationMs,
    totalTicks: Math.ceil(durationMs / resolved.tickMs),
    carry: carry as PlaybackCarryForward,
  };
}

/** The destination tick of a time T: min(floor(T / tickMs), totalTicks - 1). */
export function destinationTickOf(index: PlaybackTimelineIndex, timeMs: number): number {
  const tick = Math.floor(timeMs / index.tickMs);
  return tick > index.totalTicks - 1 ? index.totalTicks - 1 : tick;
}

/** First index in the canonically ordered events whose atMs >= bound (binary search). */
function lowerBoundAtMs(events: readonly IndexedTimelineEvent[], boundMs: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    const atMs = events[mid]?.atMs ?? 0;
    if (atMs < boundMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The events active at tick t (half-open intersection law, SPEC "Time
 * model"), in canonical order. Binary-searched prefix + bounded scan:
 * O(declared events) worst case, allocating only the active window.
 */
export function activeEventsAtTick(
  index: PlaybackTimelineIndex,
  tick: number,
): readonly IndexedTimelineEvent[] {
  const tickStart = tick * index.tickMs;
  const tickEnd = tickStart + index.tickMs;
  const limit = lowerBoundAtMs(index.events, tickEnd);
  const active: IndexedTimelineEvent[] = [];
  for (let i = 0; i < limit; i += 1) {
    const event = index.events[i];
    if (event !== undefined && event.endMs > tickStart) active.push(event);
  }
  return active;
}
