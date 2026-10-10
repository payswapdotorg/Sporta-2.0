import type { SportsWorldModelRecord } from "@sporta/contracts/contract";
import type { ObservationInput, WorldHashFn, WorldModelPort } from "../ports.js";
import { acquireSources } from "./acquisition.js";
import type { AcquisitionManifest, AcquisitionRecord } from "./acquisition.js";
import { calibrateTracks } from "./calibration.js";
import type { CalibrationParams, CalibratedTrack } from "./calibration.js";
import { reconstructEvents } from "./eventReconstruction.js";
import type { EventReconstructionRule, ReconstructedEvent } from "./eventReconstruction.js";
import { PipelineCompositionError } from "./errors.js";
import { normalizeObservations } from "./normalization.js";
import type { NormalizedObservation, RawObservation } from "./normalization.js";
import { perceiveObservations } from "./perception.js";
import type { PerceivedFact, PerceptionRule } from "./perception.js";
import { canonicalJson, isPlainObject } from "./provenance.js";
import { trackEntities } from "./tracking.js";
import type { EntityTrack, TrackingParams } from "./tracking.js";

/**
 * Composition (W5A-2) — the pure end-to-end chain.
 *
 * acquisition manifest -> (stages) -> normalized + reconstructed
 * observations -> the EXISTING `ingestObservations` boundary ->
 * SportsWorldModelRecord.
 *
 * All-or-nothing is STRUCTURAL: every stage is pure, so a failure at
 * ANY stage throws before `ingestObservations` is ever called — zero
 * ingestion side effects. No partial-acceptance path exists.
 */

/** The complete pipeline plan: one authorized manifest + raws + declared rules. */
export interface PipelinePlan {
  manifest: AcquisitionManifest;
  raws: readonly RawObservation[];
  /** Absent = the perception stage contributes nothing. */
  perceptionRules?: readonly PerceptionRule[];
  /** REQUIRED — the continuity budget (validated even with no facts). */
  tracking: TrackingParams;
  /** Absent = both calibration dimensions carry unchanged. */
  calibration?: CalibrationParams;
  /** Absent = the event stage contributes nothing. */
  eventRules?: readonly EventReconstructionRule[];
}

/** Injected seams (the sha-256 helper stays adapters-owned). */
export interface PipelineSeams {
  hash: WorldHashFn;
}

/** Every stage's typed records plus the planned seam observations. */
export interface PipelineResult {
  acquisition: readonly AcquisitionRecord[];
  normalized: readonly NormalizedObservation[];
  facts: readonly PerceivedFact[];
  tracks: readonly EntityTrack[];
  calibratedTracks: readonly CalibratedTrack[];
  events: readonly ReconstructedEvent[];
  /** Exactly what the frozen seam accepts (its own vocabulary). */
  plannedObservations: readonly ObservationInput[];
}

/**
 * Evaluate the whole chain PURELY: manifest -> acquisition ->
 * normalization -> perception -> tracking -> calibration -> event
 * reconstruction -> planned observations. No ingestion side effect.
 */
export function planPipelineObservations(plan: PipelinePlan, seams: PipelineSeams): PipelineResult {
  if (!isPlainObject(plan)) {
    throw new PipelineCompositionError("the pipeline plan is missing", "plan");
  }
  if (!isPlainObject(plan.manifest)) {
    throw new PipelineCompositionError("the plan carries no acquisition manifest", "manifest");
  }
  if (!Array.isArray(plan.raws) || plan.raws.length === 0) {
    throw new PipelineCompositionError(
      "the plan carries an empty raw observation batch (the seam refuses empty batches; so does the composition)",
      "empty-raws",
    );
  }
  const [acquisition] = acquireSources([plan.manifest]);
  if (acquisition === undefined) {
    throw new PipelineCompositionError("unreachable: acquisition produced no record", "internal");
  }
  const normalized = normalizeObservations(acquisition, plan.raws, { hash: seams.hash });
  const facts =
    plan.perceptionRules === undefined
      ? []
      : perceiveObservations(normalized, plan.perceptionRules);
  const tracks = trackEntities(facts, plan.tracking);
  const calibratedTracks = calibrateTracks(tracks, plan.calibration ?? {});
  const events =
    plan.eventRules === undefined
      ? []
      : reconstructEvents(calibratedTracks, plan.eventRules, acquisition.chain.domain);
  const eventObservations = events.map((event) => eventObservation(event, acquisition, seams));
  const plannedObservations: ObservationInput[] = [
    ...normalized.map((entry) => entry.observation),
    ...eventObservations,
  ];
  return {
    acquisition: [acquisition],
    normalized,
    facts,
    tracks,
    calibratedTracks,
    events,
    plannedObservations,
  };
}

/**
 * Run the whole chain and ingest the planned observations through the
 * EXISTING `ingestObservations` boundary (unchanged seam). Any stage
 * failure throws before the boundary is called (all-or-nothing,
 * structural); the seam's own all-or-nothing semantics then govern the
 * single ingestion call.
 */
export async function runPipeline(
  world: WorldModelPort,
  plan: PipelinePlan,
  seams: PipelineSeams,
): Promise<SportsWorldModelRecord> {
  const result = planPipelineObservations(plan, seams);
  return world.ingestObservations(result.plannedObservations);
}

/**
 * One observation per reconstructed event: deterministic
 * `obs:<eventId>` id (idempotent pipeline retries), payload hash over
 * the canonical event detail INCLUDING its source observation ids,
 * provenance minted from the authorized chain, min-carried confidence.
 */
function eventObservation(
  event: ReconstructedEvent,
  acquisition: AcquisitionRecord,
  seams: PipelineSeams,
): ObservationInput {
  const payload = {
    eventId: event.eventId,
    kind: event.kind,
    ruleId: event.ruleId,
    domain: event.domain,
    entityId: event.entityId,
    capturedAt: event.capturedAt,
    confidence: event.confidence,
    detail: event.detail,
    sourceFactIds: [...event.sourceFactIds],
    sourceObservationIds: [...event.sourceObservationIds],
  };
  return {
    observationId: `obs:${event.eventId}`,
    domain: event.domain,
    payloadHash: seams.hash(canonicalJson(payload)),
    capturedAt: event.capturedAt,
    confidence: event.confidence,
    provenance: {
      sourceKind: acquisition.chain.sourceKind,
      sourceRef: acquisition.chain.sourceRef,
      capturedAt: event.capturedAt,
      confidence: event.confidence,
    },
    entityRefs: [event.entityId],
    eventRefs: [event.eventId],
    policy: acquisition.policy,
  };
}
