# PAYMENT-TYPED-FUTURE — operator key request: real payment provider settlement

Status: **TYPED-FUTURE — operator-credential-gated. NO implementation exists or is
claimed by this document.** Recorded by w10b (P10 Lane W10-B) per the ADR's
non-goals table and acceptance gate P10-10.

## The operator key request

**Ask:** the operator provisions payment-provider credentials (a PSP API key /
merchant credentials) into the station vault for the Sporta settlement lane.
Until those keys exist, settlement stays on the clearly-labeled
`FixtureSettlementAdapter` — fixture evidence is never reported as real
settlement, exactly as the fixture's own header law states.

## The exact seam a real provider would implement (already frozen, no contract change needed)

The provider-neutral settlement port lives in
`packages/sporta-marketplace/src/domain/paymentPort.ts` and is public through
`@sporta/marketplace/contract`:

```ts
interface SettlementPort {
  readonly providerId: string;
  authorize(request: TransformSettlementRequest): Promise<TransformSettlementResult>;
}
```

- `TransformSettlementRequest`: `{ principal, pipelineId, version,
  releaseDigest, offer, idempotencyKey }` — retries MUST reuse the same
  idempotency key; a provider may never double-charge one key (P9-11).
- `TransformSettlementResult`: settled (with the durable
  `TransformSettlementRecord` — settlementId, attempts-counted, providerId,
  settledAt, amount/currency) or refused with the frozen five-kind refusal
  vocabulary (`provider-unavailable | quota-exhausted |
  credentials-missing | policy-denied | unsupported-operation`).
- Idempotency key derivation already exists:
  `settlementIdempotencyKeyPreimage` (deterministic over principal +
  pipeline + version + release digest + offer terms).

## The laws a real adapter must hold (already on record)

1. **Payments are adapters, never marketplace authority.** Entitlement state
   stays marketplace-owned; the provider authorizes a chargeable offer once
   per idempotency key (`paymentPort.ts` header law).
2. **Outage is typed refusal, never fabrication** — the P10 ADR rule 14 and
   the same frozen refusal set this lane's model adapter maps onto
   (`SandboxModelAdapter` in this providers root is the working precedent).
3. **Honest evidence:** a real adapter reports real amounts only when the
   provider actually charged; anything else is `credentials-missing` /
   `provider-unavailable` — never a guessed number.
4. **Placement doctrine (precedent):** the frozen `sporta-*` packages stay
   external-dep-free; a real PSP adapter carrying an SDK/credentials is a
   HOST-layer lane injected through the frozen port (the same placement law
   this providers root demonstrates for `z-ai-web-dev-sdk` in the web
   package). The concrete root is the future lane's work-order decision.

## What exists today (honest inventory)

- `FixtureSettlementAdapter` (`packages/sporta-marketplace/src/adapters/
  fixtureSettlement.ts`): labeled FIXTURE — deterministic, idempotent per
  key, attempt-counted, optionally refusing by configuration. It PROVES the
  port law; it never moves real money.
- `EntitlementService` composes settlement through the port only
  (`packages/web/src/sporta/studioComposition.ts` — the working wiring).

**No real payment implementation is claimed anywhere in this tree.**
