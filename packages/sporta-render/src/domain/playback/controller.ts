/**
 * The playback controller (domain layer — pure state machine, no IO).
 *
 * Deterministic seek/step/play over the merged timeline index with a
 * capacity-bounded retained frame history (the buffer laws, SPEC
 * "Buffer laws"): the controller's entire retained state is one
 * playhead time, one rate, the bounded frame buffer and the
 * input-sized index. Time is always a declarative argument — no
 * wall-clock, no RNG, no ambient ordering.
 */
import {
  InvalidAdvanceError,
  InvalidRateError,
  InvalidStepError,
  OutOfRangeSeekError,
  OutOfRangeStepError,
  PlaybackPausedError,
} from "./errors.js";
import { deepFreezePlaybackValue, frameAtTick, type PlaybackFrame } from "./frames.js";
import type {
  PlaybackControllerOptions,
  PlaybackRealityKind,
  RenderTimelinePort,
} from "./ports.js";
import {
  buildPlaybackTimelineIndex,
  destinationTickOf,
  resolvePlaybackOptions,
  type PlaybackTimelineIndex,
} from "./timeline.js";

/** Frozen controller state snapshot (the single observable state). */
export interface PlaybackState {
  readonly playheadMs: number;
  readonly cursorTick: number;
  readonly tickMs: number;
  readonly defaultEventDurationMs: number;
  readonly frameBufferCapacity: number;
  readonly rate: number;
  readonly playing: boolean;
  readonly atEnd: boolean;
  readonly totalTicks: number;
  readonly durationMs: number;
  readonly kinds: readonly PlaybackRealityKind[];
}

/** The playback controller: a deterministic session over render-model timelines. */
export class PlaybackController {
  readonly #index: PlaybackTimelineIndex;
  #playheadMs: number;
  #rate: number;
  #buffer: PlaybackFrame[];

  constructor(timelines: readonly RenderTimelinePort[], options: PlaybackControllerOptions = {}) {
    this.#index = buildPlaybackTimelineIndex(timelines, resolvePlaybackOptions(options));
    this.#playheadMs = 0;
    this.#rate = 0;
    this.#buffer = [];
    this.#emit(frameAtTick(this.#index, 0));
  }

  /** The frozen session state (playhead, rate, bounds, declared kinds). */
  get state(): PlaybackState {
    return deepFreezePlaybackValue({
      playheadMs: this.#playheadMs,
      cursorTick: destinationTickOf(this.#index, this.#playheadMs),
      tickMs: this.#index.tickMs,
      defaultEventDurationMs: this.#index.defaultEventDurationMs,
      frameBufferCapacity: this.#index.frameBufferCapacity,
      rate: this.#rate,
      playing: this.#rate > 0,
      atEnd: this.#playheadMs >= this.#index.durationMs,
      totalTicks: this.#index.totalTicks,
      durationMs: this.#index.durationMs,
      kinds: [...this.#index.kinds],
    });
  }

  /** Pure projection of the frame at timeMs's destination tick (idempotent per t). */
  frameAt(timeMs: number): PlaybackFrame {
    this.#requireInRange(timeMs, "frameAt");
    return frameAtTick(this.#index, destinationTickOf(this.#index, timeMs));
  }

  /** Moves the playhead to timeMs; emits + returns the destination frame. */
  seek(timeMs: number): PlaybackFrame {
    this.#requireInRange(timeMs, "seek");
    this.#playheadMs = timeMs;
    const frame = frameAtTick(this.#index, destinationTickOf(this.#index, timeMs));
    this.#emit(frame);
    return frame;
  }

  /** Moves the playhead by whole ticks (tick-quantized); emits + returns the destination frame. */
  step(deltaTicks: number): PlaybackFrame {
    if (!Number.isInteger(deltaTicks)) {
      throw new InvalidStepError(
        `step delta must be a finite integer (got ${String(deltaTicks)})`,
        `delta:${String(deltaTicks)}`,
      );
    }
    const destination = destinationTickOf(this.#index, this.#playheadMs) + deltaTicks;
    if (destination < 0 || destination > this.#index.totalTicks - 1) {
      throw new OutOfRangeStepError(
        `step(${deltaTicks}) lands on tick ${destination}, outside 0..${this.#index.totalTicks - 1}`,
        `delta:${deltaTicks}:destination:${destination}:bounds:0:${this.#index.totalTicks - 1}`,
      );
    }
    this.#playheadMs = destination * this.#index.tickMs;
    const frame = frameAtTick(this.#index, destination);
    this.#emit(frame);
    return frame;
  }

  /** Sets the playback rate (finite, > 0). */
  play(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new InvalidRateError(
        `playback rate must be a finite number > 0 (got ${String(rate)})`,
        `rate:${String(rate)}`,
      );
    }
    this.#rate = rate;
  }

  /** Pauses playback (rate cleared; the playhead is kept). */
  pause(): void {
    this.#rate = 0;
  }

  /**
   * Advances by dtMs of caller time at the current rate. Emits ONE
   * frame per tick crossed (the starting tick is not re-emitted),
   * each into the bounded buffer; returns the emitted frames as a
   * caller-owned transient (batch size is the caller's choice — the
   * controller retains only the capacity-bounded tail). Sub-tick
   * advances accumulate in the playhead. End-of-timeline is a normal
   * stop: the playhead rests at the duration and playback pauses.
   */
  advance(dtMs: number): readonly PlaybackFrame[] {
    if (this.#rate <= 0) {
      throw new PlaybackPausedError(
        "advance requires playback to be playing (call play(rate) first)",
        `rate:${this.#rate}`,
      );
    }
    if (!Number.isFinite(dtMs) || dtMs < 0) {
      throw new InvalidAdvanceError(
        `advance dt must be a finite number >= 0 (got ${String(dtMs)})`,
        `dtMs:${String(dtMs)}`,
      );
    }
    const target = Math.min(this.#playheadMs + dtMs * this.#rate, this.#index.durationMs);
    const fromTick = destinationTickOf(this.#index, this.#playheadMs);
    const toTick = destinationTickOf(this.#index, target);
    const emitted: PlaybackFrame[] = [];
    for (let tick = fromTick + 1; tick <= toTick; tick += 1) {
      const frame = frameAtTick(this.#index, tick);
      this.#emit(frame);
      emitted.push(frame);
    }
    this.#playheadMs = target;
    if (this.#playheadMs >= this.#index.durationMs) this.#rate = 0;
    return Object.freeze(emitted);
  }

  /** A frozen copy of the retained frame buffer (oldest -> newest), capacity-bounded. */
  recentFrames(): readonly PlaybackFrame[] {
    return Object.freeze([...this.#buffer]);
  }

  #requireInRange(timeMs: number, operation: string): void {
    if (
      typeof timeMs !== "number" ||
      !Number.isFinite(timeMs) ||
      timeMs < 0 ||
      timeMs > this.#index.durationMs
    ) {
      throw new OutOfRangeSeekError(
        `${operation} target ${String(timeMs)} is outside the timeline [0, ${this.#index.durationMs}]`,
        `operation:${operation}:target:${String(timeMs)}:duration:${this.#index.durationMs}`,
      );
    }
  }

  #emit(frame: PlaybackFrame): void {
    this.#buffer.push(frame);
    const capacity = this.#index.frameBufferCapacity;
    if (this.#buffer.length > capacity) {
      this.#buffer.splice(0, this.#buffer.length - capacity);
    }
  }
}
