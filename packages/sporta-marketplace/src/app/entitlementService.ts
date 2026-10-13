/**
 * W9B-3 — the entitlement service (app layer). Free and paid offers
 * share the SAME review gates (lock 29 — offers attach after
 * approval, so gates cannot depend on price). Paid authorization
 * goes through the provider-neutral `SettlementPort` with a derived
 * idempotency key: identical grant inputs derive identical keys, so
 * retries never double-charge (P9-11). The settlement provider is
 * never the entitlement authority — the marketplace records the
 * entitlement; the settlement reference is charge evidence.
 * Entitlement lifecycle: active -> revoked | expired (observed at
 * admission against the injected clock), with honest `usedRuns`
 * counters recorded idempotently per runRef.
 */
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import { MarketplaceEntitlementError } from "../domain/errors.js";
import type { MarketplaceClock } from "../domain/ports.js";
import type { SettlementPort } from "../domain/paymentPort.js";
import { fnv1aHex, stableStringify } from "../domain/stable.js";
import type { TransformEntitlement, TransformListing, TransformOfferTerms } from "@sporta/marketplace/contract";
import type { ListingService } from "./listingService.js";

/** Constructor dependencies. */
export interface EntitlementServiceDeps {
  clock: MarketplaceClock;
  settlement: SettlementPort;
  listings: ListingService;
}

/** One entitlement grant request. */
export interface GrantEntitlementInput {
  principal: string;
  listingId: SportaId;
  /**
   * The purchase intent key component: identical retries reuse the
   * same derived idempotency key; a genuinely new purchase uses a
   * new purchaseRef and settles again.
   */
  purchaseRef: string;
}

/** Entitlement issuance, lifecycle and usage owner. */
export class EntitlementService {
  private readonly deps: EntitlementServiceDeps;
  private readonly entitlements = new Map<SportaId, TransformEntitlement>();
  private readonly usageRunRefs = new Set<string>();
  private readonly revocations = new Map<SportaId, { by: string; reason: string; revokedAt: Iso8601 }>();

  constructor(deps: EntitlementServiceDeps) {
    this.deps = deps;
  }

  /**
   * Grant an entitlement for a listing's current release. Idempotent
   * issuance: an existing ACTIVE entitlement for the same principal
   * and release is returned after re-authorizing under the same key
   * (the adapter dedupes — one settlement record).
   */
  async grantEntitlement(input: GrantEntitlementInput): Promise<TransformEntitlement> {
    const listing = this.deps.listings.readListing(input.listingId);
    if (listing === null) {
      throw new MarketplaceEntitlementError(
        `listing ${input.listingId} not found — entitlements attach to listings only`,
        "unknown-listing",
      );
    }
    if (listing.status !== "PUBLISHED") {
      throw new MarketplaceEntitlementError(
        `listing ${input.listingId} is ${listing.status} — no entitlements against unpublished listings`,
        "listing-not-published",
      );
    }
    const release = listing.currentRelease;
    const existing = this.findActiveEntitlement(input.principal, listing);
    if (existing !== null) {
      // Idempotent issuance: an ACTIVE entitlement already covers
      // this principal + release — returning it charges NOTHING.
      // (A failed-then-retried grant re-enters below and re-authorizes
      // under the same derived key; the adapter dedupes.)
      return existing;
    }
    const idempotencyKey = deriveIdempotencyKey(input.principal, listing, input.purchaseRef);

    let settlementRef: string | null = null;
    if (listing.offer.kind !== "free" && listing.offer.price !== null) {
      const settlement = await this.deps.settlement.authorize({
        idempotencyKey,
        principal: input.principal,
        offerRef: `${listing.listingId}@${release.version}`,
        amount: listing.offer.price,
        requestedAt: this.deps.clock.now(),
      });
      if (settlement.status !== "settled") {
        throw new MarketplaceEntitlementError(
          `settlement refused for ${input.principal} on ${listing.listingId} — no entitlement exists (${settlement.detail})`,
          "settlement-refused",
        );
      }
      settlementRef = settlement.settlementId;
    }

    const entitlement: TransformEntitlement = {
      entitlementId: `ent:${fnv1aHex(stableStringify({ principal: input.principal, releaseDigest: release.releaseDigest, purchaseRef: input.purchaseRef, at: this.deps.clock.now() }))}`,
      principal: input.principal,
      pipelineId: listing.pipelineId,
      version: release.version,
      releaseDigest: release.releaseDigest,
      offerKind: listing.offer.kind,
      settlementRef,
      idempotencyKey,
      usageLimits: {
        maxRuns: listing.offer.usageLimits.maxRuns,
        usedRuns: 0,
        expiresAt: listing.offer.usageLimits.expiresAt,
      },
      status: "active",
      grantedAt: this.deps.clock.now(),
      revokedAt: null,
    };
    this.entitlements.set(entitlement.entitlementId, entitlement);
    return entitlement;
  }

