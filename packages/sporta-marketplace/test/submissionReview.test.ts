/**
 * W9B-1 tests — submission lifecycle, automated checks, human review.
 *
 * Gates: P9-07 (drafts private, submission freezes the candidate
 * digest), P9-08 (automated checks + human product/rights/security
 * review before publication), P9-13 (digests, SBOM, licenses,
 * secrets, unsafe-dependency checks recorded before release).
 *
 * EVIDENCE CLASS: fixture CONTENT, REAL process observations — every
 * digest, transition, refusal and decision shape below is measured
 * by real assertions.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECLARED_AUTOMATED_CHECK_IDS,
  MarketplaceListingError,
  MarketplaceReviewError,
  MarketplaceSubmissionError,
  REQUIRED_REVIEW_ROLES,
  computeCandidateDigest,
  requiredReviewGates,
  type TransformReviewDecision,
} from "../src/contract.js";
import {
  fixtureReviewers,
  hash,
  listingInput,
  makeContentHashes,
  makeManifest,
  makeWorld,
  submitCandidate,
  satisfyingRightsSnapshot,
  approveSubmission,
} from "./helpers.js";

test("P9-07: drafts are private — no listing exists while drafting", () => {
  const world = makeWorld();
  const draft = world.publications.registerDraft({
    pipelineId: "pipe:draft-private",
    version: "1.0.0",
    manifestDigest: `sha256:${"b".repeat(64)}`,
    contentHashes: makeContentHashes("draft-1"),
    attestations: [{ kind: "sbom", reference: "sbom:fixture" }],
    createdBy: "creator:test",
  });
  assert.ok(world.publications.readDraft(draft.draftId) !== null);
  // Private: nothing is publicly selectable, no listing was created.
  const selection = world.selection.selectForLaunch({
    listingId: "list:anything",
    principal: "user:test",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(selection.admitted, false);
  assert.equal(selection.reason, "listing-not-published");
});

test("P9-07: submission freezes the candidate digest; the record stays byte-identical", () => {
  const world = makeWorld();
  const { submission } = submitCandidate(world, {
    pipelineId: "pipe:freeze",
    version: "1.0.0",
    salt: "freeze-1",
    runChecks: false,
  });
  const frozen = submission.candidateDigest;
  assert.match(frozen, /^sha256:[0-9a-f]{64}$/);
  // Recompute over the STORED record — byte-identical (REAL assertion).
  const reread = world.publications.readSubmission(submission.candidate.candidateId);
  assert.ok(reread !== null);
  assert.equal(computeCandidateDigest(hash, reread.candidate), frozen);
  // And the digest survives later marketplace activity unchanged.
  submitCandidate(world, { pipelineId: "pipe:other", version: "1.0.0", salt: "other-1", runChecks: false });
  assert.equal(world.publications.readSubmissionByDigest(frozen)?.candidateDigest, frozen);
});

test("P9-07: a frozen submission is immutable — re-submitting the draft is a typed error", () => {
  const world = makeWorld();
  const { draft } = submitCandidate(world, {
    pipelineId: "pipe:immutable",
    version: "1.0.0",
    salt: "immutable-1",
    runChecks: false,
  });
  assert.throws(
    () => world.publications.submitDraft(draft.draftId),
    (error: unknown) => error instanceof MarketplaceSubmissionError && error.refusalKind === "draft-already-submitted",
  );
});

test("P9-09 (preview): a later edit is a NEW candidate with a different digest", () => {
  const world = makeWorld();
  const first = submitCandidate(world, {
    pipelineId: "pipe:edit",
    version: "1.0.0",
    salt: "edit-1",
    runChecks: false,
  });
  const second = submitCandidate(world, {
    pipelineId: "pipe:edit",
    version: "1.1.0",
    salt: "edit-2",
    runChecks: false,
  });
  assert.notEqual(first.submission.candidateDigest, second.submission.candidateDigest);
  assert.notEqual(first.submission.candidate.candidateId, second.submission.candidate.candidateId);
  // The first frozen record is untouched by the second submission.
  assert.equal(
    world.publications.readSubmission(first.submission.candidate.candidateId)?.candidateDigest,
    first.submission.candidateDigest,
  );
});

test("P9-08/P9-13: clean candidate passes all declared checks with typed outcomes", () => {
  const world = makeWorld();
  const { report } = submitCandidate(world, { pipelineId: "pipe:clean", version: "1.0.0", salt: "clean-1" });
  assert.ok(report !== null);
  assert.equal(report.clean, true);
  assert.deepEqual(
    report.checks.map((check) => check.checkId),
    [...DECLARED_AUTOMATED_CHECK_IDS],
  );
  for (const check of report.checks) {
    assert.ok(check.outcome === "pass" || check.outcome === "warn" || check.outcome === "fail");
    assert.ok(check.evidenceKind === "measured" || check.evidenceKind === "fixture");
    assert.ok(check.detail.length > 0);
  }
  const structural = report.checks.filter((check) => check.checkId !== "unsafe-dependency-signal" && check.checkId !== "similarity-signal");
  for (const check of structural) {
    assert.equal(check.outcome, "pass");
    assert.equal(check.evidenceKind, "measured");
  }
  const submission = world.publications.readSubmissionByDigest(report.candidateDigest);
  assert.equal(submission?.state, "HUMAN_REVIEW");
});

test("P9-13: missing SBOM fails closed and blocks the path to human review", () => {
  const world = makeWorld();
  const { report } = submitCandidate(world, {
    pipelineId: "pipe:no-sbom",
    version: "1.0.0",
    salt: "no-sbom",
    withSbom: false,
  });
  assert.ok(report !== null);
  const sbom = report.checks.find((check) => check.checkId === "sbom-presence");
  assert.equal(sbom?.outcome, "fail");
  assert.equal(report.clean, false);
  const submission = world.publications.readSubmissionByDigest(report.candidateDigest);
  assert.equal(submission?.state, "AUTOMATED_CHECKS");
  assert.throws(
    () =>
      world.publications.recordReviewDecision({
        candidateId: submission?.candidate.candidateId ?? "",
        outcome: "approved",
        humanReview: fixtureReviewers(),
        policyVersion: "policy:fixture-v1",
        rationale: "should be impossible",
        evidenceRefs: [],
      }),
    (error: unknown) => error instanceof MarketplaceReviewError && error.refusalKind === "automated-failures-present",
  );
});

test("P9-13: flagged dependency fails the unsafe-dependency check (fixture signal, honest grade)", () => {
  const world = makeWorld({ flaggedDependencies: { "fixture-lib": "CVE-fixture" } });
  const { report } = submitCandidate(world, { pipelineId: "pipe:unsafe-dep", version: "1.0.0", salt: "unsafe-1" });
  assert.ok(report !== null);
  const check = report.checks.find((candidate) => candidate.checkId === "unsafe-dependency-signal");
  assert.equal(check?.outcome, "fail");
  assert.equal(check?.evidenceKind, "fixture");
  assert.ok(check?.detail.includes("fixture-lib"));
});

test("P9-13: declared host secret access fails the graph-validation check (sandbox law)", () => {
  const world = makeWorld();
  const manifest = makeManifest({});
  manifest.nodes[0]!.sandbox.hostSecretAccess = { explicitlyGranted: ["VAULT_TOKEN"] };
  world.manifestStore.register(manifest);
  const { report } = submitCandidate(world, {
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    salt: "secrets-1",
    manifest,
  });
  assert.ok(report !== null);
  const check = report.checks.find((candidate) => candidate.checkId === "graph-validation");
  assert.equal(check?.outcome, "fail");
  assert.ok(check?.detail.includes("host secret"));
});

test("P9-13: malformed content digests fail digest-integrity (fail-closed)", () => {
  const world = makeWorld();
  const { report } = submitCandidate(world, {
    pipelineId: "pipe:bad-digest",
    version: "1.0.0",
    salt: "bad-digest",
    contentHashes: [{ kind: "source", digest: "latest" }],
  });
  assert.ok(report !== null);
  const check = report.checks.find((candidate) => candidate.checkId === "digest-integrity");
  assert.equal(check?.outcome, "fail");
});

test("P9-13: stored-record drift fails digest-integrity (freeze re-verified, REAL)", () => {
  const world = makeWorld();
  const { submission } = submitCandidate(world, {
    pipelineId: "pipe:drift",
    version: "1.0.0",
    salt: "drift-1",
    runChecks: false,
  });
  // Corrupt the stored record after the freeze (simulates store drift).
  const stored = world.publications.readSubmission(submission.candidate.candidateId);
  assert.ok(stored !== null);
  (stored.candidate as { contentHashes: { kind: string; digest: string }[] }).contentHashes.push({
    kind: "sneaky",
    digest: `sha256:${"d".repeat(64)}`,
  });
  const report = world.publications.runAutomatedChecks(submission.candidate.candidateId);
  const check = report.checks.find((candidate) => candidate.checkId === "digest-integrity");
  assert.equal(check?.outcome, "fail");
  assert.ok(check?.detail.includes("drift"));
});

test("P9-13: unresolvable manifest fails every manifest-dependent check (never skipped)", () => {
  const world = makeWorld();
  const manifest = makeManifest({ pipelineId: "pipe:unresolvable", version: "1.0.0" });
  // NOT registered in the manifest store — the seam returns null.
  const { report } = submitCandidate(world, {
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    salt: "unresolvable-1",
    manifest,
    registerManifest: false,
  });
  assert.ok(report !== null);
  for (const checkId of ["graph-validation", "license-presence", "unsafe-dependency-signal"]) {
    const check = report.checks.find((candidate) => candidate.checkId === checkId);
    assert.equal(check?.outcome, "fail", `${checkId} must fail closed`);
  }
});

test("P9-08: approval without all three roles is a typed error (fail-closed)", () => {
  const world = makeWorld();
  const { submission } = submitCandidate(world, { pipelineId: "pipe:roles", version: "1.0.0", salt: "roles-1" });
  const approveWith = (reviews: { role: string; reviewer: string; reviewedAt: string }[]) =>
    world.publications.recordReviewDecision({
      candidateId: submission.candidate.candidateId,
      outcome: "approved",
      humanReview: reviews,
      policyVersion: "policy:fixture-v1",
      rationale: "fixture",
      evidenceRefs: [],
    });
  assert.throws(
    () => approveWith(fixtureReviewers().filter((review) => review.role !== "rights")),
    (error: unknown) => error instanceof MarketplaceReviewError && error.refusalKind === "missing-required-role",
  );
  assert.throws(
    () => approveWith([...fixtureReviewers(), fixtureReviewers()[0]!]),
    (error: unknown) => error instanceof MarketplaceReviewError && error.refusalKind === "duplicate-role",
  );
  const emptyReviewer = fixtureReviewers().map((review) => ({ ...review, reviewer: "" }));
  assert.throws(
    () => approveWith(emptyReviewer),
    (error: unknown) => error instanceof MarketplaceReviewError && error.refusalKind === "malformed-signoff",
  );
  assert.throws(
    () =>
      world.publications.recordReviewDecision({
        candidateId: submission.candidate.candidateId,
        outcome: "approved",
        humanReview: fixtureReviewers(),
        policyVersion: "",
        rationale: "fixture",
        evidenceRefs: [],
      }),
    (error: unknown) => error instanceof MarketplaceReviewError && error.refusalKind === "policy-version-missing",
  );
});

test("P9-08: approval records the durable frozen decision with all roles and check triples", () => {
  const world = makeWorld();
  const { submission, report } = submitCandidate(world, { pipelineId: "pipe:decision", version: "1.0.0", salt: "decision-1" });
  const decision = approveSubmission(world, submission);
  const frozen: TransformReviewDecision = decision;
  assert.equal(frozen.outcome, "approved");
  assert.equal(frozen.candidateDigest, submission.candidateDigest);
  assert.deepEqual(
    frozen.humanReview.map((review) => review.role).sort(),
    [...REQUIRED_REVIEW_ROLES].sort(),
  );
  assert.deepEqual(
    frozen.automatedChecks.map((check) => check.checkId),
    report?.checks.map((check) => check.checkId),
  );
  assert.equal(world.publications.readSubmission(submission.candidate.candidateId)?.state, "APPROVED");
});

test("P9-08/P9-10: changes-requested and rejected prevent publication (only approval lists)", () => {
  const world = makeWorld();
  const changes = submitCandidate(world, { pipelineId: "pipe:changes", version: "1.0.0", salt: "changes-1" });
  const changesDecision = world.publications.recordReviewDecision({
    candidateId: changes.submission.candidate.candidateId,
    outcome: "changes-requested",
    humanReview: [fixtureReviewers()[0]!],
    policyVersion: "policy:fixture-v1",
    rationale: "needs work",
    evidenceRefs: [],
  });
  assert.equal(changesDecision.outcome, "changes-requested");
  assert.throws(
    () => world.listings.publishReviewedRelease(changesDecision, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "decision-not-approved",
  );

  const rejected = submitCandidate(world, { pipelineId: "pipe:rejected", version: "1.0.0", salt: "rejected-1" });
  const rejectedDecision = world.publications.recordReviewDecision({
    candidateId: rejected.submission.candidate.candidateId,
    outcome: "rejected",
    humanReview: [fixtureReviewers()[1]!],
    policyVersion: "policy:fixture-v1",
    rationale: "not suitable",
    evidenceRefs: [],
  });
  assert.equal(rejectedDecision.outcome, "rejected");
  assert.throws(
    () => world.listings.publishReviewedRelease(rejectedDecision, listingInput()),
    (error: unknown) => error instanceof MarketplaceListingError && error.refusalKind === "decision-not-approved",
  );
  // Neither terminal candidate can re-enter review (immutable record).
  assert.throws(
    () => world.publications.runAutomatedChecks(rejected.submission.candidate.candidateId),
    (error: unknown) => error instanceof MarketplaceSubmissionError && error.refusalKind === "state-transition-illegal",
  );
});

test("P9-11 (lock 29): review gates are pure functions of the candidate — free and paid are equal", () => {
  const world = makeWorld();
  const free = submitCandidate(world, { pipelineId: "pipe:free", version: "1.0.0", salt: "free-1", runChecks: false });
  const paid = submitCandidate(world, { pipelineId: "pipe:paid", version: "1.0.0", salt: "paid-1", runChecks: false });
  const freeGates = requiredReviewGates(free.submission.candidate);
  const paidGates = requiredReviewGates(paid.submission.candidate);
  assert.deepEqual(freeGates, paidGates);
  assert.deepEqual(freeGates.humanRoles, [...REQUIRED_REVIEW_ROLES]);
  assert.deepEqual(freeGates.automatedCheckIds, [...DECLARED_AUTOMATED_CHECK_IDS]);
});

test("P9-16: similarity at/above threshold WARNS — never approves, never blocks alone", () => {
  const world = makeWorld({ similarityScores: { "pipe:sim": 0.92 } });
  const { report, submission } = submitCandidate(world, { pipelineId: "pipe:sim", version: "1.0.0", salt: "sim-1" });
  assert.ok(report !== null);
  const similarity = report.checks.find((check) => check.checkId === "similarity-signal");
  assert.equal(similarity?.outcome, "warn");
  assert.equal(similarity?.evidenceKind, "fixture");
  assert.ok(similarity?.detail.includes("never clearance"));
  // A warn does not fail the report: humans still decide.
  assert.equal(report.clean, true);
  // Approval without the full panel is still impossible.
  assert.throws(
    () =>
      world.publications.recordReviewDecision({
        candidateId: submission.candidate.candidateId,
        outcome: "approved",
        humanReview: fixtureReviewers().slice(0, 2),
        policyVersion: "policy:fixture-v1",
        rationale: "fixture",
        evidenceRefs: [],
      }),
    (error: unknown) => error instanceof MarketplaceReviewError && error.refusalKind === "missing-required-role",
  );
  // With the full panel the warned candidate CAN be approved — the
  // warn triggered review; it never substituted for it.
  const decision = approveSubmission(world, submission);
  assert.equal(decision.outcome, "approved");
});

test("P9-16: similarity below threshold passes as a quality signal only", () => {
  const world = makeWorld({ similarityScores: { "pipe:low-sim": 0.3 } });
  const { report } = submitCandidate(world, { pipelineId: "pipe:low-sim", version: "1.0.0", salt: "low-sim-1" });
  const similarity = report?.checks.find((check) => check.checkId === "similarity-signal");
  assert.equal(similarity?.outcome, "pass");
  assert.equal(similarity?.evidenceKind, "fixture");
});
