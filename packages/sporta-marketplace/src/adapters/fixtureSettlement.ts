/**
 * FIXTURE settlement adapter (adapters layer) — clearly labeled.
 *
 * EVIDENCE CLASS: FIXTURE. This is NOT a real payment provider; it
 * is a deterministic, in-memory stand-in so the idempotency law is
 * testable before a real provider plugs the same port. Behavior:
 *
 * - `authorize` is idempotent by key: a second identical call
 *   returns the SAME settlement with `duplicate: true` and an
 *   incremented `attempts` counter — one ledger record, never a
 *   second charge (P9-11).
 * - An optional `refuseWhen` predicate drives the refusal lane for
 *   tests; refusals are terminal for that key.
 * - `settlementId` is deterministic (fnv1a of the key) so retries
 *   observe byte-identical references.
 */
import type {
  SettlementAuthorizeRequest,
  SettlementPort,
  SettlementRecord,
} from "../domain/paymentPort.js";
import { fnv1aHex } from "../domain/stable.js";

/** Constructor options (fixture knobs, honestly labeled). */
export interface FixtureSettlementAdapterOptions {
  /** Fixture refusal predicate (tests only). */
  refuseWhen?: (request: SettlementAuthorizeRequest) => boolean;
}

/** Deterministic FIXTURE settlement ledger entry. */
interface FixtureLedgerEntry {
  record: SettlementRecord;
  attempts: number;
}

export class FixtureSettlementAdapter implements SettlementPort {
  private readonly refuseWhen: (request: SettlementAuthorizeRequest) => boolean;
  private readonly ledger = new Map<string, FixtureLedgerEntry>();

  constructor(options: FixtureSettlementAdapterOptions = {}) {
    this.refuseWhen = options.refuseWhen ?? (() => false);
  }

  async authorize(request: SettlementAuthorizeRequest): Promise<SettlementRecord> {
    const existing = this.ledger.get(request.idempotencyKey);
    if (existing !== undefined) {
      existing.attempts += 1;
      const retry: SettlementRecord = {
        ...existing.record,
        duplicate: true,
        attempts: existing.attempts,
        detail: `${existing.record.detail} (retry ${existing.attempts}: idempotent, not charged again)`,
      };
      existing.record = retry;
      return retry;
    }
    const refused = this.refuseWhen(request);
    const record: SettlementRecord = {
      settlementId: `setl:fixture:${fnv1aHex(request.idempotencyKey)}`,
      idempotencyKey: request.idempotencyKey,
      status: refused ? "refused" : "settled",
      amount: request.amount,
      settledAt: refused ? null : request.requestedAt,
      duplicate: false,
      attempts: 1,
      detail: refused
        ? "FIXTURE settlement refused by the fixture refusal predicate"
        : "FIXTURE settlement settled (deterministic test adapter — not a real charge)",
    };
    this.ledger.set(request.idempotencyKey, { record, attempts: 1 });
    return record;
  }

  /** The ledger contents (fixture evidence for tests). */
  records(): readonly SettlementRecord[] {
    return [...this.ledger.values()].map((entry) => entry.record);
  }

  /** Ledger size — the one-settlement-record assertion (P9-11). */
  size(): number {
    return this.ledger.size;
  }
}
