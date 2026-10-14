/**
 * W10C-1 / P10-16 — the composed vertical slice: a REAL local live
 * source through the REAL marketplace admission into ONE transform
 * run whose model node invokes the REAL sandbox model service through
 * the frozen `TransformModelPort` (packages/web, node:test + tsx —
 * the project law; the web package is the ONLY SDK-importing package,
 * P10-18 — this test imports the adapter, never the SDK directly).
 *
 * EVIDENCE CLASS (labeled per the project vocabulary):
 *   - REAL (marketplace legs): the REAL `@sporta/marketplace`
 *     lifecycle — submission digest freezing, the automated check
 *     lane over the REAL w9a graph validator, 3-role review
 *     approval, publish, free-offer entitlement, fail-closed
 *     `selectForLaunch` admission and the typed launch disclosure —
 *     over in-memory stores (fixture-grade persistence, the W9B/W10A
 *     composition precedent).
 *   - REAL (live leg): a `RealLocalHttpLiveSourceAdapter` session —
 *     a real node:http server streaming NDJSON event frames at the
 *     declared cadence on an ephemeral port, drained by the real
 *     client (grade `real-local-live`, the W10A precedent).
 *   - REAL (deterministic lane): a real child process per step with
 *     measured timing and in-process carry-forward re-verification.
 *   - REAL-or-typed-refusal (model leg): the REAL `SandboxModelAdapter`
 *     behind the frozen port. With the default client the model step
 *     makes a REAL network call through z-ai-web-dev-sdk (grade
 *     `real`, measured latency, honest cost null). If the sandbox
 *     service refuses at run time (quota/outage), the slice degrades
 *     to the deterministic-node variant THROUGH the declared-fallback
 *     seam: `fallback-used` + the typed refusal are recorded in the
 *     manifest and NO real-model output is claimed — the P10-16
 *     quota-degradation law, never silent. The test detects the
 *     regime from the actual invocation result, never an env flag.
 *   - FIXTURE (labeled): the seed CONTENT (the pipeline manifest, the
 *     synthetic digests, the w10c reviewer identities — the review
 *     PROCESS is real, the reviewers are test fixtures), the
 *     in-memory artifact blob store, and — in the degraded-regime
 *     test ONLY — a recording client at the adapter's documented
 *     injection seam replaying the real service's own HTTP 429 error
 *     class (a deterministic refusal-arm proof; never claimed as a
 *     real network refusal).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixedClock,
  jsonEventStreamTrimComponent,
  LiveTransformRunService,
  RealLocalHttpLiveSourceAdapter,
  Sha256TransformHash,
  TransformRunService,
  validateTransformPipelineManifest,
} from "@sporta/transforms/contract";
import type {
  LiveSourceDescriptor,
  LiveTransformRunManifest,
  StartLiveTransformRunInput,
  TransformEdge,
  TransformModelPort,
  TransformNode,
  TransformPipelineManifest,
  TransformRunManifest,
} from "@sporta/transforms/contract";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "@sporta/artifacts/contract";
import {
  EntitlementService,
  FeedLaunchAdmissionService,
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
} from "@sporta/marketplace/contract";
import type {
  TransformLaunchDisclosure,
  TransformListing,
  TransformListingSelectionResult,
} from "@sporta/marketplace/contract";
import { SandboxModelAdapter } from "../src/sporta/providers/sandboxModelAdapter.js";
import type {
  SandboxChatCompletionClient,
  SandboxChatCompletionRequest,
} from "../src/sporta/providers/sandboxModelAdapter.js";
import { SPORTA_HOST_POLICY } from "../src/sporta/hostSeeds.js";

const MODEL_REF = { name: "glm-sandbox-summarizer", digest: `sha256:${"7".repeat(64)}` };
const PIPELINE_ID = "pipe:w10c-composed";
const PRINCIPAL = "user:w10c-operator";
const RIGHTS_PREREQUISITE = "authorized source footage";
const MARKETPLACE_FIXED = "2026-10-15T07:00:00.000Z";
const RUN_CLOCK_FIXED = "2026-10-15T08:00:00.000Z";
const FREE_OFFER = {
  kind: "free" as const,
  price: null,
  settlementProviderRef: null,
  usageLimits: { maxRuns: null, expiresAt: null },
  termsLicense: "MIT",
};

const STREAM = { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" as const };
const SUMMARY = { name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" as const };

const LIVE_DESCRIPTOR: LiveSourceDescriptor = {
  sourceId: "live:w10c-match-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};

const transformHash = new Sha256TransformHash();
const trimComponent = jsonEventStreamTrimComponent(transformHash);
const componentStore = new DeterministicComponentStore([trimComponent], transformHash);

/** Deterministic NDJSON event frames (the canonical 5-event shape; window [1500,4500] keeps 3, drops 2). */
function ndjsonEventFrames(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      eventId: `evt-${index + 1}`,
      entityId: index % 2 === 0 ? "team-A" : "team-B",
      atMs: 1000 + index * 1000,
      confidence: 0.3 + index / 10,
      provenance: { sourceKind: "observation", sourceRef: `source:${index + 1}`, capturedAt: "2026-10-13T00:00:00.000Z" },
    }),
  );
}

