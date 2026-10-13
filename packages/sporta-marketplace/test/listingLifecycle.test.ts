/**
 * W9B-2 tests — listings, immutable versions, update re-review,
 * suspension/withdrawal/supersession.
 *
 * Gates: P9-09 (material changes require a new version + separate
 * review; v1 remains pinned and reproducible) and P9-10 (rejection,
 * change request, suspension, withdrawal and supersession prevent
 * unauthorized new selection while preserving historical records).
 *
 * EVIDENCE CLASS: fixture CONTENT, REAL process observations — every
 * digest identity, state transition and refusal below is measured.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MarketplaceEntitlementError,
  MarketplaceListingError,
  computeCandidateDigest,
  type TransformListing,
  type TransformReviewDecision,
} from "../src/contract.js";
import {
  FREE_OFFER,
  hash,
  listingInput,
  makeContentHashes,
  makeWorld,
  publishRelease,
  satisfyingRightsSnapshot,
  submitCandidate,
  approveSubmission,
} from "./helpers.js";

test("P9-09: approved release publishes with the exact digest — byte-equality across the chain", async () => {
  const world = makeWorld();
  const { decision, listing, submission } = publishRelease(world, {
    pipelineId: "pipe:v1",
    version: "1.0.0",
    salt: "v1",
  });
  // decision -> candidate (byte-equality)
  assert.equal(decision.candidateDigest, submission.candidateDigest);
  assert.equal(computeCandidateDigest(hash, submission.candidate), submission.candidateDigest);
  // decision -> listing
  assert.equal(listing.currentRelease.releaseDigest, decision.candidateDigest);
  assert.equal(listing.status, "PUBLISHED");
  assert.equal(listing.versionHistory.length, 1);
  assert.equal(listing.versionHistory[0]?.releaseDigest, decision.candidateDigest);
  // decision -> entitlement -> admission
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:test",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(entitlement.releaseDigest, listing.currentRelease.releaseDigest);
  const admitted = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:test",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(admitted.admitted, true);
  if (admitted.admitted) {
    assert.equal(admitted.releaseDigest, decision.candidateDigest);
    assert.equal(admitted.entitlementId, entitlement.entitlementId);
  }
  // Candidate state advanced to PUBLISHED exactly once.
  assert.equal(world.publications.readSubmission(submission.candidate.candidateId)?.state, "PUBLISHED");
});

test("P9-09: an unreviewed update is NOT selectable — v1 stays the only resolvable release", async () => {
  const world = makeWorld();
  const v1 = publishRelease(world, { pipelineId: "pipe:update", version: "1.0.0", salt: "v1" });

  // v2: material change (different source digest), checks clean, NO review.
  const v2 = submitCandidate(world, { pipelineId: "pipe:update", version: "2.0.0", salt: "v2" });
  assert.notEqual(v2.submission.candidateDigest, v1.decision.candidateDigest);
  assert.equal(v2.report?.clean, true);
  assert.equal(world.publications.readSubmission(v2.submission.candidate.candidateId)?.state, "HUMAN_REVIEW");

  // A fabricated approval for the v2 digest cannot publish.
  const fabricated: TransformReviewDecision = {
    ...v1.decision,
    decisionId: "dec:fabricated",
    candidateDigest: v2.submission.candidateDigest,
  };
  assert.throws(
    () => world.listings.publishReviewedRelease(fabricated, listingInput()),
    (error: unknown) =>
      error instanceof MarketplaceListingError &&
      (error.refusalKind === "unknown-decision" || error.refusalKind === "decision-not-approved"),
  );

  // The listing still resolves ONLY the reviewed v1 digest.
  const listing = world.listings.readListing(v1.listing.listingId);
  assert.ok(listing !== null);
  assert.equal(listing.currentRelease.releaseDigest, v1.decision.candidateDigest);
  assert.equal(listing.currentRelease.version, "1.0.0");

  // Entitlements can only be granted against the published listing —
  // there is no path to an entitlement pinning the unreviewed digest.
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:test",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(entitlement.releaseDigest, v1.decision.candidateDigest);
  const admitted = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:test",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(admitted.admitted, true);
  if (admitted.admitted) {
    assert.equal(admitted.releaseDigest, v1.decision.candidateDigest);
  }
});

test("P9-09: material change is detected and recorded (typed evidence, never a bypass)", () => {
  const world = makeWorld();
  const v1 = submitCandidate(world, { pipelineId: "pipe:material", version: "1.0.0", salt: "m1" });
  approveSubmission(world, v1.submission);
  assert.equal(v1.submission.materialChange, null); // first candidate: nothing to compare

  const v2 = submitCandidate(world, { pipelineId: "pipe:material", version: "2.0.0", salt: "m2", runChecks: false });
  const report = v2.submission.materialChange;
  assert.ok(report !== null);
  assert.equal(report.material, true);
  assert.equal(report.fromVersion, "1.0.0");
  assert.equal(report.toVersion, "2.0.0");
  const fields = report.changes.map((change) => change.field);
  assert.ok(fields.includes("manifest-digest"));
  assert.ok(fields.some((field) => field.startsWith("content-hash:")));
  // The v2 candidate still requires its own review (state machine).
  assert.equal(world.publications.readSubmission(v2.submission.candidate.candidateId)?.state, "SUBMITTED");
});

test("P9-09: reviewed v2 publishes — v1 stays listed, pinned and reproducible", async () => {
  const world = makeWorld();
  const v1 = publishRelease(world, { pipelineId: "pipe:versions", version: "1.0.0", salt: "v1" });
  // Entitlement granted BEFORE v2 exists pins the v1 release.
  const v1Entitlement = await world.entitlements.grantEntitlement({
    principal: "user:pinned",
    listingId: v1.listing.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(v1Entitlement.releaseDigest, v1.decision.candidateDigest);

  const v2Submission = submitCandidate(world, { pipelineId: "pipe:versions", version: "2.0.0", salt: "v2" });
  const v2Decision = approveSubmission(world, v2Submission.submission);
  const updated = world.listings.publishReviewedRelease(v2Decision, listingInput({ offer: FREE_OFFER }));

  assert.equal(updated.currentRelease.version, "2.0.0");
  assert.equal(updated.currentRelease.releaseDigest, v2Decision.candidateDigest);
  assert.equal(updated.versionHistory.length, 2);
  // v1 entry UNCHANGED (byte-equal digest, same version).
  const v1Entry = updated.versionHistory.find((entry) => entry.version === "1.0.0");
  assert.ok(v1Entry !== undefined);
  assert.equal(v1Entry.releaseDigest, v1.decision.candidateDigest);
  // The frozen v1 submission is still readable and byte-identical.
  assert.equal(
    world.publications.readSubmissionByDigest(v1.decision.candidateDigest)?.candidateDigest,
    v1.decision.candidateDigest,
  );

  // The v1-pinned entitlement no longer admits (honest pinning, P9-24):
  // the principal must re-entitle for the reviewed v2 release.
  const stale = world.selection.selectForLaunch({
    listingId: updated.listingId,
    principal: "user:pinned",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(stale.admitted, false);
  assert.equal(stale.reason, "no-entitlement");
  // A fresh v2 entitlement admits against the new release digest.
  const v2Entitlement = await world.entitlements.grantEntitlement({
    principal: "user:fresh",
    listingId: updated.listingId,
    purchaseRef: "po-1",
  });
  assert.equal(v2Entitlement.releaseDigest, v2Decision.candidateDigest);
  const admitted = world.selection.selectForLaunch({
    listingId: updated.listingId,
    principal: "user:fresh",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(admitted.admitted, true);
});

test("P9-09: version immutability — duplicate and conflicting publications are typed errors", () => {
  const world = makeWorld();
  const v1 = publishRelease(world, { pipelineId: "pipe:conflict", version: "1.0.0", salt: "v1" });

  // Same digest re-published: duplicate-release.
  assert.throws(
    () => world.listings.publishReviewedRelease(v1.decision, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "duplicate-release",
  );

  // Same version, different digest: version-conflict.
  const other = submitCandidate(world, { pipelineId: "pipe:conflict", version: "1.0.0", salt: "different" });
  const otherDecision = approveSubmission(world, other.submission);
  assert.throws(
    () => world.listings.publishReviewedRelease(otherDecision, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "version-conflict",
  );
});

test("P9-10: suspension blocks new selection, preserves history — frozen record shape", async () => {
  const world = makeWorld();
  const v1 = publishRelease(world, { pipelineId: "pipe:suspend", version: "1.0.0", salt: "v1" });
  await world.entitlements.grantEntitlement({
    principal: "user:test",
    listingId: v1.listing.listingId,
    purchaseRef: "po-1",
  });

  const { suspension, listing } = world.listings.suspendListing(v1.listing.listingId, {
    reason: "rights complaint under investigation",
    suspendedBy: "operator:test",
  });
  assert.equal(suspension.effect, "block-new-runs");
  assert.equal(suspension.listingId, v1.listing.listingId);
  assert.equal(suspension.version, "1.0.0");
  assert.ok(suspension.suspendedAt.length > 0);
  assert.equal(listing.status, "SUSPENDED");

  const refused = world.selection.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: "user:test",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(refused.admitted, false);
  assert.equal(refused.reason, "suspended");
  if (!refused.admitted) assert.ok(refused.detail.includes("history preserved"));

  // History preserved: version history, suspension record, entitlement.
  const after: TransformListing | null = world.listings.readListing(v1.listing.listingId);
  assert.ok(after !== null);
  assert.equal(after.versionHistory.length, 1);
  assert.equal(after.versionHistory[0]?.releaseDigest, v1.decision.candidateDigest);
  assert.equal(world.listings.readSuspensions(v1.listing.listingId).length, 1);
  assert.equal(world.listings.activeSuspension(v1.listing.listingId)?.suspensionId, suspension.suspensionId);

  // Suspension is one-way: no re-suspension, no publishing while suspended.
  assert.throws(
    () => world.listings.suspendListing(v1.listing.listingId, { reason: "again", suspendedBy: "operator:test" }),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "listing-state-terminal",
  );
  const v2 = submitCandidate(world, { pipelineId: "pipe:suspend", version: "2.0.0", salt: "v2" });
  const v2Decision = approveSubmission(world, v2.submission);
  assert.throws(
    () => world.listings.publishReviewedRelease(v2Decision, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "listing-state-terminal",
  );
});

test("P9-10: withdrawal blocks new selection with listing-not-published, history intact", async () => {
  const world = makeWorld();
  const v1 = publishRelease(world, { pipelineId: "pipe:withdraw", version: "1.0.0", salt: "v1" });
  await world.entitlements.grantEntitlement({
    principal: "user:test",
    listingId: v1.listing.listingId,
    purchaseRef: "po-1",
  });
  const withdrawn = world.listings.withdrawListing(v1.listing.listingId, {
    reason: "publisher sunset",
    withdrawnBy: "publisher:test",
  });
  assert.equal(withdrawn.status, "WITHDRAWN");
  const refused = world.selection.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: "user:test",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(refused.admitted, false);
  assert.equal(refused.reason, "listing-not-published");
  assert.equal(withdrawn.versionHistory.length, 1);
  // Withdrawal is terminal: grants against it are typed errors.
  await assert.rejects(
    () =>
      world.entitlements.grantEntitlement({
        principal: "user:late",
        listingId: v1.listing.listingId,
        purchaseRef: "po-1",
      }),
    (error: unknown) => error instanceof MarketplaceEntitlementError && error.refusalKind === "listing-not-published",
  );
});

test("P9-10: supersession blocks new selection, action history recorded", async () => {
  const world = makeWorld();
  const v1 = publishRelease(world, { pipelineId: "pipe:supersede", version: "1.0.0", salt: "v1" });
  await world.entitlements.grantEntitlement({
    principal: "user:test",
    listingId: v1.listing.listingId,
    purchaseRef: "po-1",
  });
  const superseded = world.listings.supersedeListing(v1.listing.listingId, {
    supersededBy: "list:successor",
    reason: "replaced by the unified pipeline",
    actor: "publisher:test",
  });
  assert.equal(superseded.status, "SUPERSEDED");
  const refused = world.selection.selectForLaunch({
    listingId: v1.listing.listingId,
    principal: "user:test",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(refused.admitted, false);
  assert.equal(refused.reason, "listing-not-published");
  const actions = world.listings.readListingActions(v1.listing.listingId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.action, "supersede");
  assert.equal(superseded.versionHistory.length, 1);
});

test("P9-09: an unrecorded decision cannot publish — unknown-decision and decision-not-approved lanes", () => {
  const world = makeWorld();
  const { decision } = publishRelease(world, { pipelineId: "pipe:unknown-dec", version: "1.0.0", salt: "v1" });

  // Lane 1: a digest never submitted at all -> unknown-decision.
  const neverSubmitted: TransformReviewDecision = {
    ...decision,
    decisionId: "dec:not-recorded",
    candidateDigest: `sha256:${"0".repeat(64)}`,
  };
  assert.throws(
    () => world.listings.publishReviewedRelease(neverSubmitted, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "unknown-decision",
  );

  // Lane 2: a submitted-but-unreviewed digest -> decision-not-approved.
  const stranger = submitCandidate(world, { pipelineId: "pipe:stranger", version: "9.9.9", salt: "stranger", runChecks: false });
  const strangerDecision: TransformReviewDecision = {
    ...decision,
    decisionId: "dec:not-recorded",
    candidateDigest: stranger.submission.candidateDigest,
  };
  assert.throws(
    () => world.listings.publishReviewedRelease(strangerDecision, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "decision-not-approved",
  );
});

test("candidate lifecycle: SUBMITTED requires checks before any decision (checks-not-run)", () => {
  const world = makeWorld();
  const { submission } = submitCandidate(world, {
    pipelineId: "pipe:no-checks",
    version: "1.0.0",
    salt: "no-checks",
    runChecks: false,
  });
  assert.throws(
    () =>
      world.publications.recordReviewDecision({
        candidateId: submission.candidate.candidateId,
        outcome: "changes-requested",
        humanReview: [{ role: "product", reviewer: "reviewer:fixture-product", reviewedAt: "2026-10-13T00:00:00.000Z" }],
        policyVersion: "policy:fixture-v1",
        rationale: "fixture",
        evidenceRefs: [],
      }),
    (error: unknown) => error instanceof Error && (error as { refusalKind?: string }).refusalKind === "checks-not-run",
  );
});

test("content-hash fixtures differ per salt (material-change precondition)", () => {
  const first = makeContentHashes("a");
  const second = makeContentHashes("b");
  assert.notEqual(first[0]?.digest, second[0]?.digest);
});
