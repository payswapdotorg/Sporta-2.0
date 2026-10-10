import type {
  Confidence,
  Iso8601,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type { ObservationInput, WorldHashFn } from "../ports.js";
import { deriveObservationId, isValidConfidence } from "../snapshot.js";
import type { AcquisitionRecord } from "./acquisition.js";
import { NormalizationError } from "./errors.js";
import type { AcquisitionChain } from "./provenance.js";
import { canonicalJson, isNonEmptyString, isPlainObject } from "./provenance.js";

/**
 * Stage 2 — normalization (domain layer — pure).
 *
 * Raw (per-domain) observations become normalized observation records
 * in THE EXACT vocabulary the frozen `ingestObservations` seam accepts.
 * Deterministic and idempotent per batch: canonical payload hashing
 * (key-order independent) and the seam's own observation-id derivation.
 * Provenance is MINTED from the acquisition's validated chain; the
 * manifest's declared policy becomes the observation policy (rights are
 * never invented). Confidence is min'd with the source ceiling — carry
 * or lower only.
 */

/** One raw (per-domain) observation entering normalization. */
export interface RawObservation {
  rawId: SportaId;
  /** The acquisition media this observation came from. */
  mediaRef: SportaId;
  capturedAt: Iso8601;
  /** REQUIRED — confidence is never invented downstream. */
  confidence: Confidence;
  payload: Record<string, unknown>;
  entityRefs?: readonly SportaId[];
  eventRefs?: readonly SportaId[];
}

/** A normalized observation: the seam vocabulary + pipeline citations. */
export interface NormalizedObservation {
  /** The observation exactly as `ingestObservations` accepts it. */
  observation: ObservationInput;
  /** Always set: the seam's own derivation of the observation id. */
  observationId: SportaId;
  chain: AcquisitionChain;
  mediaRef: SportaId;
  /** The raw payload, for downstream perception (never sent to the seam). */
  rawPayload: Record<string, unknown>;
}

/** Injected seams (the sha-256 helper stays adapters-owned). */
export interface NormalizationSeams {
  hash: WorldHashFn;
}

/**
 * Normalize a batch of raw observations against one acquisition
 * record. Output is sorted by observationId (canonical per batch).
 * An empty batch maps to an empty array (stage totality law); the
 * composition refuses empty raws before reaching this stage.
 */
export function normalizeObservations(
  acquisition: AcquisitionRecord,
  raws: readonly RawObservation[],
  seams: NormalizationSeams,
): NormalizedObservation[] {
  if (raws.length === 0) return [];
  const mediaIds = new Set(acquisition.mediaRefs.map((media) => media.mediaId));
  const seenRawIds = new Set<SportaId>();
  const normalized: NormalizedObservation[] = [];
  for (const raw of raws) {
    if (!isPlainObject(raw)) {
      throw new NormalizationError("raw observation must be an object", "raw");
    }
    if (!isNonEmptyString(raw.rawId)) {
      throw new NormalizationError("rawId must be a non-empty string", "rawId");
    }
    if (seenRawIds.has(raw.rawId)) {
      throw new NormalizationError(
        `duplicate rawId "${raw.rawId}" in one batch`,
        `duplicate:${raw.rawId}`,
      );
    }
    seenRawIds.add(raw.rawId);
    if (!mediaIds.has(raw.mediaRef)) {
      throw new NormalizationError(
        `raw observation "${raw.rawId}" cites media "${raw.mediaRef}" the acquisition does not declare`,
        `unknown-media:${raw.mediaRef}`,
      );
    }
    if (typeof raw.capturedAt !== "string" || Number.isNaN(Date.parse(raw.capturedAt))) {
      throw new NormalizationError(
        `raw observation "${raw.rawId}" capturedAt is not a parseable ISO-8601 timestamp`,
        `captured-at:${String(raw.capturedAt)}`,
      );
    }
    if (!isValidConfidence(raw.confidence)) {
      throw new NormalizationError(
        `raw observation "${raw.rawId}" confidence ${raw.confidence} is outside [0, 1]`,
        `confidence:${raw.confidence}`,
      );
    }
    if (!isPlainObject(raw.payload)) {
      throw new NormalizationError(
        `raw observation "${raw.rawId}" payload must be a plain object`,
        `payload:${raw.rawId}`,
      );
    }
    if (!validateIdRefs(raw.entityRefs) || !validateIdRefs(raw.eventRefs)) {
      throw new NormalizationError(
        `raw observation "${raw.rawId}" entityRefs/eventRefs must be arrays of non-empty strings`,
        `refs:${raw.rawId}`,
      );
    }
    let payloadHash: string;
    try {
      payloadHash = seams.hash(canonicalJson(raw.payload));
    } catch {
      throw new NormalizationError(
        `raw observation "${raw.rawId}" payload is not canonical-JSON serializable`,
        `payload-serializable:${raw.rawId}`,
      );
    }
    // Carry or lower: the source ceiling never raises a raw confidence.
    const confidence = Math.min(raw.confidence, acquisition.sourceConfidenceCeiling);
    const provenance: ProvenanceDescriptor = {
      sourceKind: acquisition.chain.sourceKind,
      sourceRef: acquisition.chain.sourceRef,
      capturedAt: raw.capturedAt,
      confidence: raw.confidence,
    };
    const observation: ObservationInput = {
      domain: acquisition.chain.domain,
      payloadHash,
      capturedAt: raw.capturedAt,
      confidence,
      provenance,
      policy: acquisition.policy,
    };
    if (raw.entityRefs !== undefined) observation.entityRefs = [...raw.entityRefs];
    if (raw.eventRefs !== undefined) observation.eventRefs = [...raw.eventRefs];
    const observationId = deriveObservationId(observation, seams.hash);
    normalized.push({
      observation: { ...observation, observationId },
      observationId,
      chain: acquisition.chain,
      mediaRef: raw.mediaRef,
      rawPayload: raw.payload,
    });
  }
  return normalized.sort((left, right) =>
    left.observationId < right.observationId
      ? -1
      : left.observationId > right.observationId
        ? 1
        : 0,
  );
}

/** Optional id-ref arrays, when present, must be arrays of non-empty strings. */
function validateIdRefs(refs: readonly SportaId[] | undefined): boolean {
  if (refs === undefined) return true;
  return Array.isArray(refs) && refs.every((ref) => isNonEmptyString(ref));
}
