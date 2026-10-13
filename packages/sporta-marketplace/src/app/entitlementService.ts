/**
 * W9B-3 — the entitlement service (app layer). Free and paid offers
 * under the SAME gates (lock 29: gates live at review/publication, never
 * at the offer), provider-neutral idempotent settlement (P9-11) and the
 * entitlement lifecycle (active/revoked/expired with honest counters).
 *
 * The payment provider is NEVER the entitlement authority: settlement
 * adapters authorize a charge once per idempotency key; entitlement
 * state is marketplace-owned. Expiry is checked at admission (the
 * admission service); this service owns grant/revoke.
 */
import type {
  SportaId,
  TransformEntitlement,
  TransformListing,
} from "@sporta/marketplace/contract";
import type {
  EntitlementStorePort,
  ListingStorePort,
  MarketplaceClock,
  MarketplaceHashPort,
} from "../domain/ports.js";
import type { SettlementPort } from "../domain/paymentPort.js";
import { settlementIdempotencyKeyPreimage } from "../domain/paymentPort.js";
import {
  TransformListingError,
  TransformSettlementRefusedError,
  TransformUnknownRecordError,
} from "../domain/errors.js";
import { idFromDigest } from "../domain/stable.js";

/** Constructor dependencies — the settlement adapter is injected. */
export interface EntitlementServiceDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  listings: ListingStorePort;
  entitlements: EntitlementStorePort;
  settlements: SettlementPort;
}

export class EntitlementService {
  private readonly deps: EntitlementServiceDeps;

  constructor(deps: EntitlementServiceDeps) {
    this.deps = deps;
  }

  /**
   * Grant an entitlement for the listing's CURRENT approved release.
   * Requires a PUBLISHED listing (no new entitlements for
   * suspended/withdrawn/superseded listings — blocking new selection).
   * Free offers skip settlement entirely; paid offers authorize through
   * the settlement port with a DERIVED idempotency key so issuance
   * retries reuse the same key and never double-charge. Idempotent per
   * (principal, release): re-grant returns the existing entitlement.
   */
  async grantEntitlement(input: {
    principal: string;
    listingId: SportaId;
  }): Promise<TransformEntitlement> {
    const listing = this.requireListing(input.listingId);
    if (listing.status !== "PUBLISHED") {
      throw new TransformListingError(
        `listing ${listing.listingId} is ${listing.status} — new entitlements require a PUBLISHED listing (P9-10)`,
        "listing-not-published",
      );
    }
    const release = listing.currentRelease;
    const existing = this.deps.entitlements.byPrincipalAndRelease(
      input.principal,
      release.releaseDigest,
    );
    if (existing !== null) return existing;

    const offer = listing.offer;
    const idempotencyKey = this.deps.hash.text(
      settlementIdempotencyKeyPreimage({
        principal: input.principal,
        pipelineId: listing.pipelineId,
        version: release.version,
        releaseDigest: release.releaseDigest,
        offer,
      }),
    );

    let settlementRef: string | null = null;
    if (offer.kind !== "free") {
      if (offer.price === null) {
        throw new TransformListingError(
          `offer kind "${offer.kind}" on listing ${listing.listingId} carries no price — paid offers must declare price and currency`,
          "paid-offer-without-price",
        );
      }
      const result = await this.deps.settlements.authorize({
        principal: input.principal,
        pipelineId: listing.pipelineId,
        version: release.version,
        releaseDigest: release.releaseDigest,
        offer,
        idempotencyKey,
      });
      if (!result.settled) {
        throw new TransformSettlementRefusedError(
          `settlement refused for principal ${input.principal} on listing ${listing.listingId}: ${result.refusal.kind} — ${result.refusal.detail}`,
          idempotencyKey,
          result.settlementId,
        );
      }
      settlementRef = result.record.settlementId;
    }

    const entitlement: TransformEntitlement = {
      entitlementId: idFromDigest(
        "ent",
        this.deps.hash.stable([
          input.principal,
          listing.pipelineId,
          release.version,
          release.releaseDigest,
        ]),
      ),
      principal: input.principal,
      pipelineId: listing.pipelineId,
      version: release.version,
      releaseDigest: release.releaseDigest,
      offerKind: offer.kind,
      settlementRef,
      idempotencyKey,
      usageLimits: {
        maxRuns: offer.usageLimits.maxRuns,
        usedRuns: 0,
        expiresAt: offer.usageLimits.expiresAt,
      },
      status: "active",
      grantedAt: this.deps.clock.now(),
      revokedAt: null,
    };
    this.deps.entitlements.save(entitlement);
    return entitlement;
  }

  /** Revoke an active entitlement (admission then refuses typed). */
  revokeEntitlement(entitlementId: SportaId, _input: { reason: string }): TransformEntitlement {
    const entitlement = this.requireEntitlement(entitlementId);
    if (entitlement.status === "revoked") {
      return entitlement;
    }
    const revoked: TransformEntitlement = {
      ...entitlement,
      status: "revoked",
      revokedAt: this.deps.clock.now(),
    };
    this.deps.entitlements.save(revoked);
    return revoked;
  }

  /** Read an entitlement (tests/product). */
  readEntitlement(entitlementId: SportaId): TransformEntitlement {
    return this.requireEntitlement(entitlementId);
  }

  /**
   * Mark an entitlement expired when the injected clock has passed its
   * expiry (honest lazy status flip; admission ALSO checks expiry
   * independently — never trust the stored status alone).
   */
  markExpiredIfPast(entitlement: TransformEntitlement): TransformEntitlement {
    const expiresAt = entitlement.usageLimits.expiresAt;
    if (expiresAt === null || entitlement.status !== "active") return entitlement;
    if (this.deps.clock.now() < expiresAt) return entitlement;
    const expired: TransformEntitlement = { ...entitlement, status: "expired" };
    this.deps.entitlements.save(expired);
    return expired;
  }

  private requireListing(listingId: SportaId): TransformListing {
    const listing = this.deps.listings.byId(listingId);
    if (listing === null) {
      throw new TransformUnknownRecordError(`no listing ${listingId}`, "listing", listingId);
    }
    return listing;
  }

  private requireEntitlement(entitlementId: SportaId): TransformEntitlement {
    const entitlement = this.deps.entitlements.byId(entitlementId);
    if (entitlement === null) {
      throw new TransformUnknownRecordError(
        `no entitlement ${entitlementId}`,
        "entitlement",
        entitlementId,
      );
    }
    return entitlement;
  }
}
