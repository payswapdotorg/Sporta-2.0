/**
 * Provider-neutral settlement port (domain — pure types, P9-11).
 *
 * Payments are provider ADAPTERS, never marketplace authority: the port
 * authorizes a chargeable offer once per idempotency key; entitlement
 * state stays marketplace-owned. The first slice ships the clearly
 * labeled FIXTURE adapter in `src/adapters/fixtureSettlement.ts`
 * (deterministic, records retry attempts, settles at most once per key).
 */
import type {
  ContentHash,
  Iso8601,
  SportaId,
  TransformOfferTerms,
} from "@sporta/marketplace/contract";

/** One chargeable-offer authorization request. */
export interface TransformSettlementRequest {
  /** Provider-visible id; the principal paying. */
  readonly principal: string;
  readonly pipelineId: SportaId;
  readonly version: string;
  readonly releaseDigest: ContentHash;
  /** The offer terms being charged (amount/currency/kind). */
  readonly offer: TransformOfferTerms;
  /**
   * Idempotency key — retries MUST reuse the same key; a provider may
   * never double-charge one key (P9-11).
   */
  readonly idempotencyKey: string;
}

/** The durable settlement record (one per settled key). */
export interface TransformSettlementRecord {
  readonly settlementId: SportaId;
  readonly idempotencyKey: string;
  readonly principal: string;
  readonly pipelineId: SportaId;
  readonly releaseDigest: ContentHash;
  readonly amount: number;
  readonly currency: string;
  readonly settledAt: Iso8601;
  /** How many authorize attempts arrived with this key (retry honesty). */
  readonly attempts: number;
  /** The provider that settled; never the entitlement authority. */
  readonly providerId: string;
}

/** One authorization outcome — settled (with the record) or refused. */
export type TransformSettlementResult =
  | { readonly settled: true; readonly record: TransformSettlementRecord }
  | {
      readonly settled: false;
      readonly refusal: {
        readonly kind:
          | "provider-unavailable"
          | "quota-exhausted"
          | "credentials-missing"
          | "policy-denied"
          | "unsupported-operation";
        readonly detail: string;
      };
      readonly settlementId: string | null;
    };

/**
 * The settlement port. Implementations MUST be idempotent per
 * idempotency key: repeated authorize calls with the same key return
 * the SAME settlement record (attempt-counted), never a second charge.
 */
export interface SettlementPort {
  readonly providerId: string;
  authorize(request: TransformSettlementRequest): Promise<TransformSettlementResult>;
}

/**
 * Derive the idempotency key for an entitlement issuance: deterministic
 * over (principal, pipeline, version, release digest, offer terms) so
 * issuance retries reuse the SAME key and can never double-charge. The
 * caller's hash port digests the preimage.
 */
export function settlementIdempotencyKeyPreimage(input: {
  principal: string;
  pipelineId: SportaId;
  version: string;
  releaseDigest: ContentHash;
  offer: TransformOfferTerms;
}): string {
  return JSON.stringify([
    input.principal,
    input.pipelineId,
    input.version,
    input.releaseDigest,
    {
      kind: input.offer.kind,
      price: input.offer.price,
      usageLimits: input.offer.usageLimits,
      termsLicense: input.offer.termsLicense,
    },
  ]);
}
