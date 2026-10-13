/**
 * W9B-3 tests — offers, entitlements, idempotent settlement.
 *
 * Gates: P9-11 (free releases pass the same gates as paid; paid
 * authorization/settlement retries are idempotent) and the offer/
 * price fields of P9-12.
 *
 * EVIDENCE CLASS: fixture CONTENT, REAL process observations — the
 * settlement adapter is FIXTURE-labeled; the idempotency accounting
 * (one ledger record, duplicate flags, attempt counters) is REAL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FixtureSettlementAdapter,
  MarketplaceEntitlementError,
  REQUIRED_REVIEW_ROLES,
  DECLARED_AUTOMATED_CHECK_IDS,
  deriveIdempotencyKey,
  type TransformEntitlement,
} from "../src/contract.js";
import {
  FREE_OFFER,
    PAID_OFFER,
  makeWorld,
  publishRelease,
  satisfyingRightsSnapshot,
} from "./helpers.js";

test("P9-11 (lock 29): free and paid releases pass EQUAL gates end-to-end", async () => {
  const world = makeWorld();
  const free = publishRelease(world, { pipelineId: "pipe:eq-free", version: "1.0.0", salt: "eq-free", offer: FREE_OFFER });
  const paid = publishRelease(world, { pipelineId: "pipe:eq-paid", version: "1.0.0", salt: "eq-paid", offer: PAID_OFFER });

  // The durable decisions carry identical automated check ids and
  // identical human role coverage — the gates never saw the price.
  assert.deepEqual(
    free.decision.automatedChecks.map((check) => check.checkId),
    [...DECLARED_AUTOMATED_CHECK_IDS],
  );
  assert.deepEqual(
    paid.decision.automatedChecks.map((check) => check.checkId),
    [...DECLARED_AUTOMATED_CHECK_IDS],
  );
  assert.deepEqual(
    free.decision.humanReview.map((review) => review.role).sort(),
    [...REQUIRED_REVIEW_ROLES].sort(),
  );
  assert.deepEqual(
    paid.decision.humanReview.map((review) => review.role).sort(),
    [...REQUIRED_REVIEW_ROLES].sort(),
  );
  // Both listings are PUBLISHED through the same single path.
  assert.equal(free.listing.status, "PUBLISHED");
  assert.equal(paid.listing.status, "PUBLISHED");
});

test("P9-11: free grant never settles — settlementRef null, ledger untouched", async () => {
  const world = makeWorld();
  const { listing } = publishRelease(world, { pipelineId: "pipe:free-grant", version: "1.0.0", salt: "free-grant", offer: FREE_OFFER });
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:free",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(entitlement.offerKind, "free");
  assert.equal(entitlement.settlementRef, null);
  assert.ok(entitlement.idempotencyKey.length > 0);
  assert.equal(entitlement.status, "active");
  assert.equal(entitlement.usageLimits.usedRuns, 0);
  assert.equal(world.settlement.size(), 0);
});

test("P9-11: two identical authorize calls produce ONE settlement record (the exact law)", async () => {
  const adapter = new FixtureSettlementAdapter();
  const request = {
    idempotencyKey: "idem:law-test",
    principal: "user:law",
    offerRef: "list:x@1.0.0",
    amount: { amount: 5, currency: "USD" },
    requestedAt: "2026-10-13T00:00:00.000Z",
  };
  const first = await adapter.authorize(request);
  const second = await adapter.authorize(request);
  assert.equal(adapter.size(), 1);
  assert.equal(first.status, "settled");
  assert.equal(first.duplicate, false);
  assert.equal(first.attempts, 1);
  assert.equal(second.status, "settled");
  assert.equal(second.settlementId, first.settlementId);
  assert.equal(second.duplicate, true);
  assert.equal(second.attempts, 2);
  assert.ok(second.detail.includes("not charged again"));
});

test("P9-11: paid grant settles once; a retried grant charges nothing again", async () => {
  const world = makeWorld();
  const { listing } = publishRelease(world, { pipelineId: "pipe:paid-grant", version: "1.0.0", salt: "paid-grant", offer: PAID_OFFER });

  const first = await world.entitlements.grantEntitlement({
    principal: "user:paid",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(first.offerKind, "paid-per-run");
  assert.ok(first.settlementRef !== null);
  assert.equal(world.settlement.size(), 1);

  // The retry: identical grant input -> the SAME entitlement, no new
  // charge (idempotent issuance; the port-level retry law is proven
  // by the two-identical-authorize-calls test below).
  const second = await world.entitlements.grantEntitlement({
    principal: "user:paid",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(second.entitlementId, first.entitlementId);
  assert.equal(second.settlementRef, first.settlementRef);
  assert.equal(world.settlement.size(), 1);
  const [record] = world.settlement.records();
  assert.equal(record?.attempts, 1);

  // A repurchase after revocation (new purchaseRef, no active
  // entitlement) settles again under its own key.
  world.entitlements.revokeEntitlement(first.entitlementId, { by: "operator:test", reason: "repurchase flow" });
  const repurchase = await world.entitlements.grantEntitlement({
    principal: "user:paid",
    listingId: listing.listingId,
    purchaseRef: "po-2",
  });
  assert.equal(world.settlement.size(), 2);
  assert.notEqual(repurchase.entitlementId, first.entitlementId);
  assert.notEqual(repurchase.settlementRef, first.settlementRef);
});

test("P9-11: the derived idempotency key is stable for identical inputs (pure function)", async () => {
  const world = makeWorld();
  const { listing } = publishRelease(world, { pipelineId: "pipe:key", version: "1.0.0", salt: "key", offer: PAID_OFFER });
  const left = deriveIdempotencyKey("user:key", listing, "po-1");
  const right = deriveIdempotencyKey("user:key", listing, "po-1");
  const other = deriveIdempotencyKey("user:key", listing, "po-2");
  assert.equal(left, right);
  assert.notEqual(left, other);
});

test("P9-11: refused settlement leaves NO entitlement (typed error)", async () => {
  const world = makeWorld({
    refuseSettlement: (request) => request.principal === "user:refused",
  });
  const { listing } = publishRelease(world, { pipelineId: "pipe:refused", version: "1.0.0", salt: "refused", offer: PAID_OFFER });
  await assert.rejects(
    () =>
      world.entitlements.grantEntitlement({
        principal: "user:refused",
        listingId: listing.listingId,
        purchaseRef: "po-1",
      }),
    (error: unknown) => error instanceof MarketplaceEntitlementError && error.refusalKind === "settlement-refused",
  );
  const selection = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:refused",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(selection.admitted, false);
  assert.equal(selection.reason, "no-entitlement");
});

test("entitlement lifecycle: revocation blocks the next admission, record preserved", async () => {
  const world = makeWorld();
  const { listing } = publishRelease(world, { pipelineId: "pipe:revoke", version: "1.0.0", salt: "revoke", offer: FREE_OFFER });
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:revoke",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  const first = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:revoke",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(first.admitted, true);

  const revoked = world.entitlements.revokeEntitlement(entitlement.entitlementId, {
    by: "operator:test",
    reason: "chargeback",
  });
  assert.equal(revoked.status, "revoked");
  assert.ok(revoked.revokedAt !== null);

  const refused = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:revoke",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:2",
  });
  assert.equal(refused.admitted, false);
  assert.equal(refused.reason, "entitlement-revoked");
  // Double revocation is a typed error (no silent state loss).
  assert.throws(
    () => world.entitlements.revokeEntitlement(entitlement.entitlementId, { by: "operator:test", reason: "again" }),
    (error: unknown) => error instanceof MarketplaceEntitlementError && error.refusalKind === "already-revoked",
  );
});

test("entitlement lifecycle: expiry is checked at admission and recorded visibly", async () => {
  const world = makeWorld();
  const expiresAt = "2026-10-13T01:00:00.000Z";
  const { listing } = publishRelease(world, {
    pipelineId: "pipe:expiry",
    version: "1.0.0",
    salt: "expiry",
    offer: { ...FREE_OFFER, usageLimits: { maxRuns: null, expiresAt } },
  });
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:expiry",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(entitlement.usageLimits.expiresAt, expiresAt);

  const before = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:expiry",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(before.admitted, true);

  world.clock.advancePast(expiresAt);
  const after = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:expiry",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:2",
  });
  assert.equal(after.admitted, false);
  assert.equal(after.reason, "entitlement-expired");
  const observed: TransformEntitlement | null = world.entitlements.readEntitlement(entitlement.entitlementId);
  assert.ok(observed !== null);
  assert.equal(observed.status, "expired");
});

test("usage limits: honest counters — idempotent per runRef, exhausted blocks new runs", async () => {
  const world = makeWorld();
  const { listing } = publishRelease(world, {
    pipelineId: "pipe:usage",
    version: "1.0.0",
    salt: "usage",
    offer: { ...FREE_OFFER, usageLimits: { maxRuns: 2, expiresAt: null } },
  });
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:usage",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });

  const run1 = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:usage",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(run1.admitted, true);
  const run2 = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:usage",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:2",
  });
  assert.equal(run2.admitted, true);
  assert.equal(world.entitlements.readEntitlement(entitlement.entitlementId)?.usageLimits.usedRuns, 2);

  // A retried admission of an ALREADY-COUNTED run re-admits (idempotent).
  const run2Retry = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:usage",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:2",
  });
  assert.equal(run2Retry.admitted, true);
  assert.equal(world.entitlements.readEntitlement(entitlement.entitlementId)?.usageLimits.usedRuns, 2);

  // A genuinely new run refuses with the typed reason.
  const run3 = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:usage",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:3",
  });
  assert.equal(run3.admitted, false);
  assert.equal(run3.reason, "usage-limit-exhausted");
});

test("usage limits: recordUsage is idempotent per runRef directly", async () => {
  const world = makeWorld();
  const { listing } = publishRelease(world, {
    pipelineId: "pipe:record",
    version: "1.0.0",
    salt: "record",
    offer: { ...FREE_OFFER, usageLimits: { maxRuns: 10, expiresAt: null } },
  });
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:record",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  const first = world.entitlements.recordUsage(entitlement.entitlementId, "run:x");
  const second = world.entitlements.recordUsage(entitlement.entitlementId, "run:x");
  assert.equal(first.usedRuns, 1);
  assert.equal(second.usedRuns, 1);
  assert.equal(world.entitlements.readEntitlement(entitlement.entitlementId)?.usageLimits.usedRuns, 1);
});
