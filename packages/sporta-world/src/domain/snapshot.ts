import type {
  Confidence,
  ContentHash,
  PolicySet,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type { ObservationInput, WorldHashFn } from "./ports.js";
/**
 * Pure SWM snapshot semantics (domain layer — no IO).
 *
 * The actual sha-256 helper lives in adapters and is injected; these
 * functions stay pure and deterministic.
 */

/** Only these provenance kinds may enter production SWM truth. */
export function isIngestibleSourceKind(sourceKind: ProvenanceDescriptor["sourceKind"]): boolean {
  return sourceKind === "authorized-source" || sourceKind === "observation";
}

/**
 * Snapshot hash: sha-256 over the SORTED payload hashes of all ingested
 * observations (join with newline; the count matters, duplicates are not
 * deduplicated — two observations of the same payload are two facts).
 */
export function computeSnapshotHash(
  payloadHashes: readonly string[],
  hash: WorldHashFn,
): ContentHash {
  const sorted = [...payloadHashes].sort();
  return hash(sorted.join("\n"));
}

/**
 * Observation id: the caller-supplied id when present, otherwise a
 * deterministic id derived from (domain, payloadHash, sourceRef,
 * capturedAt) so natural retries stay idempotent.
 */
export function deriveObservationId(observation: ObservationInput, hash: WorldHashFn): SportaId {
  if (observation.observationId !== undefined) return observation.observationId;
  return `obs:${hash(
    `${observation.domain}\n${observation.payloadHash}\n${observation.provenance.sourceRef}\n${observation.capturedAt}`,
  )}`;
}

/** Sorted unique union of id references. */
export function sortedUniqueIds(ids: readonly SportaId[]): SportaId[] {
  return [...new Set(ids)].sort();
}

/** Confidence must lie in [0, 1]. */
export function isValidConfidence(confidence: Confidence): boolean {
  return confidence >= 0 && confidence <= 1;
}

/** Structural policy equality (deterministic JSON compare). */
export function policiesEqual(left: PolicySet, right: PolicySet): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Fixture default policy for snapshots created without an explicit one. */
export function defaultWorldPolicy(): PolicySet {
  return {
    rights: { holders: [], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}
