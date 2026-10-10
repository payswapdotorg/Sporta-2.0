/**
 * The carry-forward header: validation, defensive copy and structural
 * equality (domain layer — pure, no IO).
 *
 * The carry-forward is the read-only summary block every render-model
 * timeline port carries (source + provenance + rights scope) and every
 * playback frame carries FORWARD verbatim (ADR wave-5, decision 5):
 * never widened, never dropped, never merged. One playback session =
 * one snapshot's realities, so all timelines in a session must declare
 * structurally equal carry-forward headers (enforced in timeline.ts).
 */
import { MalformedCarryForwardError } from "./errors.js";
import type {
  PlaybackProvenanceSummary,
  PlaybackRightsScopeSummary,
  PlaybackSourceSummary,
  RenderTimelinePort,
} from "./ports.js";

/** The read-only carry-forward header every frame carries verbatim. */
export interface PlaybackCarryForward {
  readonly source: PlaybackSourceSummary;
  readonly provenance: PlaybackProvenanceSummary;
  readonly rightsScope: PlaybackRightsScopeSummary;
}

function requireNonEmptyString(value: unknown, field: string, kind: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new MalformedCarryForwardError(
      `carry-forward field "${field}" of the "${kind}" timeline must be a non-empty string`,
      `${kind}:${field}`,
    );
  }
}

function requireStringArray(value: unknown, field: string, kind: string): void {
  if (!Array.isArray(value)) {
    throw new MalformedCarryForwardError(
      `carry-forward field "${field}" of the "${kind}" timeline must be an array`,
      `${kind}:${field}`,
    );
  }
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      throw new MalformedCarryForwardError(
        `carry-forward field "${field}" of the "${kind}" timeline contains a non-string/empty entry`,
        `${kind}:${field}:entry`,
      );
    }
  }
}

/** Fail-closed carry-forward validation (confidence may never be invented — [0, 1] only). */
export function validateCarryForward(timeline: RenderTimelinePort): void {
  const { kind, source, provenance, rightsScope } = timeline;
  requireNonEmptyString(source?.swmId, "source.swmId", kind);
  requireNonEmptyString(source?.snapshotHash, "source.snapshotHash", kind);
  requireNonEmptyString(source?.domain, "source.domain", kind);
  requireNonEmptyString(provenance?.sourceKind, "provenance.sourceKind", kind);
  requireNonEmptyString(provenance?.sourceRef, "provenance.sourceRef", kind);
  requireNonEmptyString(provenance?.capturedAt, "provenance.capturedAt", kind);
  const confidence = provenance?.confidence;
  if (
    confidence !== undefined &&
    (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
  ) {
    throw new MalformedCarryForwardError(
      `provenance.confidence of the "${kind}" timeline is outside [0, 1] (got ${String(confidence)})`,
      `${kind}:confidence:${String(confidence)}`,
    );
  }
  requireStringArray(rightsScope?.holders, "rightsScope.holders", kind);
  requireStringArray(rightsScope?.usages, "rightsScope.usages", kind);
  requireStringArray(rightsScope?.prohibitions, "rightsScope.prohibitions", kind);
}

/** A defensive verbatim copy of the carry-forward header (read-only law). */
export function copyCarryForward(timeline: RenderTimelinePort): PlaybackCarryForward {
  const { source, provenance, rightsScope } = timeline;
  const carry: PlaybackCarryForward = {
    source: {
      swmId: source.swmId,
      snapshotHash: source.snapshotHash,
      domain: source.domain,
    },
    provenance:
      provenance.confidence === undefined
        ? {
            sourceKind: provenance.sourceKind,
            sourceRef: provenance.sourceRef,
            capturedAt: provenance.capturedAt,
          }
        : {
            sourceKind: provenance.sourceKind,
            sourceRef: provenance.sourceRef,
            capturedAt: provenance.capturedAt,
            confidence: provenance.confidence,
          },
    rightsScope: {
      holders: [...rightsScope.holders],
      usages: [...rightsScope.usages],
      prohibitions: [...rightsScope.prohibitions],
    },
  };
  return carry;
}

/**
 * Structural equality for the carry-forward check. Undefined-valued
 * keys compare as absent; arrays are order-sensitive (identical
 * header bytes, the two-realities law).
 */
export function structurallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!structurallyEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const keysA = Object.keys(a).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
    const keysB = Object.keys(b).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.hasOwn(b, key)) return false;
      if (
        !structurallyEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      ) {
        return false;
      }
    }
    return true;
  }
  return false;
}
