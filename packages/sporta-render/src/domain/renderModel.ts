import type {
  Confidence,
  ContentHash,
  ProvenanceDescriptor,
  SportsWorldModelRecord,
  SportaId,
} from "@sporta/contracts/contract";
import { RenderInputError } from "./errors.js";
/**
 * Shared render-model semantics (domain layer — pure, no IO).
 *
 * Both realities carry the SAME read-only header forward from the
 * snapshot (ADR wave-5, decision 5): the source reference, the verbatim
 * provenance descriptor, a verbatim rights-scope summary and the
 * verbatim uncertainty evidence. Nothing here invents a fact; the
 * models are deeply frozen at construction so the read-only law is
 * machine-checked, not only typed.
 */

/** Which reality kind a render model projects. */
export type RealityKind = "tactical" | "play-by-play";

/** The snapshot a render model was derived from (traceability). */
export interface RenderModelSource {
  readonly swmId: SportaId;
  readonly snapshotHash: ContentHash;
  readonly domain: string;
}

/**
 * One observation-evidence entry carried verbatim from
 * `snapshot.uncertainty` (subjects are the observation ids of the
 * ingested batch — the record's own fact, read-only).
 */
export interface ObservationEvidence {
  readonly observationId: SportaId;
  readonly confidence: Confidence;
}

/**
 * Read-only rights-scope summary carried forward from
 `PolicySet.rights` — renderers never widen rights (invariant 22).
 */
export interface RightsScopeSummary {
  readonly holders: readonly string[];
  readonly usages: readonly string[];
  readonly prohibitions: readonly string[];
}

/**
 * The shared read-only carry-forward header of every render model.
 * Identical input snapshot ⇒ identical header bytes in BOTH realities
 * (asserted by the two-realities materiality test).
 */
export interface SwmRenderModelBase {
  readonly kind: RealityKind;
  readonly source: RenderModelSource;
  readonly provenance: ProvenanceDescriptor;
  readonly rightsScope: RightsScopeSummary;
  readonly evidence: readonly ObservationEvidence[];
}

/** Where the capture anchor of a render model came from. */
export const CAPTURE_ANCHOR_SOURCE = "snapshot-provenance" as const;

/** Derives the source reference block of a render model. */
export function renderModelSource(snapshot: SportsWorldModelRecord): RenderModelSource {
  return {
    swmId: snapshot.swmId,
    snapshotHash: snapshot.snapshotHash,
    domain: snapshot.domain,
  };
}

/**
 * Fail-closed confidence validation: every confidence this module
 * consumes (uncertainty entries and the provenance descriptor) must
 * lie in [0, 1] as the `Confidence` primitive documents, else a typed
 * `RenderInputError` (the world module's law, mirrored).
 */
export function validateConfidence(value: Confidence, subject: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RenderInputError(
      `confidence ${value} of "${subject}" is outside [0, 1]`,
      `confidence:${subject}:${String(value)}`,
    );
  }
}

/**
 * The read-only carry-forward block, verbatim from the snapshot:
 * provenance descriptor, rights-scope summary and uncertainty
 * evidence. Validation is fail-closed (see `validateConfidence`).
 */
export function carryForward(snapshot: SportsWorldModelRecord): Omit<SwmRenderModelBase, "kind"> {
  if (snapshot.provenance.confidence !== undefined) {
    validateConfidence(snapshot.provenance.confidence, snapshot.provenance.sourceRef);
  }
  for (const entry of snapshot.uncertainty) {
    validateConfidence(entry.confidence, entry.subject);
  }
  return {
    source: renderModelSource(snapshot),
    provenance: { ...snapshot.provenance },
    rightsScope: {
      holders: [...snapshot.policy.rights.holders],
      usages: [...snapshot.policy.rights.usages],
      prohibitions: [...snapshot.policy.rights.prohibitions],
    },
    evidence: snapshot.uncertainty.map((entry) => ({
      observationId: entry.subject,
      confidence: entry.confidence,
    })),
  };
}

/**
 * Confidence attach rule (both realities): the confidence a subject id
 * carries ONLY when some uncertainty entry has `subject === id` (first
 * match wins, deterministic) — never invented.
 */
export function attachedConfidence(
  snapshot: SportsWorldModelRecord,
  subject: SportaId,
): Confidence | undefined {
  for (const entry of snapshot.uncertainty) {
    if (entry.subject === subject) return entry.confidence;
  }
  return undefined;
}

/**
 * Deep freeze a produced render model (read-only carry-forward law):
 * recursively freezes every object/array the model owns. Adapters
 * build fresh structures, so the input snapshot is never affected.
 * Strings/numbers are primitives and need no freeze.
 */
export function deepFreezeRenderModel<T>(value: T): T {
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeRenderModel(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreezeRenderModel((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}
