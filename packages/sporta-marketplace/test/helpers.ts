/**
 * Shared fixtures for the Wave 9 Worker B test suites.
 *
 * EVIDENCE CLASS: fixture CONTENT — the manifests/candidates/signals
 * here are deterministic test data; every PROCESS observation (sha256
 * digest freezing/recomputation, the REAL w9a graph validator, state
 * machines, idempotency, byte-equality) is REAL and measured by the
 * suites that use these helpers.
 */
import type {
  PolicySet,
  TransformEdge,
  TransformNode,
  TransformOfferTerms,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
import { validateTransformPipelineManifest } from "@sporta/transforms/contract";
import { sha256Text } from "../src/contract.js";
import type { StartDraftInput, TransformRightsSnapshot } from "../src/contract.js";
import {
  EntitlementService,
  FeedLaunchAdmissionService,
  FixtureManifestSource,
  FixtureSettlementAdapter,
  FixedClock,
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
} from "../src/contract.js";

export const PIPELINE_ID = "pipe:test";
export const PRINCIPAL = "user:test";
export const RIGHTS_PREREQUISITE = "authorized source footage";

export const testPolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** REAL per-version manifest digest (sha256 of the version identity). */
export function manifestDigestFor(version: string): string {
  return sha256Text(`manifest@${version}`);
}

/** A valid single-node deterministic-filter manifest (fixture content). */
export function makeManifest(
  overrides: Partial<TransformPipelineManifest> & { version?: string } = {},
): TransformPipelineManifest {
  const version = overrides.version ?? "1.0.0";
  const node: TransformNode = {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: `sha256:${"c".repeat(64)}`,
      name: "json-event-stream-trim",
    },
    inputs: [
      {
        name: "events",
        dataKind: "sporta/json-event-stream",
        required: true,
        cardinality: "stream",
      },
    ],
    outputs: [
      {
        name: "events",
        dataKind: "sporta/json-event-stream",
        required: true,
        cardinality: "stream",
      },
    ],
    parameterSchema: { startMs: { type: "number", required: true, minimum: 0 } },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "malformed input fails closed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
  return {
    pipelineId: PIPELINE_ID,
    manifestDigest: manifestDigestFor(version),
    publisher: "publisher:test",
    purpose: "test pipeline",
    limitations: ["test only"],
    inputs: [
      {
        name: "events",
        dataKind: "sporta/json-event-stream",
        required: true,
        cardinality: "stream",
      },
    ],
    outputs: [
      {
        name: "events",
        dataKind: "sporta/json-event-stream",
        required: true,
        cardinality: "stream",
      },
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
    policy: testPolicy,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: {
      typicalLatencyMs: 500,
      declaredThroughput: "single stream",
      evidenceGrade: "fixture",
    },
    ...overrides,
    version,
  };
}

/** Candidate input with REAL sha256 content digests (fixture bytes). */
export function makeCandidateInput(
  version: string,
  overrides: Partial<StartDraftInput> = {},
): StartDraftInput {
  const hash = new Sha256MarketplaceHash();
  return {
    pipelineId: PIPELINE_ID,
    version,
    manifestDigest: manifestDigestFor(version),
    contentHashes: [
      { kind: "code", digest: hash.text(`code-source@${version}`) },
      { kind: "runtime", digest: hash.text(`runtime@${version}`) },
    ],
    attestations: [
      { kind: "license", reference: `license:${version}` },
      { kind: "sbom", reference: `sbom:${version}` },
    ],
    submittedBy: "publisher:test",
    ...overrides,
  };
}

export function freeOffer(): TransformOfferTerms {
  return {
    kind: "free",
    price: null,
    settlementProviderRef: null,
    usageLimits: { maxRuns: null, expiresAt: null },
    termsLicense: "MIT",
  };
}

export function paidOffer(
  usageLimits: { maxRuns: number | null; expiresAt: string | null } = {
    maxRuns: null,
    expiresAt: null,
  },
): TransformOfferTerms {
  return {
    kind: "paid-per-run",
    price: { amount: 4.99, currency: "USD" },
    settlementProviderRef: "fixture-settlement",
    usageLimits,
    termsLicense: "commercial",
  };
}

/** The three canonical reviewer signoffs (fixture reviewers, honest labels). */
export function threeRoleSignoff() {
  return [
    {
      role: "product",
      reviewer: "reviewer:product-fixture",
      reviewedAt: "2026-10-13T01:00:00.000Z",
    },
    { role: "rights", reviewer: "reviewer:rights-fixture", reviewedAt: "2026-10-13T01:01:00.000Z" },
    {
      role: "security",
      reviewer: "reviewer:security-fixture",
      reviewedAt: "2026-10-13T01:02:00.000Z",
    },
  ];
}

export const defaultSignals = {
  dependencySignals: { "trim-script": "clean" } as Readonly<
    Record<string, "clean" | "unknown" | "unsafe">
  >,
  similaritySignal: null as { present: boolean; note: string } | null,
};

export const satisfyingRightsSnapshot: TransformRightsSnapshot = {
  satisfied: [RIGHTS_PREREQUISITE],
  evidenceRefs: ["rights:fixture-authorization"],
};

/** The fully wired composition root (all adapters injected). */
export function makeWorld(
  options: {
    settleRefuse?: { kind: "provider-unavailable" | "quota-exhausted"; detail: string };
  } = {},
) {
  const clock = new FixedClock("2026-10-13T00:00:00.000Z");
  const hash = new Sha256MarketplaceHash();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const suspensions = new InMemorySuspensionStore();
  const events = new InMemoryListingStateEventStore();
  const manifests = new FixtureManifestSource();
  const settlements = new FixtureSettlementAdapter(
    options.settleRefuse === undefined ? {} : { refuseWith: options.settleRefuse },
  );

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
  const entitlement = new EntitlementService({ clock, hash, listings, entitlements, settlements });
  const admission = new FeedLaunchAdmissionService({
    clock,
    hash,
    listings,
    entitlements,
    candidates,
    manifests,
  });

  return {
    clock,
    hash,
    candidates,
    decisions,
    lanes,
    listings,
    entitlements,
    suspensions,
    events,
    manifests,
    settlements,
    submission,
    review,
    listing,
    entitlement,
    admission,
  };
}

/** The full happy-path lifecycle: draft -> submit -> checks -> approve -> publish. */
export async function publishFullLifecycle(
  world: ReturnType<typeof makeWorld>,
  input: {
    version: string;
    offer: TransformOfferTerms;
    manifest?: TransformPipelineManifest;
    signals?: typeof defaultSignals;
    rightsPrerequisites?: readonly string[];
  },
) {
  const manifest = input.manifest ?? makeManifest({ version: input.version });
  world.manifests.register(manifest);
  const draft = world.submission.startDraft(
    makeCandidateInput(input.version, {
      manifestDigest: manifest.manifestDigest,
    }),
  );
  const submitted = world.submission.submitCandidate(draft.candidateId);
  const lane = world.submission.runAutomatedChecks(
    draft.candidateId,
    input.signals ?? defaultSignals,
  );
  const decision = world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: threeRoleSignoff(),
    rationale: "fixture-content pipeline, real process evidence",
    policyVersion: "policy:test-v1",
  });
  const listing = world.listing.publishApprovedRelease({
    candidateId: draft.candidateId,
    title: `Test pipeline ${input.version}`,
    description: "fixture-content listing",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["test only"],
    compatibility: ["local"],
    support: "publisher:test",
    offer: input.offer,
    rightsPrerequisites: input.rightsPrerequisites ?? [RIGHTS_PREREQUISITE],
    changelog: `release ${input.version}`,
  });
  return { draft, submitted, lane, decision, listing };
}
