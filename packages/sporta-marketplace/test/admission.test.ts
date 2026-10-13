/**
 * W9B-4 tests — fail-closed feed-launch admission + disclosure.
 *
 * Gates: P9-14 (invalid/missing rights refuse, never "safe because
 * it looks different"), P9-15 (distinct rights tracking; no checkbox
 * bypass), P9-16 (similarity never clears), P9-17 (provenance note)
 * and P9-12 (the disclosure record the launch UI renders).
 *
 * EVIDENCE CLASS: fixture CONTENT, REAL process observations — every
 * refusal reason and disclosure field below is asserted.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RIGHTS_PREREQUISITE_CATEGORIES,
  type TransformLaunchDisclosure,
  type TransformListingSelectionResult,
  type TransformRightsSnapshot,
} from "../src/contract.js";
import {
  FREE_OFFER,
  PAID_OFFER,
  makeManifest,
  makeWorld,
  publishRelease,
  satisfyingRightsSnapshot,
} from "./helpers.js";

async function admittedWorld(options: { maxRuns?: number; offer?: typeof FREE_OFFER; pipelineId?: string } = {}) {
  const world = makeWorld();
  const { listing, decision } = publishRelease(world, {
    pipelineId: options.pipelineId ?? "pipe:admit",
    version: "1.0.0",
    salt: "admit",
    offer: options.offer ?? FREE_OFFER,
    maxRuns: options.maxRuns ?? null,
  });
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:admit",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  return { world, listing, decision, entitlement };
}

function attempt(world: ReturnType<typeof makeWorld>, listingId: string, rightsSnapshot: TransformRightsSnapshot | null | undefined, runRef = "run:1") {
  return world.selection.selectForLaunch({
    listingId,
    principal: "user:admit",
    rightsSnapshot,
    runRef,
  });
}

test("P9-14: happy path admits with the frozen result shape pinned to the reviewed digest", async () => {
  const { world, listing, decision, entitlement } = await admittedWorld();
  const result: TransformListingSelectionResult = attempt(world, listing.listingId, satisfyingRightsSnapshot());
  assert.equal(result.admitted, true);
  if (result.admitted) {
    assert.equal(result.listingId, listing.listingId);
    assert.equal(result.releaseDigest, decision.candidateDigest);
    assert.equal(result.entitlementId, entitlement.entitlementId);
    // The frozen shape carries EXACTLY these fields (no extras).
    assert.deepEqual(Object.keys(result).sort(), ["admitted", "entitlementId", "listingId", "releaseDigest"]);
  }
});

test("P9-14: unknown listing refuses with listing-not-published (fail-closed, no throw)", () => {
  const world = makeWorld();
  const result = attempt(world, "list:unknown", satisfyingRightsSnapshot());
  assert.equal(result.admitted, false);
  if (!result.admitted) {
    assert.equal(result.reason, "listing-not-published");
    assert.ok(result.detail.length > 0);
  }
});

test("P9-14: a MISSING rights snapshot is a typed refusal — never safe-by-default", async () => {
  const { world, listing } = await admittedWorld();
  for (const missing of [null, undefined]) {
    const result = attempt(world, listing.listingId, missing);
    assert.equal(result.admitted, false);
    assert.equal(result.reason, "rights-prerequisites-unsatisfied");
    if (!result.admitted) assert.ok(result.detail.includes("fail-closed"));
  }
});

test("P9-14: a MALFORMED rights snapshot refuses — never a guess", async () => {
  const { world, listing } = await admittedWorld();
  const malformed = {
    snapshotId: "rights:malformed",
    capturedAt: "2026-10-13T00:00:00.000Z",
    satisfactions: "not-an-array",
    authorizedUsages: ["derive"],
  } as unknown as TransformRightsSnapshot;
  const result = attempt(world, listing.listingId, malformed);
  assert.equal(result.admitted, false);
  assert.equal(result.reason, "rights-prerequisites-unsatisfied");
});

test("P9-14: an unsatisfied prerequisite refuses — never safe because it looks different", async () => {
  const { world, listing } = await admittedWorld();
  const snapshot = satisfyingRightsSnapshot();
  snapshot.satisfactions = snapshot.satisfactions.map((entry) =>
    entry.prerequisite === "authorized source footage" ? { ...entry, authorized: false, evidence: "league license expired" } : entry,
  );
  const result = attempt(world, listing.listingId, snapshot);
  assert.equal(result.admitted, false);
  assert.equal(result.reason, "rights-prerequisites-unsatisfied");
  if (!result.admitted) assert.ok(result.detail.includes("authorized source footage"));
});

test("P9-14: a rich-looking snapshot missing the required usage still refuses", async () => {
  const { world, listing } = await admittedWorld();
  const snapshot = satisfyingRightsSnapshot();
  // Everything looks satisfied, but the source rights do not
  // authorize the "derive" usage the pipeline requires.
  snapshot.authorizedUsages = ["render"];
  const result = attempt(world, listing.listingId, snapshot);
  assert.equal(result.admitted, false);
  assert.equal(result.reason, "rights-prerequisites-unsatisfied");
  if (!result.admitted) assert.ok(result.detail.includes("derive"));
});

test("P9-14: a prerequisite with no satisfaction entry refuses (distinct tracking, P9-15)", async () => {
  const { world, listing } = await admittedWorld();
  const snapshot = satisfyingRightsSnapshot();
  snapshot.satisfactions = snapshot.satisfactions.filter((entry) => entry.prerequisite !== "model and dataset licenses");
  const result = attempt(world, listing.listingId, snapshot);
  assert.equal(result.admitted, false);
  assert.equal(result.reason, "rights-prerequisites-unsatisfied");
  if (!result.admitted) assert.ok(result.detail.includes("model and dataset licenses"));
});

test("P9-15: rights prerequisites are tracked as DISTINCT categories on the listing", async () => {
  const { world, listing } = await admittedWorld();
  assert.deepEqual(listing.rightsPrerequisites, [
    "authorized source footage",
    "music and graphics clearance",
    "model and dataset licenses",
    "output use permission",
  ]);
  // The category vocabulary is exported and stable.
  assert.equal(RIGHTS_PREREQUISITE_CATEGORIES.length, 4);
  // A typed snapshot is the ONLY admission path — there is no
  // checkbox/boolean bypass anywhere in the input shape.
  const admitted = attempt(world, listing.listingId, satisfyingRightsSnapshot());
  assert.equal(admitted.admitted, true);
});

test("P9-12: discloseForLaunch returns the full typed disclosure", async () => {
  const { world, listing, decision } = await admittedWorld({ offer: PAID_OFFER });
  const disclosure: TransformLaunchDisclosure = world.selection.discloseForLaunch(listing.listingId);
  assert.equal(disclosure.listingId, listing.listingId);
  assert.equal(disclosure.publisher, "publisher:test");
  assert.equal(disclosure.approvedVersion, "1.0.0");
  assert.equal(disclosure.releaseDigest, decision.candidateDigest);
  assert.ok(disclosure.reviewedAt.length > 0);
  assert.equal(disclosure.offer.kind, "paid-per-run");
  assert.deepEqual(disclosure.costExpectation, { amount: 5, currency: "USD", basis: "paid-per-run offer — price shown before launch" });
  assert.equal(disclosure.latencyExpectation.typicalLatencyMs, 500);
  assert.equal(disclosure.evidenceGrade, "fixture");
  assert.deepEqual(
    disclosure.rightsPrerequisites,
    ["authorized source footage", "music and graphics clearance", "model and dataset licenses", "output use permission"],
  );
  assert.deepEqual(disclosure.expectedOutputs, ["trimmed event stream"]);
  assert.ok(disclosure.limitations.length >= 1);
  // Dependencies come from the pinned manifest with licenses.
  assert.ok(disclosure.dependencies.some((dependency) => dependency.name === "fixture-lib" && dependency.license === "MIT"));
  // P9-17: the provenance note disclaims downstream legality and
  // never claims similarity clearance.
  assert.ok(disclosure.provenanceNote.includes("no guarantee of legality"));
  assert.ok(disclosure.provenanceNote.includes(decision.candidateDigest));
  assert.ok(disclosure.provenanceNote.includes("never clearance"));
});

test("P9-12: free listing disclosure shows free cost expectation", async () => {
  const { world, listing } = await admittedWorld({ offer: FREE_OFFER });
  const disclosure = world.selection.discloseForLaunch(listing.listingId);
  assert.deepEqual(disclosure.costExpectation, { amount: null, currency: null, basis: "free offer — no charge per run" });
  assert.equal(disclosure.offer.price, null);
});

test("P9-12: unresolvable manifest degrades honestly in the disclosure (explicit limitation)", async () => {
  const world = makeWorld();
  // Publish a release whose manifest the store CAN resolve, then
  // evict it so the disclosure seam cannot re-resolve it.
  const manifest = makeManifest({ pipelineId: "pipe:degrade", version: "1.0.0" });
  world.manifestStore.register(manifest);
  const draft = world.publications.registerDraft({
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    manifestDigest: manifest.manifestDigest,
    contentHashes: [{ kind: "source", digest: `sha256:${"f".repeat(64)}` }],
    attestations: [{ kind: "sbom", reference: "sbom:fixture" }, { kind: "license", reference: "license:fixture" }],
    createdBy: "creator:test",
  });
  const submission = world.publications.submitDraft(draft.draftId);
  world.publications.runAutomatedChecks(submission.candidate.candidateId);
  const decision = world.publications.recordReviewDecision({
    candidateId: submission.candidate.candidateId,
    outcome: "approved",
    humanReview: [
      { role: "product", reviewer: "reviewer:fixture-product", reviewedAt: "2026-10-13T00:00:00.000Z" },
      { role: "rights", reviewer: "reviewer:fixture-rights", reviewedAt: "2026-10-13T00:00:00.000Z" },
      { role: "security", reviewer: "reviewer:fixture-security", reviewedAt: "2026-10-13T00:00:00.000Z" },
    ],
    policyVersion: "policy:fixture-v1",
    rationale: "fixture",
    evidenceRefs: [],
  });
  const listing = world.listings.publishReviewedRelease(decision, {
    title: "degrade test",
    description: "honest degradation",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["output"],
    limitations: ["base limitation"],
    publisher: "publisher:test",
    compatibility: ["local"],
    support: "publisher:test",
    offer: FREE_OFFER,
    expectations: { typicalLatencyMs: 1, declaredThroughput: "x", evidenceGrade: "fixture" },
    rightsPrerequisites: ["authorized source footage"],
    policy: {
      rights: { holders: ["h"], usages: ["derive"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
    changelog: "initial",
  });
  // Evict the manifest so the disclosure seam cannot re-resolve it.
  world.manifestStore.evict("pipe:degrade");
  const disclosure = world.selection.discloseForLaunch(listing.listingId);
  assert.ok(disclosure.dependencies.length > 0);
  for (const dependency of disclosure.dependencies) {
    assert.equal(dependency.license, "unverified");
  }
  assert.ok(disclosure.limitations.some((limitation) => limitation.includes("could not be re-resolved")));
});

test("P9-16: similarity plays no role at admission (not an admission input at all)", async () => {
  const world = makeWorld({ similarityScores: { "pipe:admit": 0.99 } });
  const { listing } = await (async () => {
    const published = publishRelease(world, { pipelineId: "pipe:admit", version: "1.0.0", salt: "admit" });
    return published;
  })();
  const entitlement = await world.entitlements.grantEntitlement({
    principal: "user:admit",
    listingId: listing.listingId,
    purchaseRef: "po-1",
  });
  assert.ok(entitlement !== null);
  // High similarity warned during REVIEW; at admission only rights +
  // entitlement + listing state decide. The admitted digest is the
  // reviewed one.
  const result = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:admit",
    rightsSnapshot: satisfyingRightsSnapshot(),
    runRef: "run:1",
  });
  assert.equal(result.admitted, true);
});

test("admission order: suspended beats entitlement questions (deterministic order)", async () => {
  const { world, listing } = await admittedWorld();
  world.listings.suspendListing(listing.listingId, { reason: "test", suspendedBy: "operator:test" });
  // No entitlement for this principal at all AND suspended -> suspended.
  const result = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:nobody",
    rightsSnapshot: null,
    runRef: "run:1",
  });
  assert.equal(result.admitted, false);
  assert.equal(result.reason, "suspended");
});

test("admission order: no entitlement beats rights questions (deterministic order)", async () => {
  const { world, listing } = await admittedWorld();
  const result = world.selection.selectForLaunch({
    listingId: listing.listingId,
    principal: "user:has-nothing",
    rightsSnapshot: null,
    runRef: "run:1",
  });
  assert.equal(result.admitted, false);
  assert.equal(result.reason, "no-entitlement");
});