/** The composed pipeline: a REAL deterministic trim node feeding a model node pinned to the sandbox model ref. */
function makeComposedManifest(): TransformPipelineManifest {
  const trimNode: TransformNode = {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: { kind: "deterministic-filter", digest: trimComponent.digest, name: trimComponent.name },
    inputs: [STREAM],
    outputs: [STREAM],
    parameterSchema: { startMs: { type: "number", required: true, minimum: 0 }, endMs: { type: "number", required: true, minimum: 0 } },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "out-of-window or malformed input fails closed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
  const modelNode: TransformNode = {
    nodeId: "node:model",
    kind: "model",
    componentRef: { kind: "model", digest: MODEL_REF.digest, name: MODEL_REF.name },
    inputs: [STREAM],
    outputs: [SUMMARY],
    parameterSchema: {},
    requiredPermissions: [],
    // The studio-envelope precedent (W10B-4): the NODE's sandbox declares
    // no egress (default-deny); the adapter's REAL network call is a
    // HOST-layer leg injected through the frozen port.
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 30_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: {
      mode: "declared-fallback",
      contract: "a refused model call degrades to the deterministic-node variant (identity pass-through) with the typed refusal recorded",
    },
    provenanceRules: ["model output labeled with its evidence grade"],
  };
  const edges: readonly TransformEdge[] = [
    { from: { nodeId: "node:trim", port: "events" }, to: { nodeId: "node:model", port: "events" } },
  ];
  return {
    pipelineId: PIPELINE_ID,
    version: "1.0.0",
    manifestDigest: transformHash.text(`${PIPELINE_ID}@1.0.0`),
    publisher: "publisher:w10c",
    purpose: "P10-16 composed slice: live ingress through admission with a real model node",
    limitations: ["lane-proof pipeline — the model lane is the sandbox model service, honestly labeled"],
    inputs: [STREAM],
    outputs: [SUMMARY],
    nodes: [trimNode, modelNode],
    edges,
    semantics: {
      preservationClaims: ["kept events carry identity/order/timestamps/provenance unchanged through the trim node"],
      declaredChanges: [
        "events outside the window drop (counted); the model node replaces the stream with a summary or degrades per its declared fallback",
      ],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed live event stream, then a model summary (or the declared fallback variant)"],
    pinnedDependencies: [
      { kind: "code", name: trimComponent.name, digest: trimComponent.digest, license: "MIT", storageRef: "fabric:local-component-store" },
      { kind: "model", name: MODEL_REF.name, digest: MODEL_REF.digest, license: "sandbox", storageRef: "sandbox:zai-glm" },
    ],
    licensing: { license: "MIT", provenance: "w10c lane proof" },
    policy: SPORTA_HOST_POLICY,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 2_000, declaredThroughput: "single live session", evidenceGrade: "declared" },
  };
}

/** The admitted slice: the manifest plus the REAL lifecycle's listing/disclosure/admission records. */
interface AdmittedSlice {
  readonly manifest: TransformPipelineManifest;
  readonly listing: TransformListing;
  readonly disclosure: TransformLaunchDisclosure;
  readonly admitted: Extract<TransformListingSelectionResult, { admitted: true }>;
}

/**
 * The REAL marketplace lifecycle for the composed pipeline (EVIDENCE
 * CLASS: REAL process over fixture-grade in-memory stores and fixture
 * seed content): draft -> submit (digest frozen) -> automated gates
 * (the REAL w9a validator) -> 3-role review -> publish -> entitlement
 * -> `selectForLaunch` admission, with the digest byte-equality law
 * asserted at every hop.
 */
async function admitComposedPipeline(): Promise<AdmittedSlice> {
  const manifest = makeComposedManifest();
  const clock = new MarketplaceFixedClock(MARKETPLACE_FIXED);
  const hash = new Sha256MarketplaceHash();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const suspensions = new InMemorySuspensionStore();
  const events = new InMemoryListingStateEventStore();
  const manifests = new FixtureManifestSource();
  manifests.register(manifest);

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
  const entitlement = new EntitlementService({ clock, hash, listings, entitlements, settlements: new FixtureSettlementAdapter() });
  const admission = new FeedLaunchAdmissionService({ clock, hash, listings, entitlements, candidates, manifests });

  const draft = submission.startDraft({
    pipelineId: PIPELINE_ID,
    version: "1.0.0",
    manifestDigest: manifest.manifestDigest,
    contentHashes: [
      { kind: "code", digest: hash.text("w10c-composed-code@1.0.0") },
      { kind: "model", digest: MODEL_REF.digest },
    ],
    attestations: [
      { kind: "license", reference: "license:w10c-1.0.0" },
      { kind: "sbom", reference: "sbom:w10c-1.0.0" },
    ],
    submittedBy: "publisher:w10c",
  });
  const submitted = submission.submitCandidate(draft.candidateId);
  assert.equal(submitted.lifecycle, "SUBMITTED");
  assert.ok(submitted.candidateDigest !== null, "submission froze the candidate digest once");

  const lane = submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { [trimComponent.name]: "clean", [MODEL_REF.name]: "clean" },
    similaritySignal: null,
  });
  assert.deepEqual(
    lane.results.filter((result) => result.outcome === "fail"),
    [],
    "every automated gate passed over the composed deterministic+model graph",
  );
  const graphGate = lane.results.find((result) => result.checkId === "graph-validation");
  assert.ok(graphGate !== undefined);
  assert.equal(graphGate.evidenceKind, "measured");
  assert.match(graphGate.detail, /typed DAG validation passed \(2 nodes, 1 edges\)/);

  const decision = review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: [
      { role: "product", reviewer: "reviewer:w10c-product", reviewedAt: MARKETPLACE_FIXED },
      { role: "rights", reviewer: "reviewer:w10c-rights", reviewedAt: MARKETPLACE_FIXED },
      { role: "security", reviewer: "reviewer:w10c-security", reviewedAt: MARKETPLACE_FIXED },
    ],
    rationale: "P10-16 composed slice: deterministic + sandbox-model nodes over a live source",
    policyVersion: "policy:w10c-v1",
  });
  assert.equal(decision.outcome, "approved");
  assert.deepEqual(decision.humanReview.map((entry) => entry.role), ["product", "rights", "security"]);

  const published = listing.publishApprovedRelease({
    candidateId: draft.candidateId,
    title: "W10C composed slice (live trim + sandbox summary)",
    description: "the P10-16 vertical-slice pipeline",
    category: "video",
    supportedFeedTypes: ["live", "prerecorded"],
    expectedOutputs: ["trimmed live event stream, then a model summary (or the declared fallback variant)"],
    limitations: [...manifest.limitations],
    compatibility: ["local"],
    support: "publisher:w10c",
    offer: FREE_OFFER,
    rightsPrerequisites: [RIGHTS_PREREQUISITE],
    changelog: "w10c 1.0.0 — the composed-slice release",
  });
  assert.equal(published.status, "PUBLISHED");

  const granted = await entitlement.grantEntitlement({ principal: PRINCIPAL, listingId: published.listingId });
  assert.equal(granted.status, "active");

  const disclosure = admission.buildLaunchDisclosure(published.listingId);
  const selection = admission.selectForLaunch({
    listingId: published.listingId,
    principal: PRINCIPAL,
    rightsSnapshot: {
      satisfied: [RIGHTS_PREREQUISITE],
      evidenceRefs: ["rights:w10c-operator-authorization"],
    },
  });
  if (!selection.admitted) {
    assert.fail(`selectForLaunch refused the composed listing: ${selection.reason} — ${selection.detail}`);
  }

  // THE P10-16 byte-equality law: listing -> disclosure -> admission.
  assert.equal(published.currentRelease.releaseDigest, disclosure.releaseDigest);
  assert.equal(selection.releaseDigest, published.currentRelease.releaseDigest, "admission digest byte-equals the listing digest");
  assert.equal(selection.releaseDigest, disclosure.releaseDigest, "admission digest byte-equals the disclosure digest");
  assert.equal(selection.entitlementId, granted.entitlementId);
  // The disclosure never hides the composed pipeline's pinned dependencies.
  assert.deepEqual(
    disclosure.dependencies.map((dependency) => dependency.name),
    [trimComponent.name, MODEL_REF.name],
  );
  return { manifest, listing: published, disclosure, admitted: selection };
}

