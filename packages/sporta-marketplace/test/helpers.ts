/**
 * Shared fixtures for the W9B (Worker B) test suites.
 *
 * EVIDENCE CLASS: fixture CONTENT — the manifests/candidates/
 * reviewers/settlements here are deterministic test data; every
 * PROCESS observation (digests, transitions, settlement accounting,
 * admissions, refusals) is REAL and measured by the suites using
 * these helpers. Fixture reviewers and the fixture settlement
 * adapter are labeled FIXTURE; the record shapes they produce are
 * the real thing.
 */
import type {
  ContentHash,
  PolicySet,
} from "@sporta/contracts/contract";
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
  TransformReleaseCandidate,
} from "@sporta/transforms/contract";
import {
  DeclaredTransformCheckRunner,
  EntitlementService,
  FixtureDependencySignalSource,
  FixtureSettlementAdapter,
  FixtureSimilaritySignalSource,
  ListingSelectionService,
  ListingService,
  MarketplaceEntitlementError,
  PublicationService,
  Sha256MarketplaceHash,
  type MarketplaceClock,
  type TransformManifestReadPort,
  type TransformOfferTerms,
  type TransformReviewDecision,
} from "../src/contract.js";

export const hash = new Sha256MarketplaceHash();

/** Deterministic strictly-increasing clock (fixture-grade, labeled). */
export class StepClock implements MarketplaceClock {
  private currentMs: number;

  constructor(start = Date.parse("2026-10-13T00:00:00.000Z")) {
    this.currentMs = start;
  }

  now(): string {
    const stamp = new Date(this.currentMs).toISOString();
    this.currentMs += 1_000;
    return stamp;
  }

  /** Jump past an expiry (tests only). */
  advancePast(iso: string): void {
    this.currentMs = Date.parse(iso) + 1_000;
  }
}

export const EVENT_STREAM_DATAKIND = "sporta/json-event-stream";

export const testPolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

