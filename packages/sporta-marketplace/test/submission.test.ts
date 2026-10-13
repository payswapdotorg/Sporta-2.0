/**
 * W9B-1 / P9-07 + P9-09 (submission lane) tests.
 *
 * EVIDENCE CLASS: REAL process observations over fixture content —
 * digest freezing/recomputation is REAL sha256 (node:crypto), state
 * transitions are real, typed refusals are real assertions.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Sha256MarketplaceHash,
  TransformCandidateImmutableError,
  TransformLifecycleError,
  TransformListingError,
  classifyCandidateMaterialChange,
} from "../src/contract.js";
import { candidateDigestPreimage } from "../src/domain/stable.js";
import { makeCandidateInput, makeWorld } from "./helpers.js";

test("a DRAFT is private: no frozen digest, not publishable, not publicly selectable (P9-07)", () => {
  const world = makeWorld();
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  assert.equal(draft.lifecycle, "DRAFT");
  assert.equal(draft.candidateDigest, null);
  assert.equal(draft.submittedAt, null);
  // No listing exists for a draft and publication refuses it typed:
  assert.throws(
    () =>
      world.listing.publishApprovedRelease({
        candidateId: draft.candidateId,
        ...basePublishInput(),
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      assert.equal(error.refusalKind.startsWith("listing:candidate-not-approved"), true);
      return true;
    },
  );
  const selection = world.admission.selectForLaunch({
    listingId: "list:nonexistent",
    principal: "user:test",
    rightsSnapshot: null,
  });
  assert.equal(selection.admitted, false);
  if (!selection.admitted) assert.equal(selection.reason, "listing-not-published");
});

test("submission freezes the candidate digest ONCE — the digest is the REAL sha256 preimage (P9-07)", () => {
  const world = makeWorld();
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  const submitted = world.submission.submitCandidate(draft.candidateId);
  assert.equal(submitted.lifecycle, "SUBMITTED");
  assert.ok(submitted.submittedAt !== null);
  assert.match(submitted.candidateDigest ?? "", /^sha256:[0-9a-f]{64}$/);
  // REAL recomputation of the frozen digest, byte-for-byte:
  const recomputed = new Sha256MarketplaceHash().text(
    candidateDigestPreimage({
      pipelineId: submitted.pipelineId,
      version: submitted.version,
      manifestDigest: submitted.manifestDigest,
      contentHashes: [...submitted.contentHashes],
      attestations: [...submitted.attestations],
      submittedBy: submitted.submittedBy,
    }),
  );
  assert.equal(submitted.candidateDigest, recomputed);
});

test("identical resubmission is idempotent: same record, same frozen digest, never a new freeze", () => {
  const world = makeWorld();
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  const submitted = world.submission.submitCandidate(draft.candidateId);
  const again = world.submission.startDraft(makeCandidateInput("1.0.0"));
  assert.equal(again.candidateId, submitted.candidateId);
  assert.equal(again.candidateDigest, submitted.candidateDigest);
  assert.equal(again.lifecycle, "SUBMITTED");
});

test("a changed candidate for an already-submitted version is refused — it must be a NEW version (P9-09)", () => {
  const world = makeWorld();
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  const changed = makeCandidateInput("1.0.0", {
    contentHashes: [{ kind: "code", digest: new Sha256MarketplaceHash().text("tampered-code") }],
  });
  assert.throws(
    () => world.submission.startDraft(changed),
    (error: unknown) => {
      assert.ok(error instanceof TransformCandidateImmutableError);
      assert.equal(error.candidateId, draft.candidateId);
      return true;
    },
  );
});

test("a DRAFT may be revised privately before submission (drafts are mutable, submissions are not)", () => {
  const world = makeWorld();
  const first = world.submission.startDraft(makeCandidateInput("1.0.0"));
  const revised = world.submission.startDraft(
    makeCandidateInput("1.0.0", {
      contentHashes: [{ kind: "code", digest: new Sha256MarketplaceHash().text("revised-code") }],
    }),
  );
  assert.equal(revised.candidateId, first.candidateId);
  assert.equal(revised.lifecycle, "DRAFT");
  assert.equal(revised.candidateDigest, null);
});

test("re-submitting a submitted candidate is a typed lifecycle refusal (immutability)", () => {
  const world = makeWorld();
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  assert.throws(
    () => world.submission.submitCandidate(draft.candidateId),
    (error: unknown) => {
      assert.ok(error instanceof TransformLifecycleError);
      return true;
    },
  );
});

test("the frozen digest is content-sensitive: distinct candidates freeze distinct REAL digests", () => {
  const worldA = makeWorld();
  const worldB = makeWorld();
  const first = worldA.submission.submitCandidate(
    worldA.submission.startDraft(makeCandidateInput("1.0.0")).candidateId,
  );
  const second = worldB.submission.submitCandidate(
    worldB.submission.startDraft(makeCandidateInput("2.0.0")).candidateId,
  );
  assert.notEqual(first.candidateDigest, second.candidateDigest);
});

test("material-change classification is total and typed: model/dependency changes name their family (P9-09)", () => {
  const hash = new Sha256MarketplaceHash();
  const base = {
    manifestDigest: hash.text("same-manifest"),
    contentHashes: [
      { kind: "code", digest: hash.text("code") },
      { kind: "model", digest: hash.text("model") },
      { kind: "dependency", digest: hash.text("dep") },
    ],
    attestations: [{ kind: "sbom", reference: "sbom:1" }],
  };
  assert.deepEqual(classifyCandidateMaterialChange(base, base), []);
  assert.deepEqual(
    classifyCandidateMaterialChange(base, {
      ...base,
      contentHashes: [
        { kind: "code", digest: hash.text("code") },
        { kind: "model", digest: hash.text("model-v2") },
        { kind: "dependency", digest: hash.text("dep") },
      ],
    }),
    ["model"],
  );
  assert.deepEqual(
    classifyCandidateMaterialChange(base, {
      ...base,
      contentHashes: [
        { kind: "code", digest: hash.text("code") },
        { kind: "model", digest: hash.text("model") },
        { kind: "dependency", digest: hash.text("dep-v2") },
      ],
    }),
    ["dependency"],
  );
  assert.deepEqual(
    classifyCandidateMaterialChange(base, {
      ...base,
      manifestDigest: hash.text("other-manifest"),
    }),
    ["manifest"],
  );
  assert.deepEqual(
    classifyCandidateMaterialChange(base, {
      ...base,
      attestations: [{ kind: "sbom", reference: "sbom:2" }],
    }),
    ["sbom"],
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
