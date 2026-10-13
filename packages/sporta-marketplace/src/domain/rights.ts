/**
 * Rights snapshot validation (domain — pure, P9-14/15).
 *
 * The fail-closed law: admission NEVER infers rights safety from
 * appearance ("looks different" is not authorization). The caller
 * supplies a typed snapshot; a MISSING, malformed or non-covering
 * snapshot is a typed refusal — `rights-prerequisites-unsatisfied`.
 * Every listing prerequisite must be explicitly satisfied; no
 * checkbox-shaped claim can bypass the explicit check.
 */
import type { TransformListing } from "@sporta/marketplace/contract";

/**
 * The rights snapshot a caller supplies at feed-launch admission.
 * `satisfied` lists the prerequisite ids the caller has EVIDENCE for
 * (input authorization, music/graphics, model/dataset licenses, output
 * use — tracked distinctly, P9-15); `evidenceRefs` points at the proof.
 */
export interface TransformRightsSnapshot {
  readonly satisfied: readonly string[];
  readonly evidenceRefs: readonly string[];
}

/** Well-formed snapshot: an object whose `satisfied` is a string array. */
export function isWellFormedRightsSnapshot(value: unknown): value is TransformRightsSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<TransformRightsSnapshot>;
  return (
    Array.isArray(snapshot.satisfied) &&
    snapshot.satisfied.every((item) => typeof item === "string" && item.length > 0) &&
    (snapshot.evidenceRefs === undefined ||
      (Array.isArray(snapshot.evidenceRefs) &&
        snapshot.evidenceRefs.every((item) => typeof item === "string")))
  );
}

/**
 * Total rights check: EVERY listing prerequisite must appear in the
 * snapshot's `satisfied` set. Missing snapshot, malformed shape, or one
 * unsatisfied prerequisite -> unsatisfied (fail-closed, P9-14: never
 * "safe because it looks different").
 */
export function rightsPrerequisitesSatisfied(
  listing: Pick<TransformListing, "rightsPrerequisites">,
  snapshot: TransformRightsSnapshot | null | undefined,
): { satisfied: boolean; unmet: readonly string[] } {
  if (snapshot === null || snapshot === undefined) {
    return { satisfied: false, unmet: [...listing.rightsPrerequisites] };
  }
  if (!isWellFormedRightsSnapshot(snapshot)) {
    return { satisfied: false, unmet: [...listing.rightsPrerequisites] };
  }
  const have = new Set(snapshot.satisfied);
  const unmet = listing.rightsPrerequisites.filter((prerequisite) => !have.has(prerequisite));
  return { satisfied: unmet.length === 0, unmet };
}
