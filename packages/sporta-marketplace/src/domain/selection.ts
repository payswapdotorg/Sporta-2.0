/**
 * W9B-4 — the fail-closed feed-launch admission law (domain layer —
 * pure). `evaluateAdmission` returns EXACTLY the frozen
 * `TransformListingSelectionResult` from the listing state, the
 * matching entitlement, the usage counters, the clock and the
 * caller-supplied rights snapshot.
 *
 * Fail-closed law (P9-14): a MISSING or malformed rights snapshot is
 * a typed refusal with reason "rights-prerequisites-unsatisfied" —
 * never "safe because it looks different". Similarity plays no role
 * here at all: it was an automated review trigger (P9-16), not an
 * admission input. The check order is deterministic (SPEC W9B-4
 * table) so every refusal lane is testable.
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type { TransformEntitlement, TransformListing, TransformListingSelectionResult } from "@sporta/marketplace/contract";
import type { TransformSuspensionRecord } from "@sporta/marketplace/contract";

/** Distinct rights prerequisite categories (P9-15, tracked separately). */
export const RIGHTS_PREREQUISITE_CATEGORIES: readonly string[] = [
  "input-footage-authorization",
  "music-and-graphics",
  "model-and-dataset-licenses",
  "output-use",
];

/**
 * The caller-supplied rights snapshot — typed evidence, never a
 * checkbox bypass. `satisfactions` carries per-prerequisite
 * authorization evidence; `authorizedUsages` lists the usage classes
 * the source rights actually authorize (e.g. "derive", "render").
 */
export interface TransformRightsSnapshot {
  snapshotId: string;
  capturedAt: Iso8601;
  satisfactions: readonly {
    prerequisite: string;
    authorized: boolean;
    evidence: string;
  }[];
  authorizedUsages: readonly string[];
}

/** Validation outcome for a rights snapshot (fail-closed). */
export type RightsSnapshotValidation =
  | { ok: true; snapshot: TransformRightsSnapshot }
  | { ok: false; reason: "missing" | "malformed" | "prerequisite-unsatisfied" | "usage-unauthorized" | "usage-prohibited"; detail: string };

/** Structural validation of a snapshot (missing/malformed lanes). */
export function validateRightsSnapshot(
  snapshot: TransformRightsSnapshot | null | undefined,
): RightsSnapshotValidation {
  if (snapshot === null || snapshot === undefined) {
    return { ok: false, reason: "missing", detail: "no rights snapshot supplied — fail-closed, never safe-by-default" };
  }
  if (
    typeof snapshot.snapshotId !== "string" ||
    snapshot.snapshotId.trim().length === 0 ||
    typeof snapshot.capturedAt !== "string" ||
    snapshot.capturedAt.trim().length === 0 ||
    !Array.isArray(snapshot.satisfactions) ||
    !Array.isArray(snapshot.authorizedUsages)
  ) {
    return { ok: false, reason: "malformed", detail: "rights snapshot is malformed — typed refusal, never a guess" };
  }
  for (const satisfaction of snapshot.satisfactions) {
    if (
      typeof satisfaction.prerequisite !== "string" ||
      typeof satisfaction.authorized !== "boolean" ||
      typeof satisfaction.evidence !== "string"
    ) {
      return {
        ok: false,
        reason: "malformed",
        detail: `satisfaction entry for "${String(satisfaction.prerequisite)}" is malformed — typed refusal`,
      };
    }
  }
  return { ok: true, snapshot };
}

/** Inputs to the pure admission evaluation. */
export interface EvaluateAdmissionInput {
  listing: TransformListing | null;
  suspension: TransformSuspensionRecord | null;
  /** The entitlement pinning the listing's current release, if any. */
  entitlement: TransformEntitlement | null;
  now: Iso8601;
  rightsSnapshot: TransformRightsSnapshot | null | undefined;
  /**
   * True when this runRef was already recorded for the entitlement —
   * an idempotent retry of an admitted run re-admits even at the
   * usage limit (the run was already counted; honest counters).
   */
  usageAlreadyRecorded: boolean;
}

/** Mark an expired entitlement (observable status, never silent). */
export function entitlementExpired(entitlement: TransformEntitlement, now: Iso8601): boolean {
  return entitlement.usageLimits.expiresAt !== null && now > entitlement.usageLimits.expiresAt;
}