/** The composed run service: the EXISTING TransformRunService under LiveTransformRunService, models port injected. */
function makeComposedRunService(models: TransformModelPort): { live: LiveTransformRunService; runs: TransformRunService } {
  const runs = new TransformRunService({
    clock: new FixedClock(RUN_CLOCK_FIXED),
    hash: transformHash,
    artifacts: new ArtifactGraphService({ now: () => RUN_CLOCK_FIXED }),
    blobs: new InMemoryArtifactBlobStore((bytes) => transformHash.bytes(bytes)),
    models, // the frozen port seam — the ONLY way the run sees the model provider
    deterministic: new DeterministicFilterNodeAdapter({ store: componentStore }),
    components: componentStore,
  });
  return { live: new LiveTransformRunService({ runs }), runs };
}

/** The live-run input minus the live source: the admitted release digest pinned into the run over the drained live feed. */
function composedLiveRunInput(slice: AdmittedSlice): Omit<StartLiveTransformRunInput, "liveSource"> {
  return {
    run: {
      manifest: slice.manifest,
      workGraph: { workGraphId: "wg:w10c-composed-slice", runRef: "run:w10c-composed-slice-1" },
      parameters: { "node:trim": { startMs: 1500, endMs: 4500 }, "node:model": {} },
      releaseDigest: slice.admitted.releaseDigest, // the ADMITTED release pinned into the run record
    },
    feed: {
      artifactRef: "art:w10c-live-feed-1",
      rightsSnapshot: "rights:w10c-live-snapshot-1",
      provenance: { sourceKind: "authorized-source", sourceRef: "live:w10c-match-1", capturedAt: RUN_CLOCK_FIXED },
    },
  };
}

