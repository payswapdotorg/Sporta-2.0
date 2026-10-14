/**
 * W10C-1 support — the composed-slice world construction (P10-16).
 *
 * Builds the REAL marketplace lifecycle composition (the
 * sporta-marketplace makeWorld precedent, reconstructed here from the
 * PUBLIC `@sporta/marketplace/contract` entrypoint because test helpers
 * are not package exports) plus the two-node composed pipeline
 * manifest (deterministic trim node -> pinned sandbox model node).
 *
 * EVIDENCE CLASS: the SERVICES and LAWS exercised here are REAL (the
 * REAL submission/check-lane/review/listing/entitlement/admission
 * services over the REAL sha256 hash + REAL w9a graph validator); the
 * STORES are the package's own clearly-labeled in-memory adapters, the
 * manifest source is the package's own FIXTURE-labeled read port
 * (registered with the exact manifest under review), and the human
 * reviewers are FIXTURE identities signing REAL review decisions —
 * every precedent of the sporta-marketplace test suite, labeled the
 * same way. The live/model legs are constructed by the test itself.
 */
import {
  DeterministicComponentStore,
  jsonEventStreamTrimComponent,
  Sha256TransformHash,
  validateTransformPipelineManifest,
} from "@sporta/transforms/contract";
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
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
} from "@sporta/marketplace/contract";
import type {
  TransformLaunchDisclosure,
  TransformListing,
  TransformListingSelectionResult,
  TransformReviewDecision,
} from "@sporta/marketplace/contract";
import { SPORTA_HOST_POLICY } from "../../src/sporta/hostSeeds.js";

/** Fixed clock stamp for the marketplace records (deterministic ids). */
export const MARKET_FIXED_NOW = "2026-10-15T09:00:00.000Z";
/** The composed slice's pipeline identity. */
export const COMPOSED_PIPELINE_ID = "pipe:w10c-composed-slice";
export const COMPOSED_VERSION = "1.0.0";
export const COMPOSED_PRINCIPAL = "user:w10c-operator";
export const COMPOSED_RIGHTS_PREREQUISITE = "authorized source footage";

/** The live feed's provenance descriptor (the liveIngressRun precedent's shape). */
export const LIVE_FEED_PROVENANCE = {
  sourceKind: "authorized-source",
  sourceRef: "source:w10c-live-feed-1",
  capturedAt: "2026-10-15T00:00:00.000Z",
  confidence: 0.95,
} as const;

/** The pinned sandbox model component (the W10B lane's exact pin). */
export const MODEL_NODE_ID = "node:model";
export const TRIM_NODE_ID = "node:trim";
export const MODEL_REF = {
  name: "glm-sandbox-summarizer",
  digest: `sha256:${"7".repeat(64)}`,
} as const;

const transformHash = new Sha256TransformHash();
/** The REAL pinned trim component (digest computed from its exact source). */
export const trimComponent = jsonEventStreamTrimComponent(transformHash);

/** The model node's declared error/fallback behavior variant under test. */
export type ComposedModelErrorMode = "declared-fallback" | "fail-closed";

const MODEL_ERROR_CONTRACTS: Readonly<Record<ComposedModelErrorMode, string>> = {
  "declared-fallback":
    "model refusals degrade to the deterministic-node variant: identity pass-through of the deterministic lane output, recorded as fallback-used with the typed refusal (P10-16 degradation law)",
  "fail-closed": "model lane failures are typed failures, never silent",
};

const STREAM = {
  name: "events",
  dataKind: "sporta/json-event-stream",
  required: true,
  cardinality: "stream" as const,
};
const SUMMARY = {
  name: "summary",
  dataKind: "sporta/json-summary",
  required: true,
  cardinality: "single" as const,
};

/** The trim node pinning the REAL deterministic component. */
function makeTrimNode(): TransformNode {
  return {
    nodeId: TRIM_NODE_ID,
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: trimComponent.digest,
      name: trimComponent.name,
    },
    inputs: [STREAM],
    outputs: [STREAM],
    parameterSchema: {
      startMs: { type: "number", required: true, minimum: 0 },
      endMs: { type: "number", required: true, minimum: 0 },
    },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "out-of-window or malformed input fails closed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
}

