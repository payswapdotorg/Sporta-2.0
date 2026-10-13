/**
 * W9B-1 / P9-08 (human review) tests.
 *
 * EVIDENCE CLASS: fixture reviewers (honestly labeled), REAL decision
 * records, REAL typed refusals and digest byte-equality assertions.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REQUIRED_REVIEW_ROLES,
  TransformCheckLaneError,
  TransformListingError,
  TransformReviewError,
} from "../src/contract.js";
import { makeCandidateInput, makeManifest, makeWorld, threeRoleSignoff } from "./helpers.js";

/** Submit a candidate and run a CLEAN check lane (helper for review tests). */
function submittedClean(world: ReturnType<typeof makeWorld>) {
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  const submitted = world.submission.submitCandidate(draft.candidateId);
  world.submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: null,
  });
  return { draft, submitted };
}

test("approval requires ALL THREE roles: product, rights, security (P9-08)", () => {
  const world = makeWorld();
  const { draft } = submittedClean(world);
  assert.throws(
    () =>
      world.review.recordReviewDecision({
        candidateId: draft.candidateId,
        outcome: "approved",
        humanReview: threeRoleSignoff().filter((entry) => entry.role !== "security"),
        rationale: "missing security",
        policyVersion: "policy:test-v1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformReviewError);
      assert.match(error.refusalKind, /missing-reviewer-role/);
      assert.match(error.message, /security/);
      return true;
    },
  );
  assert.deepEqual([...REQUIRED_REVIEW_ROLES].sort(), ["product", "rights", "security"]);
});

test("approval over a FAILED gate check is refused — humans cannot approve over a failed gate (P9-08)", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(
    makeCandidateInput("1.0.0", {
      attestations: [{ kind: "license", reference: "license:1.0.0" }], // no SBOM -> gate fail
    }),
  );
  world.submission.submitCandidate(draft.candidateId);
  assert.throws(
    () =>
      world.submission.runAutomatedChecks(draft.candidateId, {
        dependencySignals: { "trim-script": "clean" },
        similaritySignal: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformCheckLaneError);
      return true;
    },
  );
  assert.throws(
    () =>
      world.review.recordReviewDecision({
        candidateId: draft.candidateId,
        outcome: "approved",
        humanReview: threeRoleSignoff(),
        rationale: "approve over failed gate",
        policyVersion: "policy:test-v1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformReviewError);
      assert.match(error.refusalKind, /automated-checks-failed/);
      return true;
    },
  );
});

test("an approved decision pins the candidate digest byte-exactly, carries checks verbatim, advances to APPROVED", () => {
  const world = makeWorld();
  const { draft, submitted } = submittedClean(world);
  const decision = world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: threeRoleSignoff(),
    rationale: "fixture content, real gates",
    policyVersion: "policy:test-v1",
  });
  // BYTE-EQUALITY: the decision certifies the exact frozen digest.
  assert.equal(decision.candidateDigest, submitted.candidateDigest);
  assert.equal(decision.outcome, "approved");
  assert.deepEqual(decision.humanReview.map((entry) => entry.role).sort(), [
    "product",
    "rights",
    "security",
  ]);
  // The decision carries the automated check evidence verbatim (frozen shape):
  const lane = world.lanes.byCandidate(draft.candidateId);
  assert.ok(lane !== null);
  assert.deepEqual(
    decision.automatedChecks,
    lane.results.map((result) => ({
      checkId: result.checkId,
      outcome: result.outcome,
      evidenceKind: result.evidenceKind,
    })),
  );
  assert.equal(world.submission.readCandidate(draft.candidateId).lifecycle, "APPROVED");
});

test("rejection prevents publication and is terminal (P9-10)", () => {
  const world = makeWorld();
  const { draft } = submittedClean(world);
  world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "rejected",
    humanReview: [threeRoleSignoff()[0]!],
    rationale: "fixture rejection",
    policyVersion: "policy:test-v1",
  });
  assert.equal(world.submission.readCandidate(draft.candidateId).lifecycle, "REJECTED");
  assert.throws(
    () =>
      world.listing.publishApprovedRelease({
        candidateId: draft.candidateId,
        ...basePublishInput(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      assert.ok(error.refusalKind.includes("candidate-not-approved"));
      return true;
    },
  );
});

test("changes-requested prevents publication and is terminal (P9-10)", () => {
  const world = makeWorld();
  const { draft } = submittedClean(world);
  world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "changes-requested",
    humanReview: [threeRoleSignoff()[1]!],
    rationale: "fixture changes request",
    policyVersion: "policy:test-v1",
  });
  assert.equal(world.submission.readCandidate(draft.candidateId).lifecycle, "CHANGES_REQUESTED");
  assert.throws(
    () =>
      world.listing.publishApprovedRelease({
        candidateId: draft.candidateId,
        ...basePublishInput(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      return true;
    },
  );
});

test("a decision without an automated check lane on record is refused (checks precede review, P9-08)", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  assert.throws(
    () =>
      world.review.recordReviewDecision({
        candidateId: draft.candidateId,
        outcome: "approved",
        humanReview: threeRoleSignoff(),
        rationale: "no lane",
        policyVersion: "policy:test-v1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformReviewError);
      assert.match(error.refusalKind, /automated-checks-missing/);
      return true;
    },
  );
});

test("durable re-record is idempotent: the same decision record returns unchanged", () => {
  const world = makeWorld();
  const { draft } = submittedClean(world);
  const first = world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: threeRoleSignoff(),
    rationale: "first",
    policyVersion: "policy:test-v1",
  });
  const second = world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: threeRoleSignoff(),
    rationale: "durable re-record",
    policyVersion: "policy:test-v1",
  });
  assert.equal(second.decisionId, first.decisionId);
  assert.equal(second.rationale, first.rationale);
});

test("post-publication outcomes route to the listing service (single owner law)", () => {
  const world = makeWorld();
  const { draft } = submittedClean(world);
  assert.throws(
    () =>
      world.review.recordReviewDecision({
        candidateId: draft.candidateId,
        outcome: "suspended",
        humanReview: threeRoleSignoff(),
        rationale: "wrong lane",
        policyVersion: "policy:test-v1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformReviewError);
      assert.match(error.refusalKind, /outcome-routes-to-listing-service/);
      return true;
    },
  );
});

test("reviewer identity is part of the record: empty reviewer identities are refused", () => {
  const world = makeWorld();
  const { draft } = submittedClean(world);
  assert.throws(
    () =>
      world.review.recordReviewDecision({
        candidateId: draft.candidateId,
        outcome: "approved",
        humanReview: [
          { role: "product", reviewer: "", reviewedAt: "2026-10-13T01:00:00.000Z" },
          ...threeRoleSignoff().slice(1),
        ],
        rationale: "anonymous reviewer",
        policyVersion: "policy:test-v1",
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformReviewError);
      assert.match(error.refusalKind, /missing-reviewer-identity/);
      return true;
    },
  );
});

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
    offer: {
      kind: "free" as const,
      price: null,
      settlementProviderRef: null,
      usageLimits: { maxRuns: null, expiresAt: null },
      termsLicense: "MIT",
    },
    rightsPrerequisites: ["authorized source footage"],
    changelog: "test",
  };
}