  /** Revoke: blocks the next admission; history preserved. */
  revokeEntitlement(
    entitlementId: SportaId,
    input: { by: string; reason: string },
  ): TransformEntitlement {
    const entitlement = this.requireEntitlement(entitlementId);
    if (entitlement.status === "revoked") {
      throw new MarketplaceEntitlementError(
        `entitlement ${entitlementId} is already revoked`,
        "already-revoked",
        entitlementId,
      );
    }
    entitlement.status = "revoked";
    entitlement.revokedAt = this.deps.clock.now();
    this.revocations.set(entitlementId, { ...input, revokedAt: entitlement.revokedAt });
    return entitlement;
  }

  /** The recorded revocation for an entitlement, if any (audit). */
  readRevocation(entitlementId: SportaId): { by: string; reason: string; revokedAt: Iso8601 } | null {
    return this.revocations.get(entitlementId) ?? null;
  }

  /**
   * Record one admitted run (honest counters): idempotent per runRef
   * — retried admissions never double-count.
   */
  recordUsage(entitlementId: SportaId, runRef: string): { usedRuns: number; maxRuns: number | null } {
    const entitlement = this.requireEntitlement(entitlementId);
    const key = `${entitlementId}:${runRef}`;
    if (!this.usageRunRefs.has(key)) {
      this.usageRunRefs.add(key);
      entitlement.usageLimits = {
        ...entitlement.usageLimits,
        usedRuns: entitlement.usageLimits.usedRuns + 1,
      };
    }
    return { usedRuns: entitlement.usageLimits.usedRuns, maxRuns: entitlement.usageLimits.maxRuns };
  }

  /** Whether a runRef was already counted for an entitlement (idempotency). */
  isUsageRecorded(entitlementId: SportaId, runRef: string): boolean {
    return this.usageRunRefs.has(`${entitlementId}:${runRef}`);
  }

  /** Read one entitlement. */
  readEntitlement(entitlementId: SportaId): TransformEntitlement | null {
    return this.entitlements.get(entitlementId) ?? null;
  }

  /**
   * The entitlement pinning the listing's current release for a
   * principal, if any — revoked/expired records are returned so the
   * admission lane can type the exact refusal.
   */
  entitlementForCurrentRelease(
    principal: string,
    listing: TransformListing,
  ): TransformEntitlement | null {
    const candidates = [...this.entitlements.values()].filter(
      (entitlement) =>
        entitlement.principal === principal &&
        entitlement.pipelineId === listing.pipelineId &&
        entitlement.releaseDigest === listing.currentRelease.releaseDigest &&
        entitlement.version === listing.currentRelease.version,
    );
    // Latest first: the most recent state of the principal's access.
    return candidates.sort((left, right) => (left.grantedAt < right.grantedAt ? 1 : -1))[0] ?? null;
  }

  /** Mark an entitlement expired (observed at admission; typed, visible). */
  markExpired(entitlementId: SportaId): TransformEntitlement | null {
    const entitlement = this.entitlements.get(entitlementId);
    if (entitlement === undefined) return null;
    if (entitlement.status === "active") {
      entitlement.status = "expired";
    }
    return entitlement;
  }

  private findActiveEntitlement(principal: string, listing: TransformListing): TransformEntitlement | null {
    const candidates = [...this.entitlements.values()].filter(
      (entitlement) =>
        entitlement.principal === principal &&
        entitlement.status === "active" &&
        entitlement.pipelineId === listing.pipelineId &&
        entitlement.releaseDigest === listing.currentRelease.releaseDigest &&
        entitlement.version === listing.currentRelease.version,
    );
    return candidates.sort((left, right) => (left.grantedAt < right.grantedAt ? 1 : -1))[0] ?? null;
  }

  private requireEntitlement(entitlementId: SportaId): TransformEntitlement {
    const entitlement = this.entitlements.get(entitlementId);
    if (entitlement === undefined) {
      throw new MarketplaceEntitlementError(
        `entitlement ${entitlementId} not found`,
        "unknown-entitlement",
        entitlementId,
      );
    }
    return entitlement;
  }
}

/** The derived retry-safe key (pure; exported for tests). */
export function deriveIdempotencyKey(
  principal: string,
  listing: TransformListing,
  purchaseRef: string,
): string {
  return `idem:${fnv1aHex(
    stableStringify({
      principal,
      pipelineId: listing.pipelineId,
      version: listing.currentRelease.version,
      releaseDigest: listing.currentRelease.releaseDigest,
      purchaseRef,
    }),
  )}`;
}

/** Offer kind helper (pure). */
export function offerCharges(offer: TransformOfferTerms): boolean {
  return offer.kind !== "free" && offer.price !== null;
}