/** Usage exhausted when maxRuns is set and reached (honest counters). */
export function usageExhausted(entitlement: TransformEntitlement): boolean {
  return entitlement.usageLimits.maxRuns !== null && entitlement.usageLimits.usedRuns >= entitlement.usageLimits.maxRuns;
}

/**
 * The deterministic admission table (SPEC order): listing published
 * -> not suspended -> entitlement pins the current release -> not
 * revoked -> not expired -> usage left -> rights satisfied.
 */
export function evaluateAdmission(input: EvaluateAdmissionInput): TransformListingSelectionResult {
  const { listing, suspension, entitlement, now } = input;

  if (listing === null) {
    return refuse("listing-not-published", "unknown listing — nothing is publicly selectable");
  }
  if (listing.status === "SUSPENDED" || suspension !== null) {
    return refuse(
      "suspended",
      `listing suspended (${suspension?.reason ?? "status"}): new runs blocked, history preserved`,
    );
  }
  if (listing.status !== "PUBLISHED") {
    return refuse("listing-not-published", `listing state is ${listing.status} — not publicly selectable`);
  }
  if (entitlement === null) {
    return refuse(
      "no-entitlement",
      `no entitlement pins release ${listing.currentRelease.releaseDigest} (${listing.currentRelease.version}) for this principal`,
    );
  }
  if (entitlement.status === "revoked") {
    return refuse("entitlement-revoked", `entitlement ${entitlement.entitlementId} revoked at ${entitlement.revokedAt ?? "unknown time"}`);
  }
  if (entitlementExpired(entitlement, now)) {
    return refuse("entitlement-expired", `entitlement ${entitlement.entitlementId} expired at ${entitlement.usageLimits.expiresAt}`);
  }
  if (usageExhausted(entitlement) && !input.usageAlreadyRecorded) {
    return refuse(
      "usage-limit-exhausted",
      `usedRuns ${entitlement.usageLimits.usedRuns} of maxRuns ${entitlement.usageLimits.maxRuns}`,
    );
  }

  const rights = evaluateRights(listing, input.rightsSnapshot ?? null);
  if (!rights.ok) {
    return refuse("rights-prerequisites-unsatisfied", rights.detail);
  }

  return {
    admitted: true,
    listingId: listing.listingId,
    releaseDigest: listing.currentRelease.releaseDigest,
    entitlementId: entitlement.entitlementId,
  };
}

/** The rights-prerequisite evaluation (P9-14/P9-15). */
export function evaluateRights(
  listing: TransformListing,
  snapshot: TransformRightsSnapshot | null | undefined,
): RightsSnapshotValidation {
  const validated = validateRightsSnapshot(snapshot);
  if (!validated.ok) return validated;
  const rights = validated.snapshot;

  for (const prerequisite of listing.rightsPrerequisites) {
    const satisfaction = rights.satisfactions.find((entry) => entry.prerequisite === prerequisite);
    if (satisfaction === undefined) {
      return {
        ok: false,
        reason: "prerequisite-unsatisfied",
        detail: `rights prerequisite "${prerequisite}" has no satisfaction entry in snapshot ${rights.snapshotId}`,
      };
    }
    if (!satisfaction.authorized) {
      return {
        ok: false,
        reason: "prerequisite-unsatisfied",
        detail: `rights prerequisite "${prerequisite}" is not authorized (${satisfaction.evidence})`,
      };
    }
  }
  for (const usage of listing.policy.rights.usages) {
    if (!rights.authorizedUsages.includes(usage)) {
      return {
        ok: false,
        reason: "usage-unauthorized",
        detail: `pipeline requires usage "${usage}" but the source rights authorize only [${rights.authorizedUsages.join(", ")}]`,
      };
    }
  }
  for (const usage of listing.policy.rights.usages) {
    if (listing.policy.rights.prohibitions.includes(usage)) {
      return {
        ok: false,
        reason: "usage-prohibited",
        detail: `listing policy requires usage "${usage}" that it also prohibits — fail-closed on contradictory policy`,
      };
    }
  }
  return { ok: true, snapshot: rights };
}

function refuse(
  reason: Extract<TransformListingSelectionResult, { admitted: false }>["reason"],
  detail: string,
): TransformListingSelectionResult {
  return { admitted: false, reason, detail };
}
