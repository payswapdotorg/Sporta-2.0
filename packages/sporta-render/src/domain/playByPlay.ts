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
import { phraseEvent, type PlayByPlayPhrase } from "./narrative.js";
/**
 * The play-by-play reality adapter (domain layer — pure, no IO).
 *
 * The per-reality projection `SportsWorldModelRecord ->
 * PlayByPlayRenderModel`: an event-anchored textual/sequential
 * narrative — materially different from the spatial/structural
 * tactical board reality. One record per event, in the record's own
 * event order; every phrase traceable to the event id it derives
 * from; zero invented facts (see SPEC.md, "Play-by-play reality").
 */

/** One sequential narrative record of the commentary. */
export interface PlayByPlayRecord {
  /** The source event id this record derives from. */
  readonly eventId: SportaId;
  /** 0-based index in `snapshot.events` (the record's own order). */
  readonly sequence: number;
  /** The snapshot capture anchor (the only wall-clock the record carries). */
  readonly capturedAt: Iso8601;
  readonly capturedAtSource: typeof CAPTURE_ANCHOR_SOURCE;
  /** Attached confidence (only when an uncertainty subject matches). */
  readonly confidence?: Confidence;
  /** The phrases this record's event produced (ordered rules). */
  readonly phrases: readonly PlayByPlayPhrase[];
}

/**
 * The play-by-play render model: the event-anchored sequential
 * narrative projection of the snapshot.
 */
export interface PlayByPlayRenderModel extends SwmRenderModelBase {
  readonly kind: "play-by-play";
  readonly records: readonly PlayByPlayRecord[];
}

/**
 * The play-by-play adapter: pure projection
 * `SportsWorldModelRecord -> PlayByPlayRenderModel`. Deterministic —
 * same snapshot, byte-identical model. The output is deeply frozen
 * (read-only carry-forward law). Event order is the record's own
 * order, carried as-given (no re-sort, no dedup).
 */
export function playByPlayRenderModel(snapshot: SportsWorldModelRecord): PlayByPlayRenderModel {
  const header = carryForward(snapshot);
  const anchor = snapshot.provenance.capturedAt;
  const total = snapshot.events.length;
  const records: PlayByPlayRecord[] = snapshot.events.map((eventId, sequence) => {
    const confidence = attachedConfidence(snapshot, eventId);
    const phrases = phraseEvent({
      eventId,
      sequence,
      total,
      domain: snapshot.domain,
      capturedAt: anchor,
      ...(confidence === undefined ? {} : { confidence }),
    });
    const record: PlayByPlayRecord = {
      eventId,
      sequence,
      capturedAt: anchor,
      capturedAtSource: CAPTURE_ANCHOR_SOURCE,
      phrases,
    };
    return confidence === undefined ? record : { ...record, confidence };
  });
  const model: PlayByPlayRenderModel = {
    ...header,
    kind: "play-by-play",
    records,
  };
  return deepFreezeRenderModel(model);
}

/**
 * Deterministic transcript read over the model (never a second source
 * of truth): one line per record — the record's phrases joined by a
 * single space.
 */
export function playByPlayTranscript(model: PlayByPlayRenderModel): string {
  return model.records
    .map((record) => record.phrases.map((phrase) => phrase.text).join(" "))
    .join("\n");
}
