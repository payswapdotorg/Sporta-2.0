/**
 * sporta-render — the playback engine surface (work-order W5C, ADR
 * wave-5 decisions 3 + 5).
 *
 * Playback consumes ONLY render-model timelines through the typed
 * port below (the adapter invariant holds at playback: never the SWM
 * directly). The engine is a deterministic state machine — seek /
 * step / play over bounded buffers — producing per-tick frames for
 * each declared reality kind (tactical board delta; play-by-play
 * narrative segments) with the provenance + rights-scope summaries
 * carried forward read-only.
 *
 * Single public entrypoint (the entrypoint-only convention): types
 * and rules live in the domain layer and are re-exported here. This
 * surface is strictly additive to `src/domain/playback/`; the
 * render-model surface of the same package (work-order W5B) is
 * merged by the TL at integration — the port declarations below are
 * the playback seam against the render-model timeline SHAPE.
 */
export type {
  PlaybackRealityKind,
  PlaybackSourceSummary,
  PlaybackProvenanceSummary,
  PlaybackRightsScopeSummary,
  RenderTimelineEvent,
  RenderTimelinePort,
  PlaybackControllerOptions,
} from "./domain/playback/ports.js";
export { DEFAULT_TICK_MS, DEFAULT_FRAME_BUFFER_CAPACITY } from "./domain/playback/ports.js";

export type {
  IndexedTimelineEvent,
  PlaybackTimelineIndex,
  ResolvedPlaybackOptions,
} from "./domain/playback/timeline.js";
export {
  PLAYBACK_REALITY_KINDS,
  resolvePlaybackOptions,
  buildPlaybackTimelineIndex,
  destinationTickOf,
  activeEventsAtTick,
} from "./domain/playback/timeline.js";

export type { PlaybackCarryForward } from "./domain/playback/carry.js";
export { structurallyEqual } from "./domain/playback/carry.js";

export type {
  ActiveTimelineEvent,
  TacticalFrameDelta,
  TacticalRealityFrame,
  PlayByPlaySegment,
  PlayByPlayRealityFrame,
  RealityFrame,
  PlaybackFrame,
} from "./domain/playback/frames.js";
export { frameAtTick, deepFreezePlaybackValue } from "./domain/playback/frames.js";

export type { PlaybackState } from "./domain/playback/controller.js";
export { PlaybackController } from "./domain/playback/controller.js";

export {
  PlaybackError,
  EmptyTimelineError,
  MalformedTimelineEventError,
  MalformedCarryForwardError,
  UnknownRealityKindError,
  DuplicateRealityKindError,
  TimelineCarryMismatchError,
  InvalidPlaybackOptionsError,
  OutOfRangeSeekError,
  OutOfRangeStepError,
  InvalidRateError,
  InvalidStepError,
  PlaybackPausedError,
  InvalidAdvanceError,
} from "./domain/playback/errors.js";