/**
 * The model node pinning the sandbox model component. The node's
 * sandbox envelope follows the W10B-4 studio precedent: default-deny
 * (`networkEgress: "denied"`) — the adapter's real network call is the
 * HOST-layer leg injected through the frozen `TransformModelPort`.
 */
function makeModelNode(mode: ComposedModelErrorMode): TransformNode {
  return {
    nodeId: MODEL_NODE_ID,
    kind: "model",
    componentRef: { kind: "model", digest: MODEL_REF.digest, name: MODEL_REF.name },
    inputs: [STREAM],
    outputs: [SUMMARY],
    parameterSchema: {},
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: mode, contract: MODEL_ERROR_CONTRACTS[mode] },
    provenanceRules: ["model output labeled with its evidence grade"],
  };
}

/** The composed two-node manifest (trim -> model), digest frozen per mode. */
export function makeComposedManifest(mode: ComposedModelErrorMode): TransformPipelineManifest {
  const nodes = [makeTrimNode(), makeModelNode(mode)];
  const edges: readonly TransformEdge[] = [
    { from: { nodeId: TRIM_NODE_ID, port: "events" }, to: { nodeId: MODEL_NODE_ID, port: "events" } },
  ];
  return {
    pipelineId: COMPOSED_PIPELINE_ID,
    version: COMPOSED_VERSION,
    manifestDigest: transformHash.text(`w10c-composed-slice:${mode}`),
    publisher: "publisher:w10c",
    purpose: "P10-16 composed slice: a live source through admission into a real model-node run",
    limitations: ["lane proof pipeline — never a product listing"],
    inputs: [STREAM],
    outputs: [SUMMARY],
    nodes,
    edges,
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: [
        "events outside the window are dropped (counted)",
        "model output replaces the trimmed event stream",
      ],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["sandbox model summary over the trimmed live stream"],
    pinnedDependencies: [
      {
        kind: "code",
        name: trimComponent.name,
        digest: trimComponent.digest,
        license: "MIT",
        storageRef: "fabric:store",
      },
      {
        kind: "model",
        name: MODEL_REF.name,
        digest: MODEL_REF.digest,
        license: "sandbox",
        storageRef: "sandbox:zai-glm",
      },
    ],
    licensing: { license: "UNREVIEWED", provenance: "w10c composed-slice lane proof" },
    policy: SPORTA_HOST_POLICY,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: {
      typicalLatencyMs: 2_000,
      declaredThroughput: "single live stream",
      evidenceGrade: "declared",
    },
  };
}

/** The component store the run service resolves the trim node against. */
export function makeComponentStore(): DeterministicComponentStore {
  return new DeterministicComponentStore([trimComponent], transformHash);
}

/** The REAL marketplace lifecycle composition (every service injected). */
export function makeMarketplaceWorld() {
  const clock = new FixedClock(MARKET_FIXED_NOW);
  const hash = new Sha256MarketplaceHash();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const suspensions = new InMemorySuspensionStore();
  const events = new InMemoryListingStateEventStore();
  const manifests = new FixtureManifestSource();
  const settlements = new FixtureSettlementAdapter();
  return {
    hash,
    manifests,
    submission: new SubmissionService({
      clock,
      hash,
      candidates,
      lanes,
      manifests,
      validateGraph: validateTransformPipelineManifest,
    }),
    review: new ReviewService({ clock, hash, candidates, decisions, lanes }),
    listing: new ListingService({
      clock,
      hash,
      candidates,
      decisions,
      listings,
      suspensions,
      events,
      manifests,
    }),
    entitlement: new EntitlementService({ clock, hash, listings, entitlements, settlements }),
    admission: new FeedLaunchAdmissionService({
      clock,
      hash,
      listings,
      entitlements,
      candidates,
      manifests,
    }),
  };
}

