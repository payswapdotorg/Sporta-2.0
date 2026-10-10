/**
 * sporta-render — the renderer adapter boundary + two materially
 * different sports production realities (ADR wave-5, decisions 2 + 5)
 * + the playback engine surface (work-order W5C, ADR wave-5
 * decisions 3 + 5; TL union of the two additive lanes).
 *
 * Renderers NEVER consume `SportsWorldModelRecord` directly (the SWM
 * invariant): they consume per-reality render models derived by the
 * pure adapters below. Both realities share the same read-only
 * carry-forward header (provenance + rights-scope summaries —
 * renderers never widen rights); the tactical reality is
 * spatial/structural (board + timeline), the play-by-play reality is
 * textual/sequential (event-anchored narrative records).
 *
 * Playback consumes ONLY render-model timelines through the typed
 * port below (the adapter invariant holds at playback: never the SWM
 * directly). The engine is a deterministic state machine — seek /
 * step / play over bounded buffers — producing per-tick frames for
 * each declared reality kind with the provenance + rights-scope
 * summaries carried forward read-only.
 *
 * Single public entrypoint (the entrypoint-only convention): types and
 * rules live in the domain layer and are re-exported here; the
 * app-layer composition and the adapters-layer SVG serializer follow
 * the kdenliveXml.ts precedent (external document formats live in
 * adapters). The playback surface is strictly additive under
 * `src/domain/playback/`; the render-model surface of the same
 * package (work-order W5B) and the playback surface (work-order W5C)
 * were merged by the TL at integration — conflict-free by
 * construction.
 */
export type {
  RealityKind,
  RenderModelSource,
  ObservationEvidence,
  RightsScopeSummary,
  SwmRenderModelBase,
} from "./domain/renderModel.js";

export type {
  TacticalBoardEntity,
  TacticalBoard,
  TacticalTimelineEvent,
  TacticalTimeline,
  TacticalRenderModel,
} from "./domain/tactical.js";
export { tacticalRenderModel } from "./domain/tactical.js";

export type { PlayByPlayRecord, PlayByPlayRenderModel } from "./domain/playByPlay.js";
export { playByPlayRenderModel, playByPlayTranscript } from "./domain/playByPlay.js";

export type {
  NarrativeEventFacts,
  PlayByPlayPhrase,
  NarrativeTemplateId,
} from "./domain/narrative.js";
export { phraseEvent } from "./domain/narrative.js";

export type { BoardPosition } from "./domain/board.js";
export {
  TACTICAL_BOARD_WIDTH,
  TACTICAL_BOARD_HEIGHT,
  TACTICAL_BOARD_MARGIN,
  boardColumns,
  derivedBoardPosition,
} from "./domain/board.js";

export type { RenderUsageContext } from "./domain/usage.js";
export { swmRenderableUnder } from "./domain/usage.js";

export { CAPTURE_ANCHOR_SOURCE } from "./domain/renderModel.js";

export { RenderModelError, RenderInputError, RenderRightsRefusalError } from "./domain/errors.js";

export type { RealityProjection } from "./app/realityProjection.js";
export { RealityProjectionService } from "./app/realityProjection.js";

export { serializeTacticalSvg, TACTICAL_TIMELINE_STRIP_HEIGHT } from "./adapters/tacticalSvg.js";

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
