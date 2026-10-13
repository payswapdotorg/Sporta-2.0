/**
 * W9B-3 — the provider-neutral payment seam (domain layer — pure
 * declarations, exactly the file the work order names).
 *
 * `SettlementPort` is a PROVIDER ADAPTER, never the entitlement
 * authority (lock 29): the marketplace records entitlements; a
 * settlement reference is evidence a charge was authorized. Every
 * chargeable-run authorization carries an idempotency key so retries
 * never double-charge (P9-11). The first slice ships the
 * clearly-labeled FIXTURE adapter (adapters/fixtureSettlement.ts);
 * a real provider plugs the same port without contract changes.
 */
import type { Iso8601 } from "@sporta/contracts/contract";

/** One chargeable authorization request. */
export interface SettlementAuthorizeRequest {
  /** Retry-safe key: identical retries derive identical keys. */
  idempotencyKey: string;
  /** Principal being charged. */
  principal: string;
  /** The offer being settled (listing + version reference). */
  offerRef: string;
  /** Charge amount; null only when the adapter is asked to record a no-charge. */
  amount: { amount: number; currency: string } | null;
  requestedAt: Iso8601;
}

/** The durable settlement record — one per idempotency key. */
export interface SettlementRecord {
  settlementId: string;
  idempotencyKey: string;
  status: "settled" | "refused";
  amount: { amount: number; currency: string } | null;
  settledAt: Iso8601 | null;
  /** True when this call matched an existing settlement (a retry). */
  duplicate: boolean;
  /** How many authorize calls used this key (honest retry accounting). */
  attempts: number;
  detail: string;
}

/**
 * The settlement port. `authorize` is IDEMPOTENT by key: a second
 * identical call returns the SAME settlement with `duplicate: true`
 * and an incremented `attempts` count — never a second charge.
 */
export interface SettlementPort {
  authorize(request: SettlementAuthorizeRequest): Promise<SettlementRecord>;
}