function makeTrimNode(componentDigest: string): TransformNode {
  return {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: { kind: "deterministic-filter", digest: componentDigest, name: "fixture-trim" },
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    parameterSchema: { startMs: { type: "number", required: true, minimum: 0 } },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "malformed input fails closed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
}

export function makeManifest(
  overrides: Partial<TransformPipelineManifest> & { componentDigest?: string; extraDependency?: { name: string; digest: string; license: string } } = {},
): TransformPipelineManifest {
  const { componentDigest = `sha256:${"a".repeat(64)}`, extraDependency, ...rest } = overrides;
  const pipelineId = rest.pipelineId ?? "pipe:test";
  const version = rest.version ?? "1.0.0";
  const manifest: TransformPipelineManifest = {
    pipelineId,
    version,
    // Distinct per pipeline+version so material-change detection is
    // meaningful (a version bump is a manifest change).
    manifestDigest: rest.manifestDigest ?? hash.text(`manifest:${pipelineId}:${version}`),
    publisher: "publisher:test",
    purpose: "test pipeline",
    limitations: ["test only"],
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    nodes: [makeTrimNode(componentDigest)],
    edges: [] as readonly TransformEdge[],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["out-of-window events dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [
      { kind: "dependency", name: "fixture-lib", digest: `sha256:${"c".repeat(64)}`, license: "MIT" },
      ...(extraDependency !== undefined
        ? [{ kind: "dependency" as const, name: extraDependency.name, digest: extraDependency.digest, license: extraDependency.license }]
        : []),
    ],
    licensing: { license: "MIT", provenance: "test" },
    policy: testPolicy,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 500, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    ...rest,
  };
  return manifest;
}

/** Fixture in-memory manifest store (TransformManifestReadPort). */
export class FixtureManifestStore implements TransformManifestReadPort {
  private readonly manifests = new Map<string, TransformPipelineManifest>();

  register(manifest: TransformPipelineManifest): void {
    this.manifests.set(`${manifest.pipelineId}@${manifest.version}@${manifest.manifestDigest}`, manifest);
  }

  /** Evict a manifest (tests: simulate an unresolvable seam). */
  evict(pipelineId: string): void {
    for (const [key, manifest] of this.manifests) {
      if (manifest.pipelineId === pipelineId) this.manifests.delete(key);
    }
  }

  readManifest(ref: { pipelineId: string; version: string; manifestDigest: ContentHash }): TransformPipelineManifest | null {
    return this.manifests.get(`${ref.pipelineId}@${ref.version}@${ref.manifestDigest}`) ?? null;
  }
}

export function makeContentHashes(salt: string): { kind: string; digest: ContentHash }[] {
  return [
    { kind: "source", digest: hash.text(`source:${salt}`) },
    { kind: "dependencies", digest: hash.text(`dependencies:${salt}`) },
    { kind: "runtime-image", digest: hash.text(`runtime:${salt}`) },
    { kind: "tests", digest: hash.text(`tests:${salt}`) },
  ];
}

export function makeAttestations(withSbom = true): { kind: string; reference: string }[] {
  return [
    { kind: "license", reference: "license:fixture" },
    ...(withSbom ? [{ kind: "sbom", reference: "sbom:fixture" }] : []),
    { kind: "provenance", reference: "provenance:fixture" },
  ];
}

/** FIXTURE reviewers — labeled; the record shape is what is real. */
export function fixtureReviewers(at = "2026-10-13T00:00:00.000Z") {
  return [
    { role: "product", reviewer: "reviewer:fixture-product", reviewedAt: at },
    { role: "rights", reviewer: "reviewer:fixture-rights", reviewedAt: at },
    { role: "security", reviewer: "reviewer:fixture-security", reviewedAt: at },
  ];
}

export const FREE_OFFER: TransformOfferTerms = {
  kind: "free",
  price: null,
  settlementProviderRef: null,
  usageLimits: { maxRuns: null, expiresAt: null },
  termsLicense: "MIT",
};

export const PAID_OFFER: TransformOfferTerms = {
  kind: "paid-per-run",
  price: { amount: 5, currency: "USD" },
  settlementProviderRef: "settlement:fixture",
  usageLimits: { maxRuns: 5, expiresAt: null },
  termsLicense: "commercial-1.0",
};

export const RIGHTS_PREREQUISITES = [
  "authorized source footage",
  "music and graphics clearance",
  "model and dataset licenses",
  "output use permission",
];

/** The full service graph, fixture-wired through the real ports. */
export interface MarketplaceWorld {
  clock: StepClock;
  manifestStore: FixtureManifestStore;
  settlement: FixtureSettlementAdapter;
  publications: PublicationService;
  listings: ListingService;
  entitlements: EntitlementService;
  selection: ListingSelectionService;
  dependencySignals: FixtureDependencySignalSource;
  similaritySignals: FixtureSimilaritySignalSource;
}

export function makeWorld(options: {
  flaggedDependencies?: Record<string, string>;
  similarityScores?: Record<string, number>;
  refuseSettlement?: (request: { principal: string; idempotencyKey: string }) => boolean;
} = {}): MarketplaceWorld {
  const clock = new StepClock();
  const manifestStore = new FixtureManifestStore();
  const dependencySignals = new FixtureDependencySignalSource(options.flaggedDependencies ?? {});
  const similaritySignals = new FixtureSimilaritySignalSource(options.similarityScores ?? {});
  const checks = new DeclaredTransformCheckRunner({ clock, hash, dependencySignals, similaritySignals });
  const publications = new PublicationService({ clock, hash, manifests: manifestStore, checks });
  const listings = new ListingService({ clock, publications });
  const settlement = new FixtureSettlementAdapter({
    refuseWhen: options.refuseSettlement ?? (() => false),
  });
  const entitlements = new EntitlementService({ clock, settlement, listings });
  const selection = new ListingSelectionService({ clock, listings, entitlements, publications, manifests: manifestStore });
  return { clock, manifestStore, settlement, publications, listings, entitlements, selection, dependencySignals, similaritySignals };
}

/** Submit a candidate for a pipeline version (register + submit + checks). */
export function submitCandidate(
  world: MarketplaceWorld,
  options: {
    pipelineId: string;
    version: string;
    salt: string;
    manifest?: TransformPipelineManifest;
    withSbom?: boolean;
    contentHashes?: { kind: string; digest: ContentHash }[];
    runChecks?: boolean;
    /** Set false to simulate an unresolvable manifest seam. */
    registerManifest?: boolean;
  },
) {
  const manifest = options.manifest ?? makeManifest({ pipelineId: options.pipelineId, version: options.version });
  if (options.registerManifest !== false) world.manifestStore.register(manifest);
  const draft = world.publications.registerDraft({
    pipelineId: options.pipelineId,
    version: options.version,
    manifestDigest: manifest.manifestDigest,
    contentHashes: options.contentHashes ?? makeContentHashes(options.salt),
    attestations: makeAttestations(options.withSbom ?? true),
    createdBy: "creator:test",
  });
  const submission = world.publications.submitDraft(draft.draftId);
  const report = options.runChecks === false ? null : world.publications.runAutomatedChecks(submission.candidate.candidateId);
  return { manifest, draft, submission, report };
}

/** Approve a checked submission with the fixture review panel. */
export function approveSubmission(world: MarketplaceWorld, submission: { candidate: TransformReleaseCandidate }): TransformReviewDecision {
  return world.publications.recordReviewDecision({
    candidateId: submission.candidate.candidateId,
    outcome: "approved",
    humanReview: fixtureReviewers(),
    policyVersion: "policy:fixture-v1",
    rationale: "fixture panel approval — record shape is real",
    evidenceRefs: ["report:fixture"],
  });
}

/** The happy-path listing input. */
export function listingInput(overrides: Partial<{ offer: TransformOfferTerms; rightsPrerequisites: string[]; maxRuns: number | null; expiresAt: string | null }> = {}) {
  return {
    title: "Fixture trim pipeline",
    description: "deterministic first-slice listing",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["no live feed claims"],
    publisher: "publisher:test",
    compatibility: ["local"],
    support: "publisher:test",
    offer:
      overrides.offer ??
      ({ ...FREE_OFFER, usageLimits: { maxRuns: overrides.maxRuns ?? null, expiresAt: overrides.expiresAt ?? null } } as TransformOfferTerms),
    expectations: { typicalLatencyMs: 500, declaredThroughput: "single stream", evidenceGrade: "fixture" as const },
    rightsPrerequisites: overrides.rightsPrerequisites ?? RIGHTS_PREREQUISITES,
    policy: testPolicy,
    changelog: "initial",
  };
}

/** A satisfying rights snapshot (typed evidence, P9-14). */
export function satisfyingRightsSnapshot() {
  return {
    snapshotId: "rights:fixture",
    capturedAt: "2026-10-13T00:00:00.000Z",
    satisfactions: RIGHTS_PREREQUISITES.map((prerequisite) => ({
      prerequisite,
      authorized: true,
      evidence: `fixture evidence for ${prerequisite}`,
    })),
    authorizedUsages: ["render", "derive"],
  };
}

/** The full reviewed journey: submit -> checks -> approve -> publish. */
export function publishRelease(
  world: MarketplaceWorld,
  options: {
    pipelineId: string;
    version: string;
    salt: string;
    offer?: TransformOfferTerms;
    maxRuns?: number | null;
    expiresAt?: string | null;
    similarity?: number;
  },
) {
  const { submission, report } = submitCandidate(world, {
    pipelineId: options.pipelineId,
    version: options.version,
    salt: options.salt,
  });
  const decision = approveSubmission(world, submission);
  const listing = world.listings.publishReviewedRelease(decision, listingInput({
    offer: options.offer,
    maxRuns: options.maxRuns ?? null,
    expiresAt: options.expiresAt ?? null,
  }));
  return { submission, report, decision, listing };
}

export { MarketplaceEntitlementError };
