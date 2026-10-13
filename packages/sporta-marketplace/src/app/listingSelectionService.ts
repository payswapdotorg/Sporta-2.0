/**
 * W9B-4 — the feed-launch selection service (app layer). Fail-closed
 * admission returning EXACTLY the frozen
 * `TransformListingSelectionResult` (P9-14..17): refuse when the
 * listing is not PUBLISHED, suspended, the principal holds no
 * entitlement for the current release, the entitlement is revoked or
 * expired, usage is exhausted, or the caller-supplied rights snapshot
 * is missing/malformed/unsatisfied. A missing or invalid snapshot is
 * a typed refusal — never "safe because it looks different". Also
 * assembles the typed `TransformLaunchDisclosure` (P9-12) with the
 * P9-17 provenance note.
 */
import type { SportaId } from "@sporta/contracts/contract";
import { buildLaunchDisclosure } from "../domain/disclosure.js";
import {
  entitlementExpired,
  evaluateAdmission,
  usageExhausted,
  type TransformRightsSnapshot,
} from "../domain/selection.js";
import type { MarketplaceClock, TransformManifestReadPort } from "../domain/ports.js";
import type { TransformLaunchDisclosure, TransformListingSelectionResult } from "@sporta/marketplace/contract";
import type { ListingService } from "./listingService.js";
import type { EntitlementService } from "./entitlementService.js";
import type { PublicationService } from "./publicationService.js";

/** Constructor dependencies. */
export interface ListingSelectionServiceDeps {
  clock: MarketplaceClock;
  listings: ListingService;
  entitlements: EntitlementService;
  publications: PublicationService;
  manifests: TransformManifestReadPort;
}

/** One feed-launch selection attempt. */
export interface SelectForLaunchInput {
  listingId: SportaId;
  principal: string;
  /**
   * Caller-supplied rights evidence (P9-14): null/undefined is a
   * typed refusal — never a default pass.
   */
  rightsSnapshot: TransformRightsSnapshot | null | undefined;
  /** The run identity usage is recorded against (idempotent per runRef). */
  runRef: string;
}

/** Fail-closed admission + disclosure assembly. */
export class ListingSelectionService {
  private readonly deps: ListingSelectionServiceDeps;

  constructor(deps: ListingSelectionServiceDeps) {
    this.deps = deps;
  }

  /**
   * Attempt admission for a feed launch. On success, usage is
   * recorded idempotently per runRef (honest counters). The admitted
   * releaseDigest byte-equals the approved decision's candidate
   * digest — the identity chain is asserted by tests.
   */
  selectForLaunch(input: SelectForLaunchInput): TransformListingSelectionResult {
    const now = this.deps.clock.now();
    const listing = this.deps.listings.readListing(input.listingId);
    const suspension = listing === null ? null : this.deps.listings.activeSuspension(input.listingId);
    const entitlement =
      listing === null
        ? null
        : this.deps.entitlements.entitlementForCurrentRelease(input.principal, listing);

    if (entitlement !== null && entitlement.status === "active" && entitlementExpired(entitlement, now)) {
      this.deps.entitlements.markExpired(entitlement.entitlementId);
    }

    const result = evaluateAdmission({
      listing,
      suspension,
      entitlement,
      now,
      rightsSnapshot: input.rightsSnapshot,
      usageAlreadyRecorded:
        entitlement !== null &&
        this.deps.entitlements.isUsageRecorded(entitlement.entitlementId, input.runRef),
    });

    if (result.admitted && entitlement !== null) {
      this.deps.entitlements.recordUsage(entitlement.entitlementId, input.runRef);
    }
    return result;
  }

  /**
   * Assemble the launch disclosure (P9-12/P9-17). Dependencies come
   * from the approved candidate's pinned manifest; an unresolvable
   * manifest degrades honestly (explicit limitation entry, licenses
   * "unverified") — never a silent hide.
   */
  discloseForLaunch(listingId: SportaId): TransformLaunchDisclosure {
    const listing = this.deps.listings.readListing(listingId);
    if (listing === null) {
      throw new Error(`listing ${listingId} not found — nothing to disclose`);
    }
    const submission = this.deps.publications.readSubmissionByDigest(listing.currentRelease.releaseDigest);
    const manifest = this.deps.manifests.readManifest({
      pipelineId: listing.pipelineId,
      version: listing.currentRelease.version,
      manifestDigest: submission?.candidate.manifestDigest ?? "",
    });
    return buildLaunchDisclosure({
      listing,
      manifest,
      candidateContentHashes: submission?.candidate.contentHashes ?? [],
      generatedAt: this.deps.clock.now(),
    });
  }

  /** Usage projection helper (read-only; admission consumes). */
  usageRemaining(entitlementId: SportaId): { usedRuns: number; maxRuns: number | null; exhausted: boolean } | null {
    const entitlement = this.deps.entitlements.readEntitlement(entitlementId);
    if (entitlement === null) return null;
    return {
      usedRuns: entitlement.usageLimits.usedRuns,
      maxRuns: entitlement.usageLimits.maxRuns,
      exhausted: usageExhausted(entitlement),
    };
  }
}
