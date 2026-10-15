/**
 * W12B-1 + W12B-2 — the my-pipelines REAL host battery (packages/web,
 * node:test + tsx — the project law; the sportaScreens.test.ts and
 * sportaSeamsRuns.test.ts precedents).
 *
 * Drives `createMyPipelinesRealHost` over the REAL marketplace
 * services: a REAL `SubmissionService` (startDraft → submitCandidate →
 * runAutomatedChecks — the REAL digest-freezing + check lane), a REAL
 * `ReviewService` (3-role approvals, changes-requested, rejections —
 * the durable `TransformReviewDecision`s), a REAL `ListingService`
 * (publishApprovedRelease — the APPROVED → PUBLISHED arc), and the
 * W12-03 freeze `CreatorCandidateQueryService` over the REAL in-memory
 * candidate store. The host is a pure projection over the freeze read
 * (`listByCreator`/`listAll`) + the frozen review seam (the decision
 * store's `byCandidate` read).
 *
 * EVIDENCE CLASS (labeled):
 *   REAL — the host satisfies `MyPipelinesScreenPort` with
 *   `backing: "real"`; every candidate-record field projects verbatim
 *   through the frozen `CreatorPipelineRecord` mirror; the lifecycle
 *   state machine, digest freezing (REAL sha256), the check lane, the
 *   review gates and the immutability laws are the REAL service
 *   behaviors; the typed errors (`TransformCandidateImmutableError`,
 *   `TransformLifecycleError`, `TransformCheckLaneError`) carry their
 *   EXACT verbatim messages; the store honesty label surfaces via
 *   `host.gradeNote` (the W12-07 law generalized).
 *   FIXTURE — the in-memory stores (candidate/decision/lane/listing),
 *   the manifest/candidate CONTENT seed, the fixture reviewers. The
 *   SERVICES are REAL (the lifecycle tables, the fail-closed check
 *   lane, the approval gates, the digest byte-freezing).
 *
 * Acceptance: W12-10 (REAL records, origin "record", pure lifecycle
 * projection, zero fixture-demo rows), W12-11 (the changed-resubmit
 * typed error + the already-submitted refusal preserved verbatim),
 * W12-12 (version-status reads: real decisions or the honest
 * `no review decision recorded` refusal — both arms).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CreatorCandidateQueryService,
  FixtureManifestSource,
  FixedClock,
  InMemoryCandidateStore,
  InMemoryCheckLaneStore,
  InMemoryDecisionStore,
  InMemoryListingStateEventStore,
  InMemoryListingStore,
  InMemorySuspensionStore,
  ListingService,
  ReviewService,
  Sha256MarketplaceHash,
  SubmissionService,
  TransformCandidateImmutableError,
  TransformCheckLaneError,
  TransformLifecycleError,
} from "@sporta/marketplace/contract";
import type {
  StartDraftInput,
  TransformCandidateRecord,
} from "@sporta/marketplace/contract";
import { validateTransformPipelineManifest } from "@sporta/transforms/contract";
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
import {
  createMyPipelinesRealHost,
  MY_PIPELINES_STORE_GRADE_NOTE,
} from "../src/sporta/marketplace/myPipelinesRealHost.js";
import type { MyPipelinesRealHost } from "../src/sporta/marketplace/myPipelinesRealHost.js";
import type { MyPipelinesScreenPort } from "../src/sporta/marketplace/marketplaceScreenPorts.js";
import { creatorStateLabel } from "../src/sporta/marketplace/marketplaceScreenViews.js";
import { createMarketplaceFixtureHost } from "../src/sporta/marketplace/marketplaceFixtureHost.js";

const FIXED_NOW = "2026-10-13T12:00:00.000Z";
const CREATOR = "publisher:w12b-test";
const POLICY_VERSION = "policy:w12b-v1";

// ---------------------------------------------------------------------------
// The REAL marketplace world (the W9B helpers pattern, self-contained in
// this lane's test — no cross-package test imports).
// ---------------------------------------------------------------------------

/** A single-node deterministic-filter manifest that passes the REAL w9a validator. */
function makeManifest(pipelineId: string, version: string): TransformPipelineManifest {
  const node: TransformNode = {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: `sha256:${"c".repeat(64)}`,
      name: "json-event-stream-trim",
    },
    inputs: [
      { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" },
    ],
    outputs: [
      { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" },
    ],
    parameterSchema: { startMs: { type: "number", required: true, minimum: 0 } },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "malformed input fails closed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
  return {
    pipelineId,
    version,
    manifestDigest: new Sha256MarketplaceHash().text(`manifest@${pipelineId}@${version}`),
    publisher: CREATOR,
    purpose: "w12b my-pipelines battery",
    limitations: ["test only"],
    inputs: [
      { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" },
    ],
    outputs: [
      { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" },
    ],
    nodes: [node],
    edges: [] as readonly TransformEdge[],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [
      {
        kind: "code",
        name: "trim-script",
        digest: `sha256:${"d".repeat(64)}`,
        license: "MIT",
        storageRef: "fabric:fixture",
      },
    ],
    licensing: { license: "MIT", provenance: "test" },
    policy: {
      rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 500, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  };
}

/** Candidate input with REAL sha256 content digests (fixture bytes). */
function candidateInput(pipelineId: string, version: string): StartDraftInput {
  const hash = new Sha256MarketplaceHash();
  return {
    pipelineId,
    version,
    manifestDigest: new Sha256MarketplaceHash().text(`manifest@${pipelineId}@${version}`),
    contentHashes: [
      { kind: "code", digest: hash.text(`code-source@${pipelineId}@${version}`) },
      { kind: "runtime", digest: hash.text(`runtime@${pipelineId}@${version}`) },
    ],
    attestations: [
      { kind: "license", reference: `license:${pipelineId}@${version}` },
      { kind: "sbom", reference: `sbom:${pipelineId}@${version}` },
    ],
    submittedBy: CREATOR,
  };
}

/** Clean lane signals: every pinned dependency resolves clean, no similarity evidence. */
const CLEAN_SIGNALS = {
  dependencySignals: { "trim-script": "clean" } as Readonly<
    Record<string, "clean" | "unknown" | "unsafe">
  >,
  similaritySignal: null,
};

/** The three canonical reviewer signoffs (fixture reviewers, honest labels). */
const THREE_ROLES = [
  { role: "product", reviewer: "reviewer:product-w12b", reviewedAt: "2026-10-13T11:00:00.000Z" },
  { role: "rights", reviewer: "reviewer:rights-w12b", reviewedAt: "2026-10-13T11:01:00.000Z" },
  { role: "security", reviewer: "reviewer:security-w12b", reviewedAt: "2026-10-13T11:02:00.000Z" },
];

const ONE_ROLE = [{ role: "product", reviewer: "reviewer:product-w12b" }];

/** The fully wired REAL world + the REAL host under test. */
function makeWorld() {
  const clock = new FixedClock(FIXED_NOW);
  const hash = new Sha256MarketplaceHash();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const suspensions = new InMemorySuspensionStore();
  const events = new InMemoryListingStateEventStore();
  const manifests = new FixtureManifestSource();
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
    suspensions,
    events,
    manifests,
  });
  const query = new CreatorCandidateQueryService({ candidates });
  // The frozen review seam: the decision store's byCandidate read (the
  // structural CreatorReviewDecisionRead — no write surface exposed).
  const host = createMyPipelinesRealHost({ query, review: decisions });
  return {
    clock,
    hash,
    candidates,
    decisions,
    lanes,
    listings,
    manifests,
    submission,
    review,
    listing,
    query,
    host,
  };
}

/** Seed a REAL private DRAFT (manifest registered + startDraft). */
function seedDraft(
  world: ReturnType<typeof makeWorld>,
  pipelineId: string,
  version = "1.0.0",
): TransformCandidateRecord {
  const manifest = makeManifest(pipelineId, version);
  world.manifests.register(manifest);
  return world.submission.startDraft({
    ...candidateInput(pipelineId, version),
    manifestDigest: manifest.manifestDigest,
  });
}

/** Seed a REAL SUBMITTED candidate (digest frozen, record immutable). */
function seedSubmitted(
  world: ReturnType<typeof makeWorld>,
  pipelineId: string,
  version = "1.0.0",
): TransformCandidateRecord {
  const draft = seedDraft(world, pipelineId, version);
  return world.submission.submitCandidate(draft.candidateId);
}

// ---------------------------------------------------------------------------
// W12-10 — REAL records through the REAL host: origin "record", pure
// lifecycle projection, ZERO fixture-demo rows.
// ---------------------------------------------------------------------------

test("W12B-1 my-pipelines REAL host: backing real + the store honesty grade note surfaces (W12-10)", () => {
  const world = makeWorld();
  const host: MyPipelinesRealHost = createMyPipelinesRealHost({
    query: world.query,
    review: world.decisions,
  });
  // STRUCTURAL COMPAT (compile-time): the REAL host satisfies the
  // frozen port — the state-owner law without cross-lane imports.
  const port: MyPipelinesScreenPort = host;
  void port;
  assert.equal(host.backing, "real", "the REAL host reports backing 'real'");
  assert.equal(
    host.gradeNote,
    MY_PIPELINES_STORE_GRADE_NOTE,
    "the store honesty label surfaces verbatim (the W12-07 law generalized)",
  );
  assert.match(
    host.gradeNote,
    /BACKING: REAL \(candidate \+ decision stores: fixture-grade in-memory\)/,
    "the grade note carries the exact honest label — never re-badged",
  );
  assert.doesNotMatch(
    host.gradeNote,
    /production|real-local-live/,
    "the grade note is never inflated beyond the stores' actual grade",
  );
});

test("W12B-1 my-pipelines REAL host: REAL DRAFT + SUBMITTED records project through the host (W12-10)", async () => {
  const world = makeWorld();
  const draft = seedDraft(world, "pipe:w12b-draft");
  const submitted = seedSubmitted(world, "pipe:w12b-submitted");
  assert.equal(draft.lifecycle, "DRAFT");
  assert.equal(submitted.lifecycle, "SUBMITTED");

  const rows = await world.host.listCreatorRecords(CREATOR);
  assert.equal(rows.length, 2, "the two REAL candidates surface — insertion order");
  assert.equal(rows[0]?.pipelineId, "pipe:w12b-draft");
  assert.equal(rows[1]?.pipelineId, "pipe:w12b-submitted");

  // EVERY row is a REAL record — zero fixture-demo rows.
  for (const row of rows) {
    assert.equal(row.origin, "record", "every REAL row carries origin 'record'");
    assert.notEqual(row.origin, "fixture-demo");
    assert.equal(row.publisher, CREATOR, "the creator scope is submittedBy");
    assert.equal(row.listingId, null, "the listing id stays an honest gap on the candidate store");
    assert.match(row.note ?? "", /honest gap/, "the honest gap is surfaced in the note, never hidden");
  }

  // The DRAFT row: a pure lifecycle projection, never guessed.
  const draftRow = rows[0];
  assert.ok(draftRow !== undefined);
  assert.equal(draftRow.status, "DRAFT", "the REAL lifecycle state carries verbatim");
  assert.equal(draftRow.creatorState, "draft");
  assert.equal(draftRow.approvedVersion, null, "a draft has no frozen version");
  assert.equal(draftRow.reviewedAt, null, "a draft has no review decision");
  assert.equal(draftRow.title, "pipe:w12b-draft v1.0.0", "the title is the candidate identity (honest derivation)");
  assert.match(draftRow.note ?? "", /private draft/);

  // The SUBMITTED row: the frozen version surfaces, still unreviewed.
  const submittedRow = rows[1];
  assert.ok(submittedRow !== undefined);
  assert.equal(submittedRow.status, "SUBMITTED");
  assert.equal(submittedRow.creatorState, "submitted");
  assert.equal(submittedRow.approvedVersion, "1.0.0", "the submitted version is the tracked version");
  assert.equal(submittedRow.reviewedAt, null, "submitted but not yet reviewed — honest null");
  assert.match(submittedRow.note ?? "", /P9-09/, "the immutability law surfaces in the note");

  // Other creators see NOTHING (the creator scope is the service's own filter).
  assert.deepEqual(
    await world.host.listCreatorRecords("publisher:someone-else"),
    [],
    "other creators' views stay empty — never another creator's records",
  );
});

test("W12B-1 my-pipelines REAL host: the full REAL lifecycle spread projects honestly (W12-10)", async () => {
  const world = makeWorld();

  // DRAFT — a private draft.
  seedDraft(world, "pipe:w12b-lc-draft");
  // SUBMITTED — digest frozen, awaiting the check lane.
  seedSubmitted(world, "pipe:w12b-lc-submitted");
  // AUTOMATED_CHECKS — a REAL gate failure holds the candidate in the lane
  // (the fail-closed law: the typed lane error carries verbatim).
  const unsafeCandidate = seedSubmitted(world, "pipe:w12b-lc-checks");
  assert.throws(
    () =>
      world.submission.runAutomatedChecks(unsafeCandidate.candidateId, {
        dependencySignals: { "trim-script": "unsafe" },
        similaritySignal: null,
      }),
    (error) => {
      assert.ok(error instanceof TransformCheckLaneError);
      assert.equal(
        error.message,
        `automated gate checks failed for candidate ${unsafeCandidate.candidateId}: unsafe-dependency-signal`,
        "the REAL gate-failure law carries verbatim",
      );
      return true;
    },
  );
  // HUMAN_REVIEW — clean signals advance the lane.
  const reviewCandidate = seedSubmitted(world, "pipe:w12b-lc-review");
  world.submission.runAutomatedChecks(reviewCandidate.candidateId, CLEAN_SIGNALS);
  // CHANGES_REQUESTED — a REAL negative decision.
  const changesCandidate = seedSubmitted(world, "pipe:w12b-lc-changes");
  world.submission.runAutomatedChecks(changesCandidate.candidateId, CLEAN_SIGNALS);
  world.review.recordReviewDecision({
    candidateId: changesCandidate.candidateId,
    outcome: "changes-requested",
    humanReview: ONE_ROLE,
    rationale: "w12b changes requested",
    policyVersion: POLICY_VERSION,
  });
  // REJECTED — a REAL terminal rejection.
  const rejectedCandidate = seedSubmitted(world, "pipe:w12b-lc-rejected");
  world.submission.runAutomatedChecks(rejectedCandidate.candidateId, CLEAN_SIGNALS);
  world.review.recordReviewDecision({
    candidateId: rejectedCandidate.candidateId,
    outcome: "rejected",
    humanReview: ONE_ROLE,
    rationale: "w12b rejected",
    policyVersion: POLICY_VERSION,
  });
  // APPROVED — the REAL 3-role approval.
  const approvedCandidate = seedSubmitted(world, "pipe:w12b-lc-approved");
  world.submission.runAutomatedChecks(approvedCandidate.candidateId, CLEAN_SIGNALS);
  world.review.recordReviewDecision({
    candidateId: approvedCandidate.candidateId,
    outcome: "approved",
    humanReview: THREE_ROLES,
    rationale: "w12b approved",
    policyVersion: POLICY_VERSION,
  });
  // PUBLISHED — the REAL publish arc.
  const publishedCandidate = seedSubmitted(world, "pipe:w12b-lc-published");
  world.submission.runAutomatedChecks(publishedCandidate.candidateId, CLEAN_SIGNALS);
  world.review.recordReviewDecision({
    candidateId: publishedCandidate.candidateId,
    outcome: "approved",
    humanReview: THREE_ROLES,
    rationale: "w12b published",
    policyVersion: POLICY_VERSION,
  });
  world.listing.publishApprovedRelease({
    candidateId: publishedCandidate.candidateId,
    title: "w12b published pipeline",
    description: "w12b battery listing",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["test only"],
    compatibility: ["local"],
    support: CREATOR,
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

  const rows = await world.host.listCreatorRecords(CREATOR);
  assert.equal(rows.length, 8, "all eight lifecycle states surface — none hidden");
  const byPipeline = new Map(rows.map((row) => [row.pipelineId, row]));

  // The pure lifecycle projection — every state, explicitly, never guessed.
  // [pipelineId, status (verbatim), creatorState (the projection), view label]
  const expected: readonly (readonly [string, string, string, string])[] = [
    ["pipe:w12b-lc-draft", "DRAFT", "draft", "Draft"],
    ["pipe:w12b-lc-submitted", "SUBMITTED", "submitted", "Submitted for review"],
    ["pipe:w12b-lc-checks", "AUTOMATED_CHECKS", "submitted", "Submitted for review"],
    ["pipe:w12b-lc-review", "HUMAN_REVIEW", "submitted", "Submitted for review"],
    ["pipe:w12b-lc-changes", "CHANGES_REQUESTED", "changes-requested", "Changes requested"],
    ["pipe:w12b-lc-rejected", "REJECTED", "changes-requested", "Changes requested"],
    ["pipe:w12b-lc-approved", "APPROVED", "released", "Released"],
    ["pipe:w12b-lc-published", "PUBLISHED", "released", "Released"],
  ];
  for (const [pipelineId, status, creatorState, label] of expected) {
    const row = byPipeline.get(pipelineId);
    assert.ok(row !== undefined, `${pipelineId} stays visible — the honest-states law`);
    assert.equal(row.status, status, `${pipelineId}: the REAL lifecycle carries verbatim`);
    assert.equal(row.creatorState, creatorState, `${pipelineId}: the pure creatorState projection`);
    assert.equal(creatorStateLabel(row.creatorState), label, `${pipelineId}: the view label projects`);
    assert.equal(row.origin, "record", `${pipelineId}: origin record — zero fixture-demo`);
  }

  // The REJECTED row names its terminal nature honestly (the frozen
  // creatorState vocabulary has no rejected bucket — status + note carry it).
  const rejectedRow = byPipeline.get("pipe:w12b-lc-rejected");
  assert.ok(rejectedRow !== undefined);
  assert.match(rejectedRow.note ?? "", /rejected this candidate \(terminal\)/);
  assert.match(rejectedRow.note ?? "", /status carries REJECTED verbatim/);

  // The decided rows carry their REAL reviewedAt; the undecided stay null.
  assert.equal(byPipeline.get("pipe:w12b-lc-changes")?.reviewedAt, FIXED_NOW);
  assert.equal(byPipeline.get("pipe:w12b-lc-rejected")?.reviewedAt, FIXED_NOW);
  assert.equal(byPipeline.get("pipe:w12b-lc-approved")?.reviewedAt, FIXED_NOW);
  assert.equal(byPipeline.get("pipe:w12b-lc-published")?.reviewedAt, FIXED_NOW);
  assert.equal(byPipeline.get("pipe:w12b-lc-draft")?.reviewedAt, null);
  assert.equal(byPipeline.get("pipe:w12b-lc-submitted")?.reviewedAt, null);
  assert.equal(byPipeline.get("pipe:w12b-lc-checks")?.reviewedAt, null);
  assert.equal(byPipeline.get("pipe:w12b-lc-review")?.reviewedAt, null);
});

test("W12B-1 the fixture-demo rows retire: ZERO fixture-demo rows in the REAL host; the labeled fixture host stays (W12-10)", async () => {
  // The REAL host starts honest-empty — no fabricated demo states.
  const world = makeWorld();
  assert.deepEqual(
    await world.host.listCreatorRecords("publisher:fixture-market"),
    [],
    "the REAL host invents nothing — the fixture-market creator has no REAL records",
  );

  // The three states the fixture host demos as fixture-demo rows
  // (draft/submitted/changes-requested) now come from REAL records.
  seedDraft(world, "pipe:w12b-real-draft");
  seedSubmitted(world, "pipe:w12b-real-submitted");
  const changesCandidate = seedSubmitted(world, "pipe:w12b-real-changes");
  world.submission.runAutomatedChecks(changesCandidate.candidateId, CLEAN_SIGNALS);
  world.review.recordReviewDecision({
    candidateId: changesCandidate.candidateId,
    outcome: "changes-requested",
    humanReview: ONE_ROLE,
    rationale: "w12b retirement arm",
    policyVersion: POLICY_VERSION,
  });

  const rows = await world.host.listCreatorRecords(CREATOR);
  assert.equal(rows.length, 3);
  const states = rows.map((row) => `${row.status}:${row.origin}`).sort();
  assert.deepEqual(states, [
    "CHANGES_REQUESTED:record",
    "DRAFT:record",
    "SUBMITTED:record",
  ], "the demo state classes retire to typed-refusal-backed REAL states — origin record, zero fixture-demo");
  for (const row of rows) {
    assert.equal(row.origin, "record");
    assert.notEqual(row.origin, "fixture-demo");
  }

  // The labeled fixture host STAYS for the browser demo (sibling, not
  // replacement) — its demo rows remain fixture-demo, honestly labeled.
  const fixture = createMarketplaceFixtureHost();
  const fixturePort: MyPipelinesScreenPort = fixture.myPipelines;
  assert.equal(fixturePort.backing, "fixture", "the fixture host keeps its honest backing label");
  assert.equal(world.host.backing, "real", "the REAL host is the composition-grade sibling");
  const demoRows = await fixture.myPipelines.listCreatorRecords("publisher:fixture-market");
  assert.equal(demoRows.length, 5, "2 real-shaped rows + 3 demo rows in the fixture host");
  assert.equal(
    demoRows.filter((row) => row.origin === "fixture-demo").length,
    3,
    "the demo rows stay IN the fixture host, explicitly labeled",
  );
});

// ---------------------------------------------------------------------------
// W12-11 — the draft/submitted immutability laws surface VERBATIM: the
// changed-resubmit typed error + the already-submitted refusal are the
// REAL typed errors, and the host projects the immutable record.
// ---------------------------------------------------------------------------

test("W12B-1 immutability law: the changed-resubmit typed error is the REAL TransformCandidateImmutableError, verbatim (W12-11)", async () => {
  const world = makeWorld();

  // Contrast first — a DRAFT may be replaced (drafts are private, P9-07):
  seedDraft(world, "pipe:w12b-draft-replace");
  const replaced = world.submission.startDraft({
    ...candidateInput("pipe:w12b-draft-replace", "1.0.0"),
    manifestDigest: `sha256:${"e".repeat(64)}`, // different material
  });
  assert.equal(replaced.lifecycle, "DRAFT", "the draft replacement stays a draft");
  const draftRows = await world.host.listCreatorRecords(CREATOR);
  assert.equal(
    draftRows.filter((row) => row.pipelineId === "pipe:w12b-draft-replace").length,
    1,
    "the replacement updates the SAME slot — no fork",
  );

  // The REAL changed-resubmit law — SUBMITTED records are immutable:
  const submitted = seedSubmitted(world, "pipe:w12b-resubmit");
  assert.throws(
    () =>
      world.submission.startDraft({
        ...candidateInput("pipe:w12b-resubmit", "1.0.0"),
        manifestDigest: `sha256:${"f".repeat(64)}`, // mutated material
      }),
    (error) => {
      assert.ok(
        error instanceof TransformCandidateImmutableError,
        "the REAL typed error — never a silent no-op",
      );
      assert.equal(
        error.message,
        "pipeline pipe:w12b-resubmit version 1.0.0 is already submitted with a frozen digest — a changed candidate requires a NEW version and separate review (P9-09)",
        "the EXACT verbatim message",
      );
      assert.equal(error.refusalKind, `candidate-immutable:${submitted.candidateId}`);
      assert.equal(error.frozenDigest, submitted.candidateDigest);
      return true;
    },
  );

  // The host projects the immutability law: ONE record, still SUBMITTED,
  // the tracked version unchanged — the mutation did NOT fork or alter it.
  const rows = await world.host.listCreatorRecords(CREATOR);
  const resubmitRows = rows.filter((row) => row.pipelineId === "pipe:w12b-resubmit");
  assert.equal(resubmitRows.length, 1, "one slot — the refused resubmit did not fork the record");
  assert.equal(resubmitRows[0]?.status, "SUBMITTED");
  assert.equal(resubmitRows[0]?.creatorState, "submitted");
  assert.equal(resubmitRows[0]?.approvedVersion, "1.0.0");

  // The idempotent same-content re-read returns the existing record (no error).
  const reread = world.submission.startDraft(candidateInput("pipe:w12b-resubmit", "1.0.0"));
  assert.equal(reread.candidateId, submitted.candidateId, "same content re-reads the same record");
  assert.equal(reread.candidateDigest, submitted.candidateDigest, "the frozen digest is unchanged");
  assert.equal(
    (await world.host.listCreatorRecords(CREATOR)).filter(
      (row) => row.pipelineId === "pipe:w12b-resubmit",
    ).length,
    1,
    "still one row — the idempotent re-read did not fork the enumeration",
  );
});

test("W12B-1 immutability law: the already-submitted refusal is the REAL TransformLifecycleError, verbatim (W12-11)", async () => {
  const world = makeWorld();
  const submitted = seedSubmitted(world, "pipe:w12b-already-sub");

  // The REAL already-submitted refusal — submitCandidate on a non-DRAFT:
  assert.throws(
    () => world.submission.submitCandidate(submitted.candidateId),
    (error) => {
      assert.ok(
        error instanceof TransformLifecycleError,
        "the REAL typed error — never a silent no-op",
      );
      assert.equal(
        error.message,
        `candidate ${submitted.candidateId} is already SUBMITTED — submitted candidates are immutable`,
        "the EXACT verbatim message",
      );
      assert.equal(error.refusalKind, "lifecycle:SUBMITTED->SUBMITTED");
      return true;
    },
  );

  // The host's row still projects the immutable SUBMITTED record, and
  // the note carries the write-law (the port has no write at this SHA —
  // the law surfaces, never a faked affordance).
  const rows = await world.host.listCreatorRecords(CREATOR);
  const row = rows.find((record) => record.pipelineId === "pipe:w12b-already-sub");
  assert.ok(row !== undefined);
  assert.equal(row.status, "SUBMITTED", "the record stays SUBMITTED — the refusal changed nothing");
  assert.equal(row.creatorState, "submitted");
  assert.match(row.note ?? "", /immutable/, "the immutability law surfaces in the row note");
  assert.match(row.note ?? "", /P9-09/);
});

// ---------------------------------------------------------------------------
// W12-12 — creator version-status reads through the REAL review seam:
// real decisions project as MarketplaceReviewShape verbatim, or the
// honest `no review decision recorded` refusal — BOTH arms.
// ---------------------------------------------------------------------------

test("W12B-2 version status: a REAL approved decision projects as MarketplaceReviewShape verbatim (W12-12)", async () => {
  const world = makeWorld();
  const candidate = seedSubmitted(world, "pipe:w12b-version-status");
  world.submission.runAutomatedChecks(candidate.candidateId, CLEAN_SIGNALS);
  const decision = world.review.recordReviewDecision({
    candidateId: candidate.candidateId,
    outcome: "approved",
    humanReview: THREE_ROLES,
    rationale: "w12b fixture-content candidate, real review gates",
    policyVersion: POLICY_VERSION,
  });

  const status = await world.host.readCreatorVersionStatus("pipe:w12b-version-status", "1.0.0");
  assert.ok(!("reason" in status), "the decided arm is a review shape, never a refusal");
  if (!("reason" in status)) {
    assert.equal(status.outcome, "approved");
    assert.equal(status.decidedAt, decision.decidedAt, "decidedAt verbatim");
    assert.equal(status.decidedAt, FIXED_NOW);
    assert.equal(status.policyVersion, POLICY_VERSION, "policyVersion verbatim");
    assert.equal(status.rationale, "w12b fixture-content candidate, real review gates", "rationale verbatim");
    assert.deepEqual(status.reviewerRoles, ["product", "rights", "security"], "the three signoff roles");
    // The automated checks carry verbatim from the REAL lane (the lane's
    // own evidence grades — measured/fixture — never re-badged).
    assert.deepEqual(status.automatedChecks, [
      { checkId: "graph-validation", outcome: "pass", evidenceKind: "measured" },
      { checkId: "digest-integrity", outcome: "pass", evidenceKind: "measured" },
      { checkId: "license-presence", outcome: "pass", evidenceKind: "fixture" },
      { checkId: "sbom-presence", outcome: "pass", evidenceKind: "fixture" },
      { checkId: "unsafe-dependency-signal", outcome: "pass", evidenceKind: "fixture" },
      { checkId: "similarity-signal", outcome: "pass", evidenceKind: "fixture" },
    ]);
  }

  // The row agrees: the approved candidate is released + reviewedAt set.
  const row = (await world.host.listCreatorRecords(CREATOR)).find(
    (record) => record.pipelineId === "pipe:w12b-version-status",
  );
  assert.ok(row !== undefined);
  assert.equal(row.creatorState, "released");
  assert.equal(row.reviewedAt, decision.decidedAt);
});

test("W12B-2 version status: a REAL changes-requested decision projects verbatim — never misreported as unreviewed (W12-12)", async () => {
  const world = makeWorld();
  const candidate = seedSubmitted(world, "pipe:w12b-changes-decision");
  world.submission.runAutomatedChecks(candidate.candidateId, CLEAN_SIGNALS);
  world.review.recordReviewDecision({
    candidateId: candidate.candidateId,
    outcome: "changes-requested",
    humanReview: ONE_ROLE,
    rationale: "w12b changes requested rationale",
    policyVersion: POLICY_VERSION,
  });

  const status = await world.host.readCreatorVersionStatus("pipe:w12b-changes-decision", "1.0.0");
  assert.ok(!("reason" in status), "a changes-requested decision IS a real decision — never a false refusal");
  if (!("reason" in status)) {
    assert.equal(status.outcome, "changes-requested");
    assert.equal(status.policyVersion, POLICY_VERSION);
    assert.deepEqual(status.reviewerRoles, ["product"]);
  }

  const row = (await world.host.listCreatorRecords(CREATOR)).find(
    (record) => record.pipelineId === "pipe:w12b-changes-decision",
  );
  assert.ok(row !== undefined);
  assert.equal(row.creatorState, "changes-requested");
  assert.equal(row.reviewedAt, FIXED_NOW);
});

test("W12B-2 version status: submitted-but-unreviewed → the honest 'no review decision recorded' refusal (W12-12)", async () => {
  const world = makeWorld();
  seedSubmitted(world, "pipe:w12b-unreviewed");

  const status = await world.host.readCreatorVersionStatus("pipe:w12b-unreviewed", "1.0.0");
  assert.ok("reason" in status, "the honest refusal arm — never a fabricated decision");
  if ("reason" in status) {
    assert.equal(
      status.reason,
      "no review decision recorded for pipe:w12b-unreviewed v1.0.0 in the marketplace read model — the candidate is SUBMITTED and review has not rendered a decision yet",
      "the EXACT verbatim law + the honest cause",
    );
  }
});

test("W12B-2 version status: DRAFT and unknown (pipeline, version) refuse honestly with the same law (W12-12)", async () => {
  const world = makeWorld();
  seedDraft(world, "pipe:w12b-draft-only", "0.9.0");

  // A DRAFT has nothing submitted for review — the same law, DRAFT cause.
  const draftStatus = await world.host.readCreatorVersionStatus("pipe:w12b-draft-only", "0.9.0");
  assert.ok("reason" in draftStatus);
  if ("reason" in draftStatus) {
    assert.equal(
      draftStatus.reason,
      "no review decision recorded for pipe:w12b-draft-only v0.9.0 in the marketplace read model — the candidate is a DRAFT (private, no frozen digest; nothing has been submitted for review)",
    );
  }

  // An unknown (pipeline, version) is an honest absence — never fabricated.
  const unknownStatus = await world.host.readCreatorVersionStatus("pipe:unknown", "9.9.9");
  assert.ok("reason" in unknownStatus);
  if ("reason" in unknownStatus) {
    assert.equal(
      unknownStatus.reason,
      "no review decision recorded for pipe:unknown v9.9.9 in the marketplace read model — no candidate record exists for this pipeline and version (honest absence, never a fabricated decision)",
    );
  }
});
