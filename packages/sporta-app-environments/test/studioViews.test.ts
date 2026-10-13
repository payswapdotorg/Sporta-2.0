/**
 * W9C-8 — Transform Studio view-model tests (PURE modules under
 * packages/web/src/sporta/studio/).
 *
 * EVIDENCE CLASS: REAL projections over REAL sibling data — the studio
 * pure modules consume REAL @sporta/transforms validation results and
 * REAL @sporta/marketplace records (built through the REAL w9b
 * services) and REAL @sporta/app-environments records; the projected
 * views are asserted. Structural compatibility with the frozen
 * sibling shapes is additionally proven COMPILE-TIME by the ad-hoc
 * `tsc --noEmit` typecheck over this file (W9C evidence).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  TransformGraphValidation,
  TransformNode,
  TransformPipelineManifest,
} from "../../sporta-transforms/src/contract.js";
import { validateTransformPipelineManifest } from "../../sporta-transforms/src/contract.js";
import {
  FixtureManifestSource,
  FixtureSettlementAdapter,
  FixedClock as MarketplaceFixedClock,
  InMemoryCandidateStore,
  InMemoryCheckLaneStore,
  InMemoryDecisionStore,
  InMemoryEntitlementStore,
  InMemoryListingStateEventStore,
  InMemoryListingStore,
  InMemorySuspensionStore,
  ListingService,
  ReviewService,
  Sha256MarketplaceHash,
  SubmissionService,
  EntitlementService,
  FeedLaunchAdmissionService,
} from "../../sporta-marketplace/src/contract.js";
import type {
  TransformListing,
  TransformReviewDecision,
} from "../../sporta-marketplace/src/contract.js";
import {
  assembleGraph,
  draftEdge,
  draftNode,
  draftSubmittable,
  portsCompatible,
  projectValidation,
} from "../../web/src/sporta/studio/graphStudio.js";
import {
  gradeLabel,
  priceLine,
  projectDisclosure,
  projectListing,
  projectReviewStatus,
  reviewFullySigned,
  selectableListings,
} from "../../web/src/sporta/studio/marketplaceViews.js";
import {
  beginLaunchSelection,
  cancelLaunchConfirmation,
  confirmLaunch,
  launchButtonEnabled,
  requestLaunchConfirmation,
} from "../../web/src/sporta/studio/launchSelection.js";
import {
  dataScopeLine,
  grantsMutation,
  learningConsentLine,
  permissionSummary,
  projectAppAttachment,
} from "../../web/src/sporta/studio/appAttachmentViews.js";
import { projectSamplePreview } from "../../web/src/sporta/studio/samplePreview.js";
import type { StudioValidationResult } from "../../web/src/sporta/studio/studioPorts.js";
import {
  buildApplicationAttachment,
  FixedClock,
  sha256Text,
} from "../src/contract.js";
import { makeConsentInput, makeDescriptor } from "./helpers.js";

// ---------------------------------------------------------------------------
// Graph studio — REAL w9a validation results flow through the projection.
// ---------------------------------------------------------------------------

function makeStudioManifest(): TransformPipelineManifest {
  const trimDigest = sha256Text("trim-component");
  return {
    pipelineId: "pipe:studio",
    version: "1.0.0",
    manifestDigest: sha256Text("manifest@1.0.0"),
    publisher: "publisher:studio",
    purpose: "studio projection test",
    limitations: ["test only"],
    inputs: [{ name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" }],
    outputs: [{ name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" }],
    nodes: [
      {
        nodeId: "node:trim",
        kind: "deterministic-filter",
        componentRef: { kind: "deterministic-filter", digest: trimDigest, name: "trim" },
        inputs: [{ name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" }],
        outputs: [{ name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" }],
        parameterSchema: { startMs: { type: "number", required: true, minimum: 0 } },
        requiredPermissions: [],
        sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
        resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
        errorBehavior: { mode: "fail-closed", contract: "malformed input fails closed" },
        provenanceRules: ["kept events carry provenance"],
      },
    ],
    edges: [],
    semantics: {
      preservationClaims: ["identity and order preserved"],
      declaredChanges: ["out-of-window events dropped"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed stream"],
    pinnedDependencies: [
      { kind: "code", name: "trim", digest: trimDigest, license: "MIT", storageRef: "fabric:fixture" },
    ],
    licensing: { license: "MIT", provenance: "test" },
    policy: {
      rights: { holders: ["holder:test"], usages: ["render"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 500, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  };
}

test("graph studio: a REAL w9a validation result projects into the valid view (structural compat)", () => {
  const manifest = makeStudioManifest();
  const realValidation: TransformGraphValidation = validateTransformPipelineManifest(manifest, {
    parameters: { "node:trim": { startMs: 0 } },
  });
  // STRUCTURAL COMPAT: the real frozen result IS a StudioValidationResult.
  const studioValidation: StudioValidationResult = realValidation;
  const view = projectValidation(studioValidation);
  assert.equal(view.valid, true);
  assert.equal(view.nodeCount, 1);
  assert.equal(view.edgeCount, 0);
  assert.deepEqual(view.violations, []);
});

test("graph studio: REAL violations project verbatim with per-kind counts", () => {
  const manifest = makeStudioManifest();
  // A cycle + unknown port: two edges that loop and reference a bad port.
  const firstNode: TransformNode = manifest.nodes[0] as TransformNode;
  const cyclic: TransformPipelineManifest = {
    ...manifest,
    nodes: [firstNode, { ...firstNode, nodeId: "node:trim-2" }],
    edges: [
      { from: { nodeId: "node:trim", port: "events" }, to: { nodeId: "node:trim-2", port: "events" } },
      { from: { nodeId: "node:trim-2", port: "events" }, to: { nodeId: "node:trim", port: "events" } },
      { from: { nodeId: "node:trim", port: "nope" }, to: { nodeId: "node:trim-2", port: "events" } },
    ],
  };
  const realValidation = validateTransformPipelineManifest(cyclic, { parameters: {} });
  const view = projectValidation(realValidation);
  assert.equal(view.valid, false);
  assert.ok(view.violations.length > 0);
  for (const violation of view.violations) {
    assert.ok(violation.detail.length > 0);
  }
  const kinds = new Set(view.violations.map((violation) => violation.kind));
  assert.ok(kinds.has("cycle"));
  for (const count of view.violationCounts) {
    assert.ok(count.count >= 1);
  }
});

test("graph studio: draft assembly, port hints and submittability", () => {
  const a = draftNode("node:a", "deterministic-filter", {
    componentDigest: "sha256:aaaa",
    inputs: [{ name: "in", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" }],
    outputs: [{ name: "out", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" }],
  });
  const b = draftNode("node:b", "model", {
    componentDigest: "sha256:bbbb",
    inputs: [{ name: "in", dataKind: "sporta/json-event-stream", required: true, cardinality: "single" }],
    outputs: [{ name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" }],
  });
  const draft = assembleGraph([a, b], [draftEdge({ nodeId: "node:a", port: "out" }, { nodeId: "node:b", port: "in" })]);
  assert.equal(draft.nodes.length, 2);
  assert.equal(draft.edges.length, 1);
  assert.equal(
    portsCompatible(
      a.outputs[0] as never,
      (b.inputs as readonly { name: string; dataKind: string }[])[0] as never,
    ),
    true,
  );
  const ready = draftSubmittable(draft);
  assert.deepEqual(ready, { submittable: true, blockers: [] });
  const unpinned = draftSubmittable(assembleGraph([draftNode("node:c", "script")]));
  assert.equal(unpinned.submittable, false);
  assert.match(unpinned.blockers.join("; "), /pinned component digest/);
  const dangling = draftSubmittable(
    assembleGraph([a], [draftEdge({ nodeId: "node:ghost", port: "out" }, { nodeId: "node:a", port: "in" })]),
  );
  assert.equal(dangling.submittable, false);
  assert.match(dangling.blockers.join("; "), /unknown node/);
});

// ---------------------------------------------------------------------------
// Marketplace views — REAL w9b records through the REAL services.
// ---------------------------------------------------------------------------

async function makeMarketplaceWorld() {
  const hash = new Sha256MarketplaceHash();
  const clock = new MarketplaceFixedClock("2026-10-13T12:00:00.000Z");
  const manifests = new FixtureManifestSource();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const submission = new SubmissionService({
    clock,
    hash,
    candidates,
    lanes,
    manifests,
    validateGraph: validateTransformPipelineManifest,
  });
  const review = new ReviewService({ clock, hash, candidates, decisions, lanes });
  const listing = new ListingService({
    clock,
    hash,
    candidates,
    decisions,
    listings,
    suspensions: new InMemorySuspensionStore(),
    events: new InMemoryListingStateEventStore(),
    manifests,
  });
  const manifest = makeStudioManifest();
  manifests.register(manifest);
  const draft = submission.startDraft({
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    manifestDigest: manifest.manifestDigest,
    contentHashes: [{ kind: "code", digest: hash.text("code@1.0.0") }],
    attestations: [
      { kind: "license", reference: "license:1.0.0" },
      { kind: "sbom", reference: "sbom:1.0.0" },
    ],
    submittedBy: "publisher:studio",
  });
  submission.submitCandidate(draft.candidateId);
  submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { trim: "clean" },
    similaritySignal: null,
  });
  const decision = review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: [
      { role: "product", reviewer: "r:p", reviewedAt: "2026-10-13T12:01:00.000Z" },
      { role: "rights", reviewer: "r:r", reviewedAt: "2026-10-13T12:02:00.000Z" },
      { role: "security", reviewer: "r:s", reviewedAt: "2026-10-13T12:03:00.000Z" },
    ],
    rationale: "studio fixture content, real gates",
    policyVersion: "policy:test-v1",
  });
  const published = listing.publishApprovedRelease({
    candidateId: draft.candidateId,
    title: "Studio test pipeline",
    description: "fixture-content listing",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed stream"],
    limitations: ["test only"],
    compatibility: ["local"],
    support: "publisher:studio",
    offer: {
      kind: "free",
      price: null,
      settlementProviderRef: null,
      usageLimits: { maxRuns: null, expiresAt: null },
      termsLicense: "MIT",
    },
    rightsPrerequisites: ["authorized source footage"],
    changelog: "release 1.0.0",
  });
  const entitlementService = new EntitlementService({
    clock,
    hash,
    listings,
    entitlements,
    settlements: new FixtureSettlementAdapter(),
  });
  const admission = new FeedLaunchAdmissionService({
    clock,
    hash,
    listings,
    entitlements,
    candidates,
    manifests,
  });
  const entitlement = await entitlementService.grantEntitlement({
    principal: "user:studio",
    listingId: published.listingId,
  });
  return { listing, admission, decision, published, entitlement, manifests, manifest };
}

test("marketplace views: REAL listing + review decision + disclosure project into studio views", async () => {
  const world = await makeMarketplaceWorld();
  const listingView = projectListing(world.published);
  assert.equal(listingView.title, "Studio test pipeline");
  assert.equal(listingView.approvedVersion, "1.0.0");
  assert.equal(listingView.status, "PUBLISHED");
  assert.equal(listingView.offer.kind, "free");
  assert.equal(priceLine(listingView.offer), "Free");
  assert.equal(gradeLabel(listingView.expectations.evidenceGrade), "FIXTURE");

  const reviewStatus = projectReviewStatus(world.decision);
  assert.equal(reviewStatus.outcome, "approved");
  assert.deepEqual(reviewStatus.reviewerRoles, ["product", "rights", "security"]);
  assert.equal(reviewFullySigned(reviewStatus), true);
  assert.ok(reviewStatus.automatedChecks.length > 0);

  // The launch disclosure comes from the REAL admission service.
  const disclosure = world.admission.buildLaunchDisclosure(world.published.listingId);
  const disclosureView = projectDisclosure(disclosure);
  assert.equal(disclosureView.publisher, "publisher:studio");
  assert.equal(disclosureView.approvedVersion, "1.0.0");
  assert.equal(disclosureView.cost, null);
  assert.equal(priceLine(disclosureView.terms), "Free");
  assert.deepEqual(
    disclosureView.dependencies.map((dependency) => dependency.name),
    ["trim"],
  );
  assert.match(disclosureView.legalNotice, /never implies legal clearance/);

  // Only PUBLISHED listings are selectable.
  const selectable = selectableListings([world.published]);
  assert.equal(selectable.length, 1);
  const suspended: TransformListing = { ...world.published, status: "SUSPENDED" };
  assert.equal(selectableListings([suspended]).length, 0);

  // A review missing a role is flagged.
  const partial: TransformReviewDecision = {
    ...world.decision,
    humanReview: world.decision.humanReview.filter((entry) => entry.role !== "security"),
  };
  assert.equal(reviewFullySigned(projectReviewStatus(partial)), false);
});

test("launch selection: disclosure -> confirmation gate -> REAL admission result, verbatim", async () => {
  const world = await makeMarketplaceWorld();
  const disclosure = projectDisclosure(world.admission.buildLaunchDisclosure(world.published.listingId));
  let state = beginLaunchSelection({ feedKind: "prerecorded", disclosure });
  assert.equal(state.stage, "disclosure");
  assert.equal(launchButtonEnabled(state), false);

  state = requestLaunchConfirmation(state);
  assert.equal(state.stage, "awaiting-confirmation");
  assert.equal(launchButtonEnabled(state), true);

  // Going back never jumps past the gate.
  state = cancelLaunchConfirmation(state);
  assert.equal(state.stage, "disclosure");
  state = requestLaunchConfirmation(state);

  // A refused admission (no rights snapshot) surfaces its typed reason verbatim.
  const refused = world.admission.selectForLaunch({
    listingId: world.published.listingId,
    principal: "user:studio",
    rightsSnapshot: null,
  });
  const refusedState = confirmLaunch(state, refused);
  assert.equal(refusedState.stage, "refused");
  if (refusedState.stage === "refused") {
    assert.equal(refusedState.reason, "rights-prerequisites-unsatisfied");
    assert.match(refusedState.detail, /never "safe because it looks different"/);
  }

  // The admitted path pins the entitlement's digest.
  const admitted = world.admission.selectForLaunch({
    listingId: world.published.listingId,
    principal: "user:studio",
    rightsSnapshot: {
      satisfied: ["authorized source footage"],
      evidenceRefs: ["rights:fixture"],
    },
  });
  const admittedState = confirmLaunch(state, admitted);
  assert.equal(admittedState.stage, "admitted");
  if (admittedState.stage === "admitted") {
    assert.equal(admittedState.releaseDigest, world.entitlement.releaseDigest);
  }
});

// ---------------------------------------------------------------------------
// App attachment views — REAL app-environment records.
// ---------------------------------------------------------------------------

test("app attachment views: permissions, data scope and separate learning consent are explicit", () => {
  const descriptor = makeDescriptor();
  const attachment = buildApplicationAttachment(
    descriptor,
    makeConsentInput({ grantedCapabilityClasses: ["observe"] }),
  );
  const view = projectAppAttachment(descriptor, attachment);
  assert.deepEqual(view.grantedClasses, ["observe"]);
  assert.deepEqual(view.notGrantedClasses, ["control"]);
  assert.equal(grantsMutation(view), false);
  assert.equal(view.learningConsent.granted, false);
  assert.match(learningConsentLine(view), /NOT granted/);
  assert.match(permissionSummary(view), /granted: observe/);
  assert.match(dataScopeLine(view), /app-status, app-highlights/);
  assert.match(dataScopeLine(view), /no network access/);
  assert.equal(view.capabilities.length, 2);
  assert.deepEqual(
    view.capabilities.map((capability) => capability.capabilityId),
    ["cap:read-status", "cap:append-highlight"],
  );

  const withControl = projectAppAttachment(
    descriptor,
    buildApplicationAttachment(descriptor, makeConsentInput({ grantedCapabilityClasses: ["observe", "control"] })),
  );
  assert.equal(grantsMutation(withControl), true);
  assert.deepEqual(withControl.notGrantedClasses, []);

  const revoked = projectAppAttachment(descriptor, {
    ...attachment,
    revokedAt: "2026-10-13T13:00:00.000Z",
  });
  assert.match(permissionSummary(revoked), /revoked/);
});

// ---------------------------------------------------------------------------
// Sample preview.
// ---------------------------------------------------------------------------

test("sample preview: run-manifest-shaped records project with honest grades", () => {
  const view = projectSamplePreview(
    {
      runManifestId: "runm:studio",
      release: { pipelineId: "pipe:studio", version: "1.0.0", releaseDigest: "sha256:x" },
      outputs: [
        { artifactRevisionId: "rev:1", semanticEvidence: "3 kept byte-exact, 2 dropped" },
      ],
      semanticFidelity: { grade: "fixture", note: "fixture model lane" },
    },
    "5-event prerecorded feed",
  );
  assert.equal(view.pipelineId, "pipe:studio");
  assert.equal(view.evidenceGrade, "fixture");
  assert.match(view.outputSummary, /1 output revision/);
  assert.match(view.semanticEvidence, /3 kept byte-exact/);
  const empty = projectSamplePreview(
    {
      runManifestId: "runm:empty",
      release: { pipelineId: "pipe:studio", version: "1.0.0", releaseDigest: "sha256:x" },
      outputs: [],
      semanticFidelity: { grade: "declared", note: "nothing measured" },
    },
    "feed",
  );
  assert.match(empty.outputSummary, /no output revisions/);
});

// ---------------------------------------------------------------------------
// The pinned clock keeps this suite deterministic.
// ---------------------------------------------------------------------------

test("the studio test clock is the fixed one (determinism guard)", () => {
  const clock = new FixedClock("2026-10-13T12:00:00.000Z");
  assert.equal(clock.now(), "2026-10-13T12:00:00.000Z");
});
