/**
 * W9B-4 — the fail-closed feed-launch admission service (app layer,
 * P9-14..17). Returns the FROZEN `TransformListingSelectionResult` and
 * builds the typed `TransformLaunchDisclosure` for the launch UI.
 *
 * Refusal law: listing not PUBLISHED / suspended / no entitlement /
 * revoked / expired / usage exhausted / rights prerequisites
 * unsatisfied — every refusal is typed with the frozen reason. A
 * missing or malformed rights snapshot is the typed refusal
 * `rights-prerequisites-unsatisfied`, NEVER "safe because it looks
 * different". The admitted digest is the entitlement's pinned approved
 * digest — byte-identical from decision -> listing -> entitlement ->
 * admission. Successful admission consumes exactly one run
 * (`usedRuns` + 1); refusals never consume runs.
 */
import type { SportaId, TransformListingSelectionResult } from "@sporta/marketplace/contract";
import type {
  CandidateStorePort,
  EntitlementStorePort,
  ListingStorePort,
  MarketplaceClock,
  MarketplaceHashPort,
  TransformManifestReadPort,
} from "../domain/ports.js";
import { TransformManifestUnresolvedError, TransformUnknownRecordError } from "../domain/errors.js";
import { buildLaunchDisclosure, type TransformLaunchDisclosure } from "../domain/disclosure.js";
import { rightsPrerequisitesSatisfied, type TransformRightsSnapshot } from "../domain/rights.js";

/** Constructor dependencies — every IO seam injected. */
export interface FeedLaunchAdmissionServiceDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  listings: ListingStorePort;
  entitlements: EntitlementStorePort;
  candidates: CandidateStorePort;
  manifests: TransformManifestReadPort;
}

/** Input for one feed-launch selection. */
export interface SelectForLaunchInput {
  listingId: SportaId;
  principal: string;
  /** The caller-supplied rights snapshot; missing = typed refusal. */
  rightsSnapshot?: TransformRightsSnapshot | null;
}

export class FeedLaunchAdmissionService {
  private readonly deps: FeedLaunchAdmissionServiceDeps;

  constructor(deps: FeedLaunchAdmissionServiceDeps) {
    this.deps = deps;
  }

  /**
   * Admit or refuse one feed-launch selection (deterministic check
   * order: listing state -> suspension -> entitlement -> revocation ->
   * expiry -> usage -> rights). Success increments `usedRuns` exactly
   * once and admits the entitlement's pinned approved digest.
   */
  selectForLaunch(input: SelectForLaunchInput): TransformListingSelectionResult {
    const listing = this.deps.listings.byId(input.listingId);
    if (listing === null) {
      return refused("listing-not-published", `no listing ${input.listingId}`);
    }
    if (listing.status === "SUSPENDED") {
      return refused(
        "suspended",
        `listing ${listing.listingId} is SUSPENDED — new runs are blocked; historical runs stay pinned and readable`,
      );
    }
    if (listing.status !== "PUBLISHED") {
      return refused(
        "listing-not-published",
        `listing ${listing.listingId} is ${listing.status} — only PUBLISHED listings are selectable`,
      );
    }

    const approvedDigests = new Set<string>([
      listing.currentRelease.releaseDigest,
      ...listing.versionHistory.map((entry) => entry.releaseDigest),
    ]);
    const entitlement = this.deps.entitlements
      .listByPrincipal(input.principal)
      .find((candidate) => approvedDigests.has(candidate.releaseDigest));
    if (entitlement === undefined) {
      return refused(
        "no-entitlement",
        `principal ${input.principal} holds no entitlement for any approved release of listing ${listing.listingId} (unreviewed digests never resolve to entitlements)`,
      );
    }
    if (entitlement.status === "revoked") {
      return refused(
        "entitlement-revoked",
        `entitlement ${entitlement.entitlementId} was revoked at ${entitlement.revokedAt ?? "unknown time"}`,
      );
    }
    const expiresAt = entitlement.usageLimits.expiresAt;
    if (expiresAt !== null && this.deps.clock.now() >= expiresAt) {
      if (entitlement.status === "active") {
        this.deps.entitlements.save({ ...entitlement, status: "expired" });
      }
      return refused(
        "entitlement-expired",
        `entitlement ${entitlement.entitlementId} expired at ${expiresAt} (checked at admission)`,
      );
    }
    const maxRuns = entitlement.usageLimits.maxRuns;
    if (maxRuns !== null && entitlement.usageLimits.usedRuns >= maxRuns) {
      return refused(
        "usage-limit-exhausted",
        `entitlement ${entitlement.entitlementId} exhausted its run limit (${entitlement.usageLimits.usedRuns}/${maxRuns})`,
      );
    }

    const rights = rightsPrerequisitesSatisfied(listing, input.rightsSnapshot);
    if (!rights.satisfied) {
      return refused(
        "rights-prerequisites-unsatisfied",
        rights.unmet.length > 0
          ? `unsatisfied rights prerequisites: ${rights.unmet.join(", ")} — never "safe because it looks different" (P9-14)`
          : "rights snapshot missing or malformed — admission is fail-closed without evidence (P9-14)",
      );
    }

    this.deps.entitlements.save({
      ...entitlement,
      usageLimits: { ...entitlement.usageLimits, usedRuns: entitlement.usageLimits.usedRuns + 1 },
    });
    return {
      admitted: true,
      listingId: listing.listingId,
      releaseDigest: entitlement.releaseDigest,
      entitlementId: entitlement.entitlementId,
    };
  }

  /**
   * Build the typed launch disclosure (P9-12): publisher, approved
   * version, terms/price, rights prerequisites, dependencies (read
   * through the manifest port — an unresolvable manifest refuses
   * disclosure rather than hiding dependencies), outputs, limitations,
   * cost/latency expectations with evidence grade, review date, and
   * the fixed legal notice (similarity is never clearance).
   */
  buildLaunchDisclosure(listingId: SportaId): TransformLaunchDisclosure {
    const listing = this.deps.listings.byId(listingId);
    if (listing === null) {
      throw new TransformUnknownRecordError(`no listing ${listingId}`, "listing", listingId);
    }
    const candidate = this.deps.candidates.byPipelineAndVersion(
      listing.pipelineId,
      listing.currentRelease.version,
    );
    const manifestDigest = candidate?.manifestDigest ?? null;
    const manifest =
      manifestDigest === null
        ? null
        : this.deps.manifests.read(
            listing.pipelineId,
            listing.currentRelease.version,
            manifestDigest,
          );
    if (manifest === null) {
      throw new TransformManifestUnresolvedError(
        `manifest for ${listing.pipelineId}@${listing.currentRelease.version} unresolvable — disclosure never hides dependencies (P9-12)`,
        listing.pipelineId,
        listing.currentRelease.version,
        manifestDigest ?? "unknown",
      );
    }
    return buildLaunchDisclosure(listing, manifest);
  }
}

/** Uniform typed refusal constructor (frozen reason + honest detail). */
function refused(
  reason: Exclude<TransformListingSelectionResult, { admitted: true }>["reason"],
  detail: string,
): TransformListingSelectionResult {
  return { admitted: false, reason, detail };
}