/** Invariants holding in BOTH quota regimes (the P10-16 pinning laws). */
function assertCommonSliceInvariants(run: LiveTransformRunManifest, slice: AdmittedSlice): void {
  // The LIVE evidence — the exact honest grade string, never inflated.
  assert.equal(run.liveSessions.length, 1);
  const evidence = run.liveSessions[0]!;
  assert.equal(evidence.descriptor.grade, "real-local-live", "the exact live grade string is pinned");
  assert.equal(evidence.descriptor.sourceId, "live:w10c-match-1");
  assert.equal(evidence.framesConsumed, 5, "the real session's frame statistics are pinned");
  assert.equal(evidence.closeReason, "completed");
  assert.equal(evidence.refusal, null);
  assert.ok(!Number.isNaN(Date.parse(evidence.openedAt)), "openedAt is a real timestamp");

  // The deterministic leg REALLY ran over the drained live frames.
  const trimStep = run.steps.find((step) => step.nodeId === "node:trim");
  assert.ok(trimStep !== undefined);
  assert.equal(trimStep.status, "succeeded", "the deterministic-node variant ran over the live frames");
  assert.ok(trimStep.timingMs > 0, "real child-process timing");
  assert.match(trimStep.detail, /3 kept byte-exact, 2 dropped/);

  // The admission digest is pinned into the run record (listing -> admission -> run).
  assert.equal(run.release.pipelineId, PIPELINE_ID);
  assert.equal(run.release.version, "1.0.0");
  assert.equal(run.release.releaseDigest, slice.admitted.releaseDigest, "the run pins the ADMITTED release digest");

  // The live feed entered exactly like a fixture feed; the frozen manifest shape holds.
  assert.deepEqual(run.inputs, [{ artifactRef: "art:w10c-live-feed-1", rightsSnapshot: "rights:w10c-live-snapshot-1" }]);
  const asFrozen: TransformRunManifest = run;
  assert.equal(asFrozen.runManifestId, run.runManifestId);
  assert.equal(run.outputs.length, 2, "the trim revision plus exactly one model-lane revision (real or fallback)");
  assert.ok(!JSON.stringify(run).includes("production"), "the grade-label law: production is unutterable");
  assert.equal(run.semanticFidelity.grade, "measured", "the deterministic lane's carry-forward is measured in-process");
}

