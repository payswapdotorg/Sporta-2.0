import type {
  Confidence,
  ContentHash,
  Iso8601,
  PolicySet,
  ProvenanceDescriptor,
  SportsWorldModelRecord,
  SportaId,
} from "@sporta/contracts/contract";
/**
 * sporta-world ports and operational types (domain layer — pure).
 *
 * Re-exported through src/contract.ts, the single public entrypoint. The
 * v1 shapes are frozen; Wave 1 adds optional reference/policy fields on
 * observations and the clock/hash seams (all additive).
 */

/** Injectable clock; record timestamps come only from here. */
export interface WorldClock {
  now(): Iso8601;
}

/** Injected sha-256 helper (the real implementation lives in adapters). */
export type WorldHashFn = (input: string) => ContentHash;

/** One observation entering the pipeline (already normalized). */
export interface ObservationInput {
  observationId?: SportaId;
  domain: string;
  payloadHash: string;
  capturedAt: string;
  confidence: Confidence;
  provenance: ProvenanceDescriptor;
  /** Entity references the observation carries (additive, optional). */
  entityRefs?: readonly SportaId[];
  /** Event references the observation carries (additive, optional). */
  eventRefs?: readonly SportaId[];
  /** Explicit policy for the snapshot (additive, optional). */
  policy?: PolicySet;
}

/** One ingested observation in the per-snapshot provenance ledger. */
export interface IngestedObservation {
  observationId: SportaId;
  swmId: SportaId;
  domain: string;
  payloadHash: string;
  capturedAt: string;
  confidence: Confidence;
  provenance: ProvenanceDescriptor;
  entityRefs: readonly SportaId[];
  eventRefs: readonly SportaId[];
  /** When the observation entered the ledger (injected clock). */
  ingestedAt: Iso8601;
}

/**
 * The World Model port.
 *
 * External tools may propose observations but never silently mutate
 * canonical SWM. Ingestion is idempotent per observationId.
 */
export interface WorldModelPort {
  ingestObservations(input: readonly ObservationInput[]): Promise<SportsWorldModelRecord>;
  readSnapshot(swmId: SportaId): Promise<SportsWorldModelRecord | null>;
}
