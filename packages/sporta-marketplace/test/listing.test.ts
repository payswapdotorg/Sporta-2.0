/**
 * W9B-2 / P9-09 + P9-10 (listings, immutable versions, suspension)
 * tests.
 *
 * EVIDENCE CLASS: REAL — digest byte-equality from decision to listing,
 * append-only version history snapshots, typed state transitions,
 * frozen suspension records.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { TransformListingError, TransformVersionRegressionError } from "../src/contract.js";
import {
  PRINCIPAL,
  freeOffer,
  makeCandidateInput,
  makeManifest,
  makeWorld,
  publishFullLifecycle,
  satisfyingRightsSnapshot,
} from "./helpers.js";

test("publishing an approved release pins the EXACT decision digest and propagates manifest policy (byte-equality)", async () => {
  const world = makeWorld();
  const { submitted, decision, listing } = await publishFullLifecycle(world, {
    version: "1.0.0",
    offer: freeOffer(),
  });
  assert.equal(listing.status, "PUBLISHED");
  assert.equal(listing.currentRelease.releaseDigest, decision.candidateDigest);
  assert.equal(listing.currentRelease.releaseDigest, submitted.candidateDigest);
  assert.equal(listing.currentRelease.version, "1.0.0");
  assert.deepEqual(listing.versionHistory, [
    { version: "1.0.0", releaseDigest: decision.candidateDigest, changelog: "release 1.0.0" },
  ]);
  // PolicySet (rights/privacy/retention) propagates from the reviewed manifest:
  assert.deepEqual(listing.policy, makeManifest({ version: "1.0.0" }).policy);
  assert.deepEqual(listing.expectations, makeManifest({ version: "1.0.0" }).expectations);
});

test("v2 publish appends immutable history: v1 stays byte-identical and reproducible (P9-09)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  const v1HistorySnapshot = structuredClone(v1.listing.versionHistory);
  const v1Digest = v1.listing.currentRelease.releaseDigest;

  const v2 = await publishFullLifecycle(world, { version: "2.0.0", offer: freeOffer() });
  assert.equal(v2.listing.listingId, v1.listing.listingId);
  assert.equal(v2.listing.currentRelease.version, "2.0.0");
  assert.notEqual(v2.listing.currentRelease.releaseDigest, v1Digest);
  // v1 history entry is byte-identical after v2 publishes:
  assert.deepEqual(v2.listing.versionHistory[0], v1HistorySnapshot[0]);
  assert.deepEqual(v2.listing.versionHistory, [
    ...v1HistorySnapshot,
    {
      version: "2.0.0",
      releaseDigest: v2.listing.currentRelease.releaseDigest,
      changelog: "release 2.0.0",
    },
  ]);
  // The v1 candidate record stays PUBLISHED with its own digest (reproducible):
  const v1Record = world.submission.readCandidate(v1.draft.candidateId);
  assert.equal(v1Record.lifecycle, "PUBLISHED");
  assert.equal(v1Record.candidateDigest, v1Digest);
});

test("an UNREVIEWED update is NOT selectable: no approving decision, no entitlement, admission refuses (P9-09 negative lane)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });

  // Creator submits v2 (changed code digest — a material change) but it
  // never reaches a human approving decision:
  const manifestV2 = makeManifest({ version: "2.0.0" });
  world.manifests.register(manifestV2);
  const draftV2 = world.submission.startDraft(
    makeCandidateInput("2.0.0", {
      contentHashes: [
        { kind: "code", digest: world.hash.text("unreviewed-changed-code@2.0.0") },
        { kind: "runtime", digest: world.hash.text("runtime@2.0.0") },
      ],
    }),
  );
  const submittedV2 = world.submission.submitCandidate(draftV2.candidateId);
  world.submission.runAutomatedChecks(draftV2.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: null,
  });

  // Publication of the unreviewed v2 is refused typed:
  assert.throws(
    () =>
      world.listing.publishApprovedRelease({
        candidateId: draftV2.candidateId,
        ...basePublishInput(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      assert.ok(error.refusalKind.includes("candidate-not-approved"));
      return true;
    },
  );

  // The listing still pins v1; admission resolves the v1 digest only:
  const stillV1 = world.listing.readListing(v1.listing.listingId);
  assert.equal(stillV1.currentRelease.releaseDigest, v1.decision.candidateDigest);
  const entitlement = await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: v1.listing.listingId,
  });
  assert.equal(entitlement.releaseDigest, v1.decision.candidateDigest);
  // Any principal holding only a v1 entitlement gets no entitlement for
  // the unreviewed v2 digest (fail-closed, typed reason):
  const otherPrincipalSelection = world.admission.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: "user:holds-nothing",
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(otherPrincipalSelection.admitted, false);
  if (!otherPrincipalSelection.admitted) {
    assert.equal(otherPrincipalSelection.reason, "no-entitlement");
    assert.match(otherPrincipalSelection.detail, /unreviewed digests never resolve/);
  }
  // And the v2 candidate digest appears NOWHERE in the listing:
  const digests = new Set([
    stillV1.currentRelease.releaseDigest,
    ...stillV1.versionHistory.map((entry) => entry.releaseDigest),
  ]);
  assert.equal(digests.has(submittedV2.candidateDigest ?? ""), false);
});

test("publishing a version below the current release is a typed version regression (P9-09)", async () => {
  const world = makeWorld();
  await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await publishFullLifecycle(world, { version: "2.0.0", offer: freeOffer() });
  const mid = await prepareApprovedCandidate(world, "1.5.0");
  assert.throws(
    () =>
      world.listing.publishApprovedRelease({
        candidateId: mid.draft.candidateId,
        ...basePublishInput(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformVersionRegressionError);
      assert.equal(error.refusalKind, "version-regression");
      return true;
    },
  );
});

test("suspension blocks new selection, records the frozen suspension record, preserves history (P9-10)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: v1.listing.listingId,
  });
  const historyBefore = structuredClone(v1.listing.versionHistory);

  const { listing: suspended, suspension } = world.listing.suspendListing(
    v1.listing.listingId,
    { reason: "fixture policy violation" },
    "operator:fixture",
  );
  assert.equal(suspended.status, "SUSPENDED");
  // The FROZEN suspension record shape:
  assert.equal(suspension.listingId, v1.listing.listingId);
  assert.equal(suspension.pipelineId, v1.listing.pipelineId);
  assert.equal(suspension.version, "1.0.0");
  assert.equal(suspension.reason, "fixture policy violation");
  assert.equal(suspension.suspendedBy, "operator:fixture");
  assert.equal(suspension.effect, "block-new-runs");
  assert.match(suspension.suspensionId, /^susp:[0-9a-f]{24}$/);
  // New selection is blocked typed; history is preserved:
  const selection = world.admission.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) {
    assert.equal(selection.reason, "suspended");
    assert.match(selection.detail, /historical runs stay pinned and readable/);
  }
  assert.deepEqual(world.listing.readListing(v1.listing.listingId).versionHistory, historyBefore);
  assert.equal(world.listing.suspensionHistory(v1.listing.listingId).length, 1);
  // No new entitlements while suspended:
  await assert.rejects(
    () =>
      world.entitlement.grantEntitlement({
        principal: "user:new",
        listingId: v1.listing.listingId,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      return true;
    },
  );
});

test("withdrawal blocks selection with listing-not-published and preserves history (P9-10)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: v1.listing.listingId,
  });
  const historyBefore = structuredClone(v1.listing.versionHistory);

  const withdrawn = world.listing.withdrawListing(
    v1.listing.listingId,
    { reason: "fixture creator withdrawal" },
    "publisher:test",
  );
  assert.equal(withdrawn.status, "WITHDRAWN");
  const selection = world.admission.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "listing-not-published");
  assert.deepEqual(world.listing.readListing(v1.listing.listingId).versionHistory, historyBefore);
  // The withdrawal provenance is recorded (no silent state loss):
  const events = world.events.byListing(v1.listing.listingId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "withdrawn");
  assert.equal(events[0]?.actor, "publisher:test");
});

test("supersession blocks selection and preserves history (P9-10)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  await world.entitlement.grantEntitlement({
    principal: PRINCIPAL,
    listingId: v1.listing.listingId,
  });
  const superseded = world.listing.supersedeListing(
    v1.listing.listingId,
    { successorListingId: "list:successor-fixture", reason: "fixture successor listing" },
    "operator:fixture",
  );
  assert.equal(superseded.status, "SUPERSEDED");
  const selection = world.admission.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: satisfyingRightsSnapshot,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "listing-not-published");
  assert.equal(superseded.versionHistory.length, 1);
});

test("a suspended listing takes no new versions in this slice (one-way transitions)", async () => {
  const world = makeWorld();
  const v1 = await publishFullLifecycle(world, { version: "1.0.0", offer: freeOffer() });
  world.listing.suspendListing(
    v1.listing.listingId,
    { reason: "suspend before v2" },
    "operator:fixture",
  );
  const v2 = await prepareApprovedCandidate(world, "2.0.0");
  assert.throws(
    () =>
      world.listing.publishApprovedRelease({
        candidateId: v2.draft.candidateId,
        ...basePublishInput(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      assert.match(error.refusalKind, /listing-not-active/);
      return true;
    },
  );
});

/** Submit + checks + approve (no publish) — for negative publish lanes. */
async function prepareApprovedCandidate(world: ReturnType<typeof makeWorld>, version: string) {
  const manifest = makeManifest({ version });
  world.manifests.register(manifest);
  const draft = world.submission.startDraft(makeCandidateInput(version));
  const submitted = world.submission.submitCandidate(draft.candidateId);
  world.submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: null,
  });
  const decision = world.review.recordReviewDecision({
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
  return { draft, submitted, decision };
}

function basePublishInput() {
  return {
    title: "Test pipeline",
    description: "fixture-content listing",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["test only"],
    compatibility: ["local"],
    support: "publisher:test",
    offer: freeOffer(),
    rightsPrerequisites: ["authorized source footage"],
    changelog: "release",
  };
}
