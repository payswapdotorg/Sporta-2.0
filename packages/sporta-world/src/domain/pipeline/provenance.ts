import type { Confidence, SportaId } from "@sporta/contracts/contract";

/**
 * Shared pipeline vocabulary (domain layer — pure): the authorized
 * acquisition chain every pipeline record cites, canonical JSON
 * serialization, deterministic opaque id segments and the
 * carry-or-lower confidence law shared by every stage.
 */

/** The authorized acquisition chain a pipeline record derives from. */
export interface AcquisitionChain {
  /** The manifest's id — the chain root (deterministic, caller-declared). */
  acquisitionId: SportaId;
  domain: string;
  /** Narrowed at the acquisition gate to the seam's ingestible vocabulary. */
  sourceKind: "authorized-source" | "observation";
  sourceRef: SportaId;
}

/** The perceived-fact kinds the perception stage can emit. */
export type PerceptionFactKind = "entity-state" | "ball-state";

/** A perceived position (ground-plane x/y, optional z). */
export interface PerceivedPosition {
  x: number;
  y: number;
  z?: number;
}

/**
 * Confidence law: a stage may carry or lower, never raise. The current
 * confidence is min'd with every declared ceiling (absent = carried).
 */
export function narrowConfidence(
  current: Confidence,
  ...ceilings: readonly (Confidence | undefined)[]
): Confidence {
  let result = current;
  for (const ceiling of ceilings) {
    if (ceiling !== undefined) result = Math.min(result, ceiling);
  }
  return result;
}

/**
 * Canonical JSON: object keys recursively sorted (arrays keep their
 * order — arrays are ordered facts); undefined object entries dropped;
 * undefined/function/symbol ARRAY elements serialize as null
 * (JSON.stringify semantics). Deterministic across key-insertion orders.
 * Throws on non-JSON values (e.g. bigint) — callers translate to typed
 * refusals.
 */
export function canonicalJson(value: unknown): string {
  return serializeValue(value);
}

function serializeValue(value: unknown): string {
  if (value === null) return "null";
  const kind = typeof value;
  if (kind === "undefined" || kind === "function" || kind === "symbol") {
    return "null"; // array-element JSON semantics
  }
  if (kind !== "object") return JSON.stringify(value); // string | number | boolean | bigint
  if (Array.isArray(value)) {
    return `[${value.map((element) => serializeValue(element)).join(",")}]`;
  }
  return serializeEntries(value as Record<string, unknown>);
}

function serializeEntries(record: Record<string, unknown>): string {
  const entries = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${serializeValue(value)}`).join(",")}}`;
}

/**
 * Deterministic opaque id segment: length-prefixed so arbitrary
 * caller/entity id strings can never collide through concatenation
 * (no hash seam is threaded through the post-normalization stages —
 * every downstream id stays a pure function of its inputs).
 */
export function idSegment(value: string): string {
  return `${value.length}:${value}`;
}

/** Compose a deterministic multi-segment opaque id. */
export function joinIdSegments(prefix: string, ...segments: readonly string[]): string {
  return [prefix, ...segments.map(idSegment)].join("|");
}

/** Runtime plain-object guard (payloads and caller inputs). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty string guard (ids and field names). */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Finite number guard (coordinates, offsets, scales, bounds). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
