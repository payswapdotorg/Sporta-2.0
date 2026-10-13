/**
 * W9B-4 / P9-14..17 (fail-closed feed-launch admission + disclosure)
 * tests.
 *
 * EVIDENCE CLASS: REAL — every refusal reason is a typed frozen-shape
 * assertion, digest byte-equality runs end to end, the rights law is
 * exercised against missing/malformed/partial snapshots.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FeedLaunchAdmissionService,
  FixtureManifestSource,
  FixedClock,
  Sha256MarketplaceHash,
  TRANSFORM_LAUNCH_LEGAL_NOTICE,
  TransformManifestUnresolvedError,
} from "../src/contract.js";
import type {
  TransformLaunchDisclosure,
  TransformListingSelectionResult,
  TransformRightsSnapshot,
} from "../src/contract.js";
import {
  PRINCIPAL,
  RIGHTS_PREREQUISITE,
  freeOffer,
  makeWorld,
  paidOffer,
  publishFullLifecycle,
  satisfyingRightsSnapshot,
} from "./helpers.js";

test("happy path: the admitted digest is byte-identical from decision to listing to entitlement to admission", async () => {
  const world = makeWorld();
  const { decision, listing } = await publishFullLifecycle(world, {
    version: "1.0.0",
    offer: freeOffer(),
  });
  const entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: listing.listingId,
  });
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, true);
  if (selection.admitted) {
    // THE digest-identity chain (byte-equality, single source of truth):
    assert.equal(selection.releaseDigest, decision.candidateDigest);
    assert.equal(selection.releaseDigest, listing.currentRelease.releaseDigest);
    assert.equal(selection.releaseDigest, entitlement.releaseDigest);
    assert.equal(selection.entitlementId, entitlement.entitlementId);
    assert.equal(selection.listingId, listing.listingId);
  }
});

test("a missing rights snapshot is the typed rights-prerequisites-unsatisfied refusal — never 'safe because it looks different' (P9-14)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await world.entitlement.grantEntitlement({ principal: PRINCIPAL, listingId: listing.listingId });
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: null,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) {
    assert.equal(selection.reason, "rights-prerequisites-unsatisfied");
    // A missing snapshot lists EVERY prerequisite as unmet — fail-closed,
    // never "safe because it looks different" (P9-14):
    assert.match(selection.detail, /authorized source footage/);
    assert.match(selection.detail, /never "safe because it looks different"/);
  }
});

test("a malformed rights snapshot refuses identically (typed, fail-closed)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await world.entitlement.grantEntitlement({ principal: PRINCIPAL, listingId: listing.listingId });
  const malformed = { satisfied: "yes-trust-me" } as unknown as TransformRightsSnapshot;
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: malformed,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) {
    assert.equal(selection.reason, "rights-prerequisites-unsatisfied");
  }
});

test("a snapshot missing ONE prerequisite refuses and names it (P9-15: distinct tracking, no checkbox bypass)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, {
    version: "1.0.0",
    offer: freeOffer(),
    rightsPrerequisites: ["authorized source footage", "licensed music/graphics"],
  });
  await world.entitlement.grantEntitlement({ principal: PRINCIPAL, listingId: listing.listingId });
  const partial: TransformRightsSnapshot = {
    satisfied: ["authorized source footage"],
    evidenceRefs: ["rights:fixture-authorization"],
  };
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: partial,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) {
    assert.equal(selection.reason, "rights-prerequisites-unsatisfied");
    assert.match(selection.detail, /licensed music\/graphics/);
  }
  // Satisfying EVERY prerequisite explicitly admits:
  const full: TransformRightsSnapshot = {
    satisfied: ["authorized source footage", "licensed music/graphics"],
    evidenceRefs: ["rights:fixture-authorization", "rights:fixture-music"],
  };
  const admitted = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: full,
  });
  assert.equal(admitted.admitted, true);
});

test("no entitlement for the listing's approved releases refuses typed (no-entitlement)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:never-granted",
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "no-entitlement");
});

test("an unknown listing refuses typed (listing-not-published)", () => {
  const world = makeWorld();
  const selection = world.admission.selectForLaunch({
    listingId: "list:does-not-exist",
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "listing-not-published");
});

test("a v1 entitlement stays selectable after v2 publishes — versions never silently switch (P9-24 flavor)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  const v1Entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: v1.listing.listingId,
  });
  const v2 = await publishFullLifecycle(world, { version: "2.0.0", offer: freeOffer() });
  assert.equal(v2.listing.currentRelease.version, "2.0.0");
  // The v1-pinned entitlement still admits — pinned to the v1 digest:
  const selection = world.admission.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, true);
  if (selection.admitted) {
    assert.equal(selection.releaseDigest, v1Entitlement.releaseDigest);
    assert.equal(selection.releaseDigest, v1.listing.versionHistory[0]?.releaseDigest);
    assert.notEqual(selection.releaseDigest, v2.listing.currentRelease.releaseDigest);
  }
});

test("the launch disclosure shows everything P9-12 requires with honest evidence grades and the legal notice", async () => {
  const world = makeWorld();
  const { listing, decision } = await publishFullLifecycle(world, {
    version: "1.0.0",
    offer: paidOffer(),
  });
  const disclosure: TransformLaunchDisclosure = world.admission.buildLaunchDisclosure(
    listing.listingId,
  );
  assert.equal(disclosure.listingId, listing.listingId);
  assert.equal(disclosure.publisher, "publisher:test");
  assert.equal(disclosure.approvedVersion, "1.0.0");
  assert.equal(disclosure.releaseDigest, listing.currentRelease.releaseDigest);
  assert.equal(disclosure.releaseDigest, decision.candidateDigest);
  assert.equal(disclosure.terms.kind, "paid-per-run");
  assert.deepEqual(disclosure.cost, { amount: 4.99, currency: "USD" });
  assert.deepEqual(disclosure.rightsPrerequisites, [RIGHTS_PREREQUISITE]);
  assert.deepEqual(disclosure.dependencies, [
    {
      kind: "code",
      name: "trim-script",
      digest: `sha256:${"d".repeat(64)}`,
      license: "MIT",
    },
  ]);
  assert.deepEqual(disclosure.outputs, ["trimmed event stream"]);
  assert.deepEqual(disclosure.limitations, ["test only"]);
  assert.deepEqual(disclosure.latencyExpectations, {
    typicalLatencyMs: 500,
    declaredThroughput: "single stream",
    evidenceGrade: "fixture",
  });
  assert.equal(disclosure.evidenceGrade, "fixture");
  assert.equal(disclosure.reviewedAt, decision.decidedAt);
  // The fixed legal notice: similarity is NEVER clearance (lock 34):
  assert.equal(disclosure.legalNotice, TRANSFORM_LAUNCH_LEGAL_NOTICE);
  assert.match(disclosure.legalNotice, /never implies legal clearance/);
});

test("disclosure refuses (typed) when the manifest is unresolvable — dependencies are never hidden", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  // Re-wire the admission service against an EMPTY manifest source:
  const blindAdmission = new FeedLaunchAdmissionService({
    clock: new FixedClock("2026-10-13T00:00:00.000Z"),
    hash: new Sha256MarketplaceHash(),
    listings: world.listings,
    entitlements: world.entitlements,
    candidates: world.candidates,
    manifests: new FixtureManifestSource(),
  });
  assert.throws(
    () => blindAdmission.buildLaunchDisclosure(listing.listingId),
    (error: unknown) => {
      assert.ok(error instanceof TransformManifestUnresolvedError);
      assert.match(error.refusalKind, /manifest-unresolved/);
      return true;
    },
  );
});

test("selection results always carry the frozen reason vocabulary (typed, total)", async () => {
  const world = makeWorld();
  const { listing } = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await world.entitlement.grantEntitlement({ principal: PRINCIPAL, listingId: listing.listingId });
  const results: TransformListingSelectionResult[] = [
    world.admission.selectForLaunch({
      listingId: "list:none",
      principal: PRINCIPAL,
      rightsSnapshot: null,
    }),
    world.admission.selectForLaunch({
      listingId: listing.listingId,
      principal: "user:x",
      rightsSnapshot: null,
    }),
    world.admission.selectForLaunch({
      listingId: listing.listingId,
      principal: PRINCIPAL,
      rightsSnapshot: null,
    }),
  ];
  for (const result of results) {
    if (!result.admitted) {
      const allowed: readonly string[] = [
        "listing-not-published",
        "no-entitlement",
        "entitlement-revoked",
        "entitlement-expired",
        "usage-limit-exhausted",
        "rights-prerequisites-unsatisfied",
        "suspended",
      ];
      assert.equal(allowed.includes(result.reason), true);
      assert.ok(result.detail.length > 0);
    }
  }
});
