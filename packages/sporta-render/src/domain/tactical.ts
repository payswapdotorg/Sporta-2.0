import type {
  Confidence,
  Iso8601,
  SportsWorldModelRecord,
  SportaId,
} from "@sporta/contracts/contract";
import {
  CAPTURE_ANCHOR_SOURCE,
  attachedConfidence,
  carryForward,
  deepFreezeRenderModel,
  type SwmRenderModelBase,
} from "./renderModel.js";
import { derivedBoardPosition, TACTICAL_BOARD_HEIGHT, TACTICAL_BOARD_WIDTH } from "./board.js";
/**
 * The tactical board reality adapter (domain layer — pure, no IO).
 *
 * The per-reality projection `SportsWorldModelRecord ->
 * TacticalRenderModel`: an event-faithful 2D tactical projection —
 * spatial/structural, materially different from the textual/sequential
 * play-by-play reality. Every element is copied verbatim from the
 * snapshot or deterministically derived and labeled; every record
 * carries the source entity/event id it derives from. The board
 * geometry is renderer-owned derived layout, never a real-world
 * position claim (see SPEC.md, "Tactical board reality").
 */

/** One entity marker on the board (derived layout position). */
export interface TacticalBoardEntity {
  /** The source entity id this marker derives from. */
  readonly entityId: SportaId;
  /** Derived layout x (renderer units, renderer-owned geometry). */
  readonly x: number;
  /** Derived layout y (renderer units, renderer-owned geometry). */
  readonly y: number;
  readonly coordinateSystem: "derived-layout";
  /** Attached confidence (only when an uncertainty subject matches). */
  readonly confidence?: Confidence;
}

/** The structured board state (the spatial projection of the snapshot). */
export interface TacticalBoard {
  readonly width: number;
  readonly height: number;
  readonly coordinateSystem: "derived-layout";
  readonly entities: readonly TacticalBoardEntity[];
}

/** One event on the timeline (sequential board record with timestamps). */
export interface TacticalTimelineEvent {
  /** The source event id this record derives from. */
  readonly eventId: SportaId;
  /** 0-based index in `snapshot.events` (the record's own order). */
  readonly sequence: number;
  /** The snapshot capture anchor (the only wall-clock the record carries). */
  readonly capturedAt: Iso8601;
  readonly capturedAtSource: typeof CAPTURE_ANCHOR_SOURCE;
  /** Attached confidence (only when an uncertainty subject matches). */
  readonly confidence?: Confidence;
}

/** The event timeline of the board (events + the capture anchor). */
export interface TacticalTimeline {
  readonly anchor: Iso8601;
  readonly anchorSource: typeof CAPTURE_ANCHOR_SOURCE;
  readonly events: readonly TacticalTimelineEvent[];
}

/**
 * The tactical board render model: the structured board record + the
 * event list with timestamps. This IS the reality (the serializer
 * emits a data-class SVG document from it — honest about not being
 * pixels).
 */
export interface TacticalRenderModel extends SwmRenderModelBase {
  readonly kind: "tactical";
  readonly board: TacticalBoard;
  readonly timeline: TacticalTimeline;
}

/**
 * The tactical board adapter: pure projection
 * `SportsWorldModelRecord -> TacticalRenderModel`. Deterministic —
 * same snapshot, byte-identical model. The output is deeply frozen
 * (read-only carry-forward law). Event order is the record's own
 * order, carried as-given (no re-sort, no dedup).
 */
export function tacticalRenderModel(snapshot: SportsWorldModelRecord): TacticalRenderModel {
  const header = carryForward(snapshot);
  const anchor = snapshot.provenance.capturedAt;
  const entities: TacticalBoardEntity[] = snapshot.entities.map((entityId, index) => {
    const position = derivedBoardPosition(index, snapshot.entities.length);
    const entity: TacticalBoardEntity = {
      entityId,
      x: position.x,
      y: position.y,
      coordinateSystem: "derived-layout",
    };
    const confidence = attachedConfidence(snapshot, entityId);
    return confidence === undefined ? entity : { ...entity, confidence };
  });
  const events: TacticalTimelineEvent[] = snapshot.events.map((eventId, sequence) => {
    const event: TacticalTimelineEvent = {
      eventId,
      sequence,
      capturedAt: anchor,
      capturedAtSource: CAPTURE_ANCHOR_SOURCE,
    };
    const confidence = attachedConfidence(snapshot, eventId);
    return confidence === undefined ? event : { ...event, confidence };
  });
  const model: TacticalRenderModel = {
    ...header,
    kind: "tactical",
    board: {
      width: TACTICAL_BOARD_WIDTH,
      height: TACTICAL_BOARD_HEIGHT,
      coordinateSystem: "derived-layout",
      entities,
    },
    timeline: {
      anchor,
      anchorSource: CAPTURE_ANCHOR_SOURCE,
      events,
    },
  };
  return deepFreezeRenderModel(model);
}
