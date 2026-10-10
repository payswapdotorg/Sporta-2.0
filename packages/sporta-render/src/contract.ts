/**
 * sporta-render — the renderer adapter boundary + two materially
 * different sports production realities (ADR wave-5, decisions 2 + 5).
 *
 * Renderers NEVER consume `SportsWorldModelRecord` directly (the SWM
 * invariant): they consume per-reality render models derived by the
 * pure adapters below. Both realities share the same read-only
 * carry-forward header (provenance + rights-scope summaries —
 * renderers never widen rights); the tactical reality is
 * spatial/structural (board + timeline), the play-by-play reality is
 * textual/sequential (event-anchored narrative records).
 *
 * Single public entrypoint (the entrypoint-only convention): types and
 * rules live in the domain layer and are re-exported here; the
 * app-layer composition and the adapters-layer SVG serializer follow
 * the kdenliveXml.ts precedent (external document formats live in
 * adapters).
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