/** The three canonical reviewer signoffs (FIXTURE reviewer identities, REAL decision records). */
function threeRoleSignoff() {
  return [
    { role: "product", reviewer: "reviewer:product-fixture", reviewedAt: "2026-10-15T09:10:00.000Z" },
    { role: "rights", reviewer: "reviewer:rights-fixture", reviewedAt: "2026-10-15T09:11:00.000Z" },
    { role: "security", reviewer: "reviewer:security-fixture", reviewedAt: "2026-10-15T09:12:00.000Z" },
  ];
}

/** Everything the composed slice needs from ONE full admission lineage. */
export interface ComposedAdmissionResult {
  readonly lane: { readonly results: readonly { checkId: string; outcome: string; detail: string }[] };
  readonly decision: TransformReviewDecision;
  readonly listing: TransformListing;
  readonly disclosure: TransformLaunchDisclosure;
  readonly selection: TransformListingSelectionResult;
}

/**
 * Drive the REAL marketplace lifecycle over the composed manifest:
 * registration -> draft -> submit -> automated gates -> 3-role review
 * -> publish -> free entitlement -> disclosure -> `selectForLaunch`.
 * Every leg is the REAL service; the stores/reviewers are the
 * honestly-labeled in-memory/fixture adapters (the makeWorld precedent).
 */
export async function admitComposedPipeline(
  world: ReturnType<typeof makeMarketplaceWorld>,
  manifest: TransformPipelineManifest,
): Promise<ComposedAdmissionResult> {
  world.manifests.register(manifest);
  const draft = world.submission.startDraft({
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    manifestDigest: manifest.manifestDigest,
    contentHashes: [
      { kind: "code", digest: world.hash.text(`code@${manifest.manifestDigest}`) },
      { kind: "model", digest: MODEL_REF.digest },
      { kind: "runtime", digest: world.hash.text(`runtime@${manifest.manifestDigest}`) },
    ],
    attestations: [
      { kind: "license", reference: "license:w10c-composed-slice" },
      { kind: "sbom", reference: "sbom:w10c-composed-slice" },
    ],
    submittedBy: manifest.publisher,
  });
  world.submission.submitCandidate(draft.candidateId);
  const lane = world.submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: {
      [trimComponent.name]: "clean",
      [MODEL_REF.name]: "clean",
    },
    similaritySignal: null,
  });
  const decision = world.review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: threeRoleSignoff(),
    rationale:
      "composed-slice lane proof: deterministic + model nodes over the real gates (fixture reviewer identities)",
    policyVersion: "policy:w10c-slice-v1",
  });
  const listing = world.listing.publishApprovedRelease({
    candidateId: draft.candidateId,
    title: "W10C composed slice (trim -> sandbox model)",
    description: "P10-16 vertical slice: a live source through admission into a real model-node run",
    category: "video",
    supportedFeedTypes: ["live-local", "prerecorded"],
    expectedOutputs: [...manifest.expectedOutputs],
    limitations: [...manifest.limitations],
    compatibility: ["local"],
    support: manifest.publisher,
    offer: {
      kind: "free",
      price: null,
      settlementProviderRef: null,
      usageLimits: { maxRuns: null, expiresAt: null },
      termsLicense: "sandbox",
    },
    rightsPrerequisites: [COMPOSED_RIGHTS_PREREQUISITE],
    changelog: "w10c composed-slice release",
  });
  await world.entitlement.grantEntitlement({
    principal: COMPOSED_PRINCIPAL,
    listingId: listing.listingId,
  });
  const disclosure = world.admission.buildLaunchDisclosure(listing.listingId);
  const selection = world.admission.selectForLaunch({
    listingId: listing.listingId,
    principal: COMPOSED_PRINCIPAL,
    rightsSnapshot: {
      satisfied: [COMPOSED_RIGHTS_PREREQUISITE],
      evidenceRefs: ["rights:w10c-operator-authorization"],
    },
  });
  return { lane, decision, listing, disclosure, selection };
}