test("W10C-1 / P10-16 REAL composed slice: a live source through REAL admission into a run with a REAL model-node invocation — both evidence grades pinned (quota-regime adaptive)", async () => {
  const slice = await admitComposedPipeline();
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(5) });
  try {
    const { live, runs } = makeComposedRunService(new SandboxModelAdapter()); // the REAL default client — a REAL network call
    const wallStartedAt = Date.now();
    const run = await live.runLivePipeline({
      ...composedLiveRunInput(slice),
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
    });
    const wallMs = Date.now() - wallStartedAt;

    assertCommonSliceInvariants(run, slice);
    // The real live server stopped with the cleanly-ended session (teardown law).
    assert.equal(adapter.activeBindings().length, 0, "the live session's server closed with the stream");
    // The composition law: ONE execution through the EXISTING run service; the ledger agrees.
    const ledgerRun = runs.readRun(run.runManifestId);
    assert.ok(ledgerRun !== null);
    assert.deepEqual(ledgerRun.steps, run.steps);
    assert.deepEqual(ledgerRun.outputs, run.outputs);

    // THE MODEL STEP — the regime is detected from the ACTUAL invocation result.
    const modelStep = run.steps.find((step) => step.nodeId === "node:model");
    assert.ok(modelStep !== undefined, "the model step ran");
    assert.ok(modelStep.timingMs > 0, "the model step latency is measured, never estimated");
    assert.equal(modelStep.cost, null, "the honest cost law: no cost unless the service reports one");
    if (modelStep.status === "succeeded") {
      // HAPPY regime — the model leg is REAL: BOTH real grades pinned.
      assert.match(modelStep.detail, /^real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/);
      const modelOutput = run.outputs.find((output) => output.semanticEvidence.startsWith("real model lane: "));
      assert.ok(modelOutput !== undefined, "the REAL model output revision is committed through the artifact fabric");
      assert.ok(modelOutput.artifactRevisionId.startsWith("rev:"));
      assert.match(modelOutput.semanticEvidence, /^real model lane: real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/);
      assert.ok(!run.outputs.some((output) => output.semanticEvidence.startsWith("fallback lane: ")), "no fallback fired in the happy regime");
      console.log(`W10C-1 HAPPY regime measured: model step ${modelStep.timingMs}ms, composed wall ${wallMs}ms — both real grades pinned (live: real-local-live, model: real)`);
    } else if (modelStep.status === "fallback-used") {
      // REFUSED regime — the P10-16 degradation law, never silent.
      const refusal = /^fallback used after model refusal \((quota-exhausted|provider-unavailable|credentials-missing|policy-denied|unsupported-operation): /.exec(modelStep.detail);
      assert.ok(refusal !== null, `the typed refusal is recorded in the step (detail: ${modelStep.detail})`);
      assert.equal(run.liveSessions[0]?.descriptor.grade, "real-local-live", "the live grade survives the degradation");
      const fallbackOutput = run.outputs.find((output) => output.semanticEvidence.startsWith("fallback lane: "));
      assert.ok(fallbackOutput !== undefined, "the degraded deterministic pass-through output is committed and visible");
      assert.ok(!run.outputs.some((output) => output.semanticEvidence.startsWith("real model lane: ")), "NO real-model output is claimed on a refusal");
      assert.ok(!run.steps.some((step) => step.detail.startsWith("real sandbox model service")), "no step claims real model evidence on a refusal");
      console.log(`W10C-1 REFUSED regime measured: typed refusal "${refusal[1]}" recorded, degraded to the deterministic-node variant (model step ${modelStep.timingMs}ms, wall ${wallMs}ms) — live grade still real-local-live`);
    } else {
      assert.fail(`the P10-16 degradation law violated: a declared-fallback model node ended "${modelStep.status}" (${modelStep.detail}) — a refusal must degrade through the fallback seam, never fail or cancel silently`);
    }
  } finally {
    await adapter.dispose();
  }
});

