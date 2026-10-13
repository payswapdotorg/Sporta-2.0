/**
 * FIXTURE settlement adapter (adapters layer) — EVIDENCE CLASS: FIXTURE.
 *
 * A clearly-labeled deterministic fake of a provider settlement
 * adapter. It exists to PROVE the `SettlementPort` law, never to move
 * real money: idempotent per key (one settlement record per key, one
 * charge), attempt-counted (retry honesty), optionally refusing by
 * configuration (to test the refused-settlement lane). A REAL provider
 * adapter plugs the same port later without contract changes; fixture
 * evidence is never reported as real settlement.
 */
import type { SportaId } from "@sporta/marketplace/contract";
import type {
  SettlementPort,
  TransformSettlementRecord,
  TransformSettlementRequest,
  TransformSettlementResult,
} from "../domain/paymentPort.js";
import { idFromDigest } from "../domain/stable.js";
import { sha256Text } from "./hash.js";

/** Deterministic derivation of the fixture settlement id. */
function settlementIdFor(request: TransformSettlementRequest): SportaId {
  return idFromDigest("setl", sha256Text(request.idempotencyKey));
}

export class FixtureSettlementAdapter implements SettlementPort {
  readonly providerId = "fixture-settlement";

  /** Keyed settlement records — ONE per idempotency key. */
  private readonly settlements = new Map<string, TransformSettlementRecord>();

  /** Refusal configuration: when set, authorize() refuses with this kind+detail. */
  private refuseWith: { kind: "provider-unavailable" | "quota-exhausted"; detail: string } | null;

  constructor(
    options: {
      refuseWith?: { kind: "provider-unavailable" | "quota-exhausted"; detail: string };
    } = {},
  ) {
    this.refuseWith = options.refuseWith ?? null;
  }

  async authorize(request: TransformSettlementRequest): Promise<TransformSettlementResult> {
    const existing = this.settlements.get(request.idempotencyKey);
    if (existing !== undefined) {
      // Idempotent retry: same record, one charge, honest attempt count.
      const retried: TransformSettlementRecord = { ...existing, attempts: existing.attempts + 1 };
      this.settlements.set(request.idempotencyKey, retried);
      return { settled: true, record: retried };
    }
    if (this.refuseWith !== null) {
      return {
        settled: false,
        refusal: { kind: this.refuseWith.kind, detail: this.refuseWith.detail },
        settlementId: null,
      };
    }
    if (request.offer.price === null) {
      return {
        settled: false,
        refusal: {
          kind: "unsupported-operation",
          detail: "fixture settlement refuses a paid authorization without a price",
        },
        settlementId: null,
      };
    }
    const record: TransformSettlementRecord = {
      settlementId: settlementIdFor(request),
      idempotencyKey: request.idempotencyKey,
      principal: request.principal,
      pipelineId: request.pipelineId,
      releaseDigest: request.releaseDigest,
      amount: request.offer.price.amount,
      currency: request.offer.price.currency,
      settledAt: new Date().toISOString(),
      attempts: 1,
      providerId: this.providerId,
    };
    this.settlements.set(request.idempotencyKey, record);
    return { settled: true, record };
  }

  /** All settlement records (fixture introspection for tests). */
  records(): readonly TransformSettlementRecord[] {
    return [...this.settlements.values()];
  }

  /** The single record for one key, when settled (test assertion aid). */
  recordFor(idempotencyKey: string): TransformSettlementRecord | null {
    return this.settlements.get(idempotencyKey) ?? null;
  }
}
