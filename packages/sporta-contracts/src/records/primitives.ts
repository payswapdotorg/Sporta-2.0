/**
 * Canonical primitives — opaque IDs, timestamps, content hashes, confidence, provenance.
 */

/** Stable opaque identifier. Never a provider identifier. */
export type SportaId = string;
/** ISO-8601 timestamp produced by an injected clock. */
export type Iso8601 = string;
/** Content hash (hex sha-256) of an addressed payload. */
export type ContentHash = string;
/** Confidence in [0, 1]. */
export type Confidence = number;

/** Where a fact came from; production facts require provenance. */
export interface ProvenanceDescriptor {
  sourceKind:
    | "authorized-source"
    | "observation"
    | "measurement"
    | "human-judgment"
    | "agent-run"
    | "editor-session"
    | "arena-session";
  sourceRef: SportaId;
  capturedAt: Iso8601;
  confidence?: Confidence;
}