test("W10C-1 / P10-16 degradation law (deterministic refused regime): the service's own 429 class degrades the slice to the deterministic-node variant — typed refusal recorded, live grade intact, no real-model output claimed", async () => {
  const slice = await admitComposedPipeline();
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(5) });
  // EVIDENCE (labeled): the recording client replays the real service's
  // own HTTP 429 error class at the adapter's documented injection seam.
  // The admission/live/deterministic/run legs stay REAL; no real network
  // call is made or claimed in this test.
  const calls: SandboxChatCompletionRequest[] = [];
  const throttledClient: SandboxChatCompletionClient = {
    async createChatCompletion(request: SandboxChatCompletionRequest): Promise<unknown> {
      calls.push({ messages: [...request.messages] });
      throw new Error("API request failed with status 429: rate limited");
    },
  };
  try {
    const { live } = makeComposedRunService(new SandboxModelAdapter({ client: throttledClient }));
    const run = await live.runLivePipeline({
      ...composedLiveRunInput(slice),
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
    });

    assertCommonSliceInvariants(run, slice);
    assert.equal(adapter.activeBindings().length, 0, "the live session's server closed with the stream");

    const modelStep = run.steps.find((step) => step.nodeId === "node:model");
    assert.ok(modelStep !== undefined);
    assert.equal(modelStep.status, "fallback-used", "the degradation fires through the declared-fallback seam");
    assert.match(modelStep.detail, /^fallback used after model refusal \(quota-exhausted: sandbox model service quota exhausted \(HTTP 429\): API request failed with status 429/);
    assert.match(modelStep.detail, /declared contract: a refused model call degrades to the deterministic-node variant/);
    assert.ok(!run.outputs.some((output) => output.semanticEvidence.startsWith("real model lane: ")), "NO real-model output is claimed on the refusal");
    const fallbackOutput = run.outputs.find((output) => output.semanticEvidence.startsWith("fallback lane: "));
    assert.ok(fallbackOutput !== undefined);
    assert.match(fallbackOutput.semanticEvidence, /^fallback lane: identity pass-through after quota-exhausted: /);

    // The composed lineage REALLY reached the model port: the prompt is
    // the deterministic trim of the drained LIVE frames (kept 2/3/4, dropped 1/5).
    assert.equal(calls.length, 1, "exactly one chat-completion call through the frozen port");
    const prompt = calls[0]?.messages.find((message) => message.role === "user")?.content ?? "";
    for (const kept of ["evt-2", "evt-3", "evt-4"]) {
      assert.ok(prompt.includes(kept), `the drained live frame ${kept} flowed through the trim into the model prompt`);
    }
    for (const dropped of ["evt-1", "evt-5"]) {
      assert.ok(!prompt.includes(dropped), `the out-of-window frame ${dropped} never reached the model prompt`);
    }
  } finally {
    await adapter.dispose();
  }
});
