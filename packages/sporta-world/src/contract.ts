/**
 * sporta-world — production Sports World Model seams.
 *
 * Pipeline: authorized source -> acquisition -> normalization ->
 * perception -> tracking -> calibration -> event reconstruction -> SWM.
 * Production SWM is evidence-backed; simulation never becomes production
 * truth; observations retain provenance and carry uncertainty.
 */
import type {
  Confidence,
  ProvenanceDescriptor,
  SportsWorldModelRecord,
  SportaId,
} from "@sporta/contracts/contract";

export type { SportsWorldModelRecord } from "@sporta/contracts/contract";

/** One observation entering the pipeline (already normalized). */
export interface ObservationInput {
  observationId?: SportaId;
  domain: string;
  payloadHash: string;
  capturedAt: string;
  confidence: Confidence;
  provenance: ProvenanceDescriptor;
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
