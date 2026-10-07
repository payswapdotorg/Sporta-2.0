import type { SportaId, ContentHash, Confidence, ProvenanceDescriptor } from "./primitives.js";
/**
 * Sports World Model record — authoritative structured sporting-event state.
 */
import type { PolicySet } from "@sporta/policy/contract";

/** Authoritative structured sporting-event state. */
export interface SportsWorldModelRecord {
  swmId: SportaId;
  /** Event domain, e.g. "football". Extensible without redesign. */
  domain: string;
  snapshotHash: ContentHash;
  entities: readonly SportaId[];
  events: readonly SportaId[];
  uncertainty: readonly { subject: SportaId; confidence: Confidence }[];
  provenance: ProvenanceDescriptor;
  policy: PolicySet;
}
