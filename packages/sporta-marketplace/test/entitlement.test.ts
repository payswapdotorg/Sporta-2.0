/**
 * W9B-3 / P9-11 + P9-12 (offers, entitlements, idempotent settlement)
 * tests.
 *
 * EVIDENCE CLASS: REAL idempotency/counter/refusal assertions over the
 * clearly-labeled FIXTURE settlement adapter (no real money moves; the
 * port law is what is proven).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TransformListingError, TransformSettlementRefusedError } from "../src/contract.js";
import {
  PRINCIPAL,
  freeOffer,
  makeManifest,
  makeWorld,
  paidOffer,
  publishFullLifecycle,
  satisfyingRightsSnapshot,
} from "./helpers.js";

test("free and paid offers share the SAME gates: both refuse publication without approval (lock 29)", async () => {
  const freeWorld = makeWorld();
  const paidWorld = makeWorld();
  const refusals: string[] = [];
  const statuses: string[] = [];
  for (const [world, offer] of [
    [freeWorld, freeOffer()],
    [paidWorld, paidOffer()],
  ] as const) {
    const manifest = makeManifest({ version: "1.0.0" });
    world.manifests.register(manifest);
    const draft = world.submission.startDraft({
      pipelineId: "pipe:test",
      version: "1.0.0",
      manifestDigest: manifest.manifestDigest,
      contentHashes: [{ kind: "code", digest: world.hash.text("code@1.0.0") }],
      attestations: [{ kind: "sbom", reference: "sbom:1.0.0" }],
      submittedBy: "publisher:test",
    });
    world.submission.submitCandidate(draft.candidateId);
    world.submission.runAutomatedChecks(draft.candidateId, {
      dependencySignals: { "trim-script": "clean" },
      similaritySignal: null,
    });
    // NOT approved yet: publication refuses IDENTICALLY for free and paid:
    try {
      world.listing.publishApprovedRelease({
        candidateId: draft.candidateId,
        ...publishInput(offer),
      });
    } catch (error) {
      refusals.push(error instanceof TransformListingError ? error.refusalKind : "unexpected");
    }
    // The same review gates for both, then identical publication:
    world.review.recordReviewDecision({
      candidateId: draft.candidateId,
      outcome: "approved",
      humanReview: [
        {
          role: "product",
          reviewer: "reviewer:product-fixture",
          reviewedAt: "2026-10-13T01:00:00.000Z",
        },
        {
          role: "rights",
          reviewer: "reviewer:rights-fixture",
          reviewedAt: "2026-10-13T01:01:00.000Z",
        },
        {
          role: "security",
          reviewer: "reviewer:security-fixture",
          reviewedAt: "2026-10-13T01:02:00.000Z",
        },
      ],
      rationale: "fixture content, real gates",
      policyVersion: "policy:test-v1",
    });
    statuses.push(
      world.listing.publishApprovedRelease({
        candidateId: draft.candidateId,
        ...publishInput(offer),
      }).status,
    );
  }
  assert.deepEqual(refusals, ["listing:candidate-not-approved", "listing:candidate-not-approved"]);
  assert.deepEqual(statuses, ["PUBLISHED", "PUBLISHED"]);
});

test("paid grant: two identical authorize calls settle ONCE — one settlement record, one charge, attempts counted (P9-11)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: paidOffer() });
  const first = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  const second = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  // Idempotent grant: the SAME entitlement, never a second issue:
  assert.equal(second.entitlementId, first.entitlementId);

  // THE PORT LAW: two identical authorize calls with the SAME idempotency
  // key -> ONE settlement record, ONE charge, attempts counted:
  const request = {
    principal: PRINCIPAL,
    pipelineId: listing.pipelineId,
    version: listing.currentRelease.version,
    releaseDigest: listing.currentRelease.releaseDigest,
    offer: paidOffer(),
    idempotencyKey: first.idempotencyKey,
  };
  const retryA = await world.settlements.authorize(request);
  const retryB = await world.settlements.authorize(request);
  assert.equal(retryA.settled, true);
  assert.equal(retryB.settled, true);
  if (retryA.settled && retryB.settled) {
    assert.equal(retryA.record.settlementId, retryB.record.settlementId);
    assert.equal(retryA.record.settlementId, first.settlementRef);
    assert.equal(retryA.record.amount, 4.99);
  }

  const records = world.settlements.records();
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record?.idempotencyKey, first.idempotencyKey);
  assert.equal(record?.attempts, 3); // initial grant + two identical retries
  assert.equal(record?.amount, 4.99); // charged ONCE regardless of attempts
  assert.equal(record?.currency, "USD");
  assert.equal(record?.providerId, "fixture-settlement");
  // The entitlement carries the settlement reference (provider is not the authority):
  assert.equal(first.settlementRef, record?.settlementId);
  assert.equal(first.offerKind, "paid-per-run");
});

test("free grant never touches the settlement port", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  const entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  assert.equal(world.settlements.records().length, 0);
  assert.equal(entitlement.settlementRef, null);
  assert.equal(entitlement.offerKind, "free");
});

test("a refused settlement issues NO entitlement (typed refusal, P9-11)", async () => {
  const world = makeWorld({
    settleRefuse: { kind: "provider-unavailable", detail: "fixture refusal" },
  });
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: paidOffer() });
  await assert.rejects(
    () =>
      world.entitlement.grantEntitlement({ principal: PRINCIPAL, listingId: listing.listingId }),
    (error: unknown) => {
      assert.ok(error instanceof TransformSettlementRefusedError);
      assert.match(error.refusalKind, /settlement-refused/);
      return true;
    },
  );
  assert.equal(world.entitlements.listByPrincipal(PRINCIPAL).length, 0);
});

test("revocation blocks admission with the typed entitlement-revoked refusal", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  const entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  const revoked = world.entitlement.revokeEntitlement(entitlement.entitlementId, {
    reason: "fixture refund",
  });
  assert.equal(revoked.status, "revoked");
  assert.ok(revoked.revokedAt !== null);
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "entitlement-revoked");
});

test("expiry is checked at admission and the status flips honestly (entitlement-expired)", async () => {
  const world = makeWorld();
  const expiresAt = "2026-10-13T12:00:00.000Z";
  const { listing } = await publishFullLifecycle(world, {
    version: "1.0.0",
    offer: {
      kind: "free",
      price: null,
      settlementProviderRef: null,
      usageLimits: { maxRuns: null, expiresAt },
      termsLicense: "MIT",
    },
  });
  const entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  assert.equal(entitlement.usageLimits.expiresAt, expiresAt);
  // Before expiry, admission succeeds:
  const before = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(before.admitted, true);
  // At the boundary the entitlement is expired (fail-closed at >=):
  world.clock.advanceTo(expiresAt);
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "entitlement-expired");
  const stored = world.entitlement.readEntitlement(entitlement.entitlementId);
  assert.equal(stored.status, "expired");
});

test("usage limits are honest counters: admissions consume, refusals never do (maxRuns=2)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, {
    version: "1.0.0",
    offer: {
      kind: "free",
      price: null,
      settlementProviderRef: null,
      usageLimits: { maxRuns: 2, expiresAt: null },
      termsLicense: "MIT",
    },
  });
  const entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  assert.equal(entitlement.usageLimits.maxRuns, 2);
  // Two successful admissions consume the limit:
  for (let round = 0; round < 2; round += 1) {
    const selection = world.admission.selectForLaunch({
      listingId: listing.listingId,
      principal: PRINCIPAL,
      rightsSnapshot: satisfyingRightsSnapshot,
    });
    assert.equal(selection.admitted, true);
  }
  assert.equal(
    world.entitlement.readEntitlement(entitlement.entitlementId).usageLimits.usedRuns,
    2,
  );
  // The third refuses typed; the counter never exceeds the limit:
  const third = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(third.admitted, false);
  if (!third.admitted) {
    assert.equal(third.reason, "usage-limit-exhausted");
    assert.match(third.detail, /2\/2/);
  }
  assert.equal(
    world.entitlement.readEntitlement(entitlement.entitlementId).usageLimits.usedRuns,
    2,
  );
  // A rights refusal never consumes a run:
  const refused = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: null,
  });
  assert.equal(refused.admitted, false);
  assert.equal(
    world.entitlement.readEntitlement(entitlement.entitlementId).usageLimits.usedRuns,
    2,
  );
});

function publishInput(offer: ReturnType<typeof freeOffer> | ReturnType<typeof paidOffer>) {
  return {
    title: "Test pipeline",
    description: "fixture-content listing",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["test only"],
    compatibility: ["local"],
    support: "publisher:test",
    offer,
    rightsPrerequisites: ["authorized source footage"],
    changelog: "release",
  };
}
