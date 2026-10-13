import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exampleTransformReviewDecision,
  exampleTransformListing,
  exampleTransformEntitlement,
  exampleTransformSuspensionRecord,
  exampleTransformListingSelectionResult,
  exampleTransformCandidateRecord,
  exampleTransformCheckLaneRecord,
  exampleTransformRightsSnapshot,
  exampleTransformLaunchDisclosure,
  exampleTransformListingStateEvent,
} from "../src/contract.example.js";
import type {
  TransformReviewDecision,
  TransformListing,
  TransformEntitlement,
  TransformSuspensionRecord,
  TransformListingSelectionResult,
  TransformLaunchDisclosure,
} from "../src/contract.js";

test("example review decision carries human signoff for every role", () => {
  const decision: TransformReviewDecision = exampleTransformReviewDecision;
  assert.equal(decision.outcome, "approved");
  const roles = decision.humanReview.map((r) => r.role);
  assert.deepEqual([...roles].sort(), ["product", "rights", "security"]);
  assert.equal(decision.candidateDigest.length > 0, true);
});

test("example free listing passes the same gates shape as paid", () => {
  const listing: TransformListing = exampleTransformListing;
  assert.equal(listing.status, "PUBLISHED");
  assert.equal(listing.offer.kind, "free");
  assert.equal(listing.offer.price, null);
  assert.equal(listing.currentRelease.releaseDigest.length > 0, true);
  assert.ok(listing.rightsPrerequisites.length >= 1);
});

test("example entitlement records idempotency and usage honestly", () => {
  const entitlement: TransformEntitlement = exampleTransformEntitlement;
  assert.equal(entitlement.idempotencyKey.length > 0, true);
  assert.equal(entitlement.usageLimits.usedRuns, 0);
  assert.equal(entitlement.status, "active");
});

test("example suspension blocks new runs only", () => {
  const suspension: TransformSuspensionRecord = exampleTransformSuspensionRecord;
  assert.equal(suspension.effect, "block-new-runs");
  assert.ok(suspension.reason.length > 0);
});

test("example selection refusal is fail-closed and typed", () => {
  const selection: TransformListingSelectionResult = exampleTransformListingSelectionResult;
  assert.equal(selection.admitted, false);
  if (!selection.admitted) {
    assert.equal(selection.reason, "rights-prerequisites-unsatisfied");
    assert.ok(selection.detail.length > 0);
  }
});

test("example candidate record is submitted with a frozen digest (P9-07)", () => {
  assert.equal(exampleTransformCandidateRecord.lifecycle, "SUBMITTED");
  assert.ok(exampleTransformCandidateRecord.candidateDigest !== null);
  assert.ok(exampleTransformCandidateRecord.submittedAt !== null);
});

test("example check lane carries typed outcomes with honest evidence kinds", () => {
  const outcomes = exampleTransformCheckLaneRecord.results.map((result) => result.outcome);
  assert.deepEqual([...outcomes].sort(), ["pass", "warn"]);
  const similarity = exampleTransformCheckLaneRecord.results.find(
    (result) => result.checkId === "similarity-signal",
  );
  assert.equal(similarity?.outcome, "warn");
  assert.equal(similarity?.evidenceKind, "fixture");
});

test("example launch disclosure shows the P9-12 record with the fixed legal notice", () => {
  const disclosure: TransformLaunchDisclosure = exampleTransformLaunchDisclosure;
  assert.equal(disclosure.approvedVersion, "1.0.0");
  assert.equal(disclosure.cost, null);
  assert.ok(disclosure.dependencies.length >= 1);
  assert.match(disclosure.legalNotice, /never implies legal clearance/);
  assert.equal(exampleTransformRightsSnapshot.satisfied.length >= 1, true);
});

test("example listing state event records withdrawal provenance (no silent state loss)", () => {
  assert.equal(exampleTransformListingStateEvent.kind, "withdrawn");
  assert.equal(exampleTransformListingStateEvent.effect, "block-new-runs");
  assert.ok(exampleTransformListingStateEvent.actor.length > 0);
});
