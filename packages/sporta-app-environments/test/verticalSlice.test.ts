/**
 * W9C-9 — the P9 vertical slice: one coherent lineage end-to-end.
 *
 * local prerecorded feed (real bytes) -> W9A REAL deterministic filter
 * node (real child process) + W9A fixture model adapter (fixture-
 * labeled) -> REAL WorkGraph + REAL artifact revisions pinned to the
 * reviewed release digest -> W9B reviewed FREE listing (draft ->
 * submit -> clean automated gates -> 3-role human review -> publish ->
 * entitlement) -> fail-closed feed-launch admission (rights snapshot)
 * -> pinned run -> ONE REAL attached app action over the REAL agent
 * path (this lane) reconciled onto the SAME WorkGraph -> revocation
 * blocks the next action (P9-23).
 *
 * EVIDENCE CLASS: MIXED, honestly labeled — REAL process legs (filter
 * child process, app child process, agent child process, real HTTP
 * tool call), REAL services and digest byte-equality; FIXTURE content
 * (the feed events, the reviewers, the agent wrapper program, the
 * model lane, in-memory stores).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  FixedClock as TransformFixedClock,
  Sha256TransformHash,
  TransformRunService,
  jsonEventStreamTrimComponent,
  validateTransformPipelineManifest,
} from "../../sporta-transforms/src/contract.js";
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
} from "../../sporta-transforms/src/contract.js";
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
} from "../../sporta-marketplace/src/contract.js";
import type { PolicySet } from "@sporta/contracts/contract";
import {
  InMemoryWorkGraphStore,
  WorkGraphService,
  ZCodeAgentRuntimeAdapter,
  systemClockNow,
} from "@sporta/work/contract";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "../../sporta-artifacts/src/contract.js";
import {
  ApplicationActionService,
  ApplicationActionToolEndpoint,
  ApplicationEnvironmentService,
  ApplicationSessionService,
  FixedClock,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationSessionStore,
} from "../src/contract.js";
import { hash, testPolicy } from "./helpers.js";
import {
  installAgentWrapper,
  installLocalTagBoardApp,
  makeRealEffectSink,
  readTagBoardState,
  runAgentAppAction,
} from "./processHelpers.js";

const PIPELINE_ID = "pipe:w9c-vertical-slice";
const FIXED_TIME = "2026-10-13T12:00:00.000Z";
const EVENT_STREAM_DATAKIND = "sporta/json-event-stream";

/** The prerecorded feed: 5 events, ids/order/timestamps/provenance (fixture bytes). */
function eventStreamBytes(): Uint8Array {
  const events = [0, 1, 2, 3, 4].map((index) => ({
    eventId: `evt-${index + 1}`,
    entityId: index % 2 === 0 ? "team-A" : "team-B",
    atMs: 1000 + index * 1000,
    confidence: 0.3 + index / 10,
    provenance: {
      sourceKind: "observation",
      sourceRef: `source:${index + 1}`,
      capturedAt: FIXED_TIME,
    },
  }));
  return new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

/** Build the vertical-slice manifest: REAL trim component + fixture model. */
function makeVerticalSliceManifest(): TransformPipelineManifest {
  const transformHash = new Sha256TransformHash();
  const trimComponent = jsonEventStreamTrimComponent(transformHash);
  const trimNode: TransformNode = {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: trimComponent.digest,
      name: trimComponent.name,
    },
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    parameterSchema: {
      startMs: { type: "number", required: true, minimum: 0 },
      endMs: { type: "number", required: true, minimum: 0 },
    },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "out-of-window events are dropped (counted)" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
  const modelNode: TransformNode = {
    nodeId: "node:model",
    kind: "model",
    componentRef: { kind: "model", digest: `sha256:${"6".repeat(64)}`, name: "fixture-event-summer" },
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" }],
    parameterSchema: {},
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 5_000, maxOutputBytes: 100_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "declared-fallback", contract: "refusals fall back to identity pass-through" },
    provenanceRules: ["model output labeled with its evidence grade"],
  };
  const edges: readonly TransformEdge[] = [
    {
      from: { nodeId: "node:trim", port: "events" },
      to: { nodeId: "node:model", port: "events" },
    },
  ];
  return {
    pipelineId: PIPELINE_ID,
    version: "1.0.0",
    manifestDigest: transformHash.text(JSON.stringify({ pipeline: PIPELINE_ID, version: "1.0.0" })),
    publisher: "publisher:w9c",
    purpose: "vertical slice: trim a prerecorded feed and summarize it",
    limitations: ["fixture model lane; deterministic trim is real"],
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" }],
    nodes: [trimNode, modelNode],
    edges,
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream", "fixture model summary"],
    pinnedDependencies: [
      {
        kind: "code",
        name: "json-event-stream-trim",
        digest: trimComponent.digest,
        license: "MIT",
        storageRef: "fabric:fixture",
      },
    ],
    licensing: { license: "MIT", provenance: "vertical slice" },
    policy: testPolicy satisfies PolicySet,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  };
}

test("P9-23: one coherent lineage — creator graph -> review -> feed launch -> pinned run -> attached app action -> verified result -> revocation", async () => {
  // ---------------------------------------------------------------------
  // Stage 1 — creator builds the graph; the REAL w9a validator passes it.
  // ---------------------------------------------------------------------
  const manifest = makeVerticalSliceManifest();
  const validation = validateTransformPipelineManifest(manifest, {
    parameters: { "node:trim": { startMs: 1500, endMs: 4500 }, "node:model": {} },
  });
  assert.equal(validation.valid, true, JSON.stringify(validation));

  // ---------------------------------------------------------------------
  // Stage 2 — W9B marketplace: draft -> submit -> clean automated gates
  // -> 3-role human review -> PUBLISHED free listing -> entitlement.
  // ---------------------------------------------------------------------
  const marketplaceHash = new Sha256MarketplaceHash();
  const manifests = new FixtureManifestSource();
  manifests.register(manifest);
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const suspensions = new InMemorySuspensionStore();
  const listingEvents = new InMemoryListingStateEventStore();
  const clock = new MarketplaceFixedClock(FIXED_TIME);
  const submission = new SubmissionService({
    clock,
    hash: marketplaceHash,
    candidates,
    lanes,
    manifests,
    validateGraph: validateTransformPipelineManifest,
  });
  const review = new ReviewService({ clock, hash: marketplaceHash, candidates, decisions, lanes });
  const listing = new ListingService({
    clock,
    hash: marketplaceHash,
    candidates,
    decisions,
    listings,
    suspensions,
    events: listingEvents,
    manifests,
  });
  const entitlementService = new EntitlementService({
    clock,
    hash: marketplaceHash,
    listings,
    entitlements,
    settlements: new FixtureSettlementAdapter(),
  });
  const admission = new FeedLaunchAdmissionService({
    clock,
    hash: marketplaceHash,
    listings,
    entitlements,
    candidates,
    manifests,
  });

  const draft = submission.startDraft({
    pipelineId: PIPELINE_ID,
    version: "1.0.0",
    manifestDigest: manifest.manifestDigest,
    contentHashes: [
      { kind: "code", digest: marketplaceHash.text("code@1.0.0") },
      { kind: "runtime", digest: marketplaceHash.text("runtime@1.0.0") },
    ],
    attestations: [
      { kind: "license", reference: "license:1.0.0" },
      { kind: "sbom", reference: "sbom:1.0.0" },
    ],
    submittedBy: "publisher:w9c",
  });
  const submitted = submission.submitCandidate(draft.candidateId);
  submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { "json-event-stream-trim": "clean" },
    similaritySignal: null,
  });
  const decision = review.recordReviewDecision({
    candidateId: draft.candidateId,
    outcome: "approved",
    humanReview: [
      { role: "product", reviewer: "reviewer:product-fixture", reviewedAt: FIXED_TIME },
      { role: "rights", reviewer: "reviewer:rights-fixture", reviewedAt: FIXED_TIME },
      { role: "security", reviewer: "reviewer:security-fixture", reviewedAt: FIXED_TIME },
    ],
    rationale: "vertical-slice fixture content, real gates",
    policyVersion: "policy:test-v1",
  });
  const published = listing.publishApprovedRelease({
    candidateId: draft.candidateId,
    title: "Vertical slice trim+summarize",
    description: "fixture-content listing, real review gates",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: [...manifest.expectedOutputs],
    limitations: [...manifest.limitations],
    compatibility: ["local"],
    support: "publisher:w9c",
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
  const entitlement = await entitlementService.grantEntitlement({
    principal: "user:w9c",
    listingId: published.listingId,
  });

  // DIGEST BYTE-EQUALITY: decision -> listing -> entitlement.
  assert.equal(decision.candidateDigest, submitted.candidateDigest);
  assert.equal(published.currentRelease.releaseDigest, submitted.candidateDigest);
  assert.equal(entitlement.releaseDigest, submitted.candidateDigest);

  // ---------------------------------------------------------------------
  // Stage 3 — feed-launch admission (rights snapshot; fail-closed).
  // ---------------------------------------------------------------------
  const noRights = admission.selectForLaunch({
    listingId: published.listingId,
    principal: "user:w9c",
    rightsSnapshot: null,
  });
  assert.equal(noRights.admitted, false);
  if (!noRights.admitted) {
    assert.equal(noRights.reason, "rights-prerequisites-unsatisfied");
  }
  const admittedSelection = admission.selectForLaunch({
    listingId: published.listingId,
    principal: "user:w9c",
    rightsSnapshot: {
      satisfied: ["authorized source footage"],
      evidenceRefs: ["rights:w9c-fixture-authorization"],
    },
  });
  assert.equal(admittedSelection.admitted, true);

  // ---------------------------------------------------------------------
  // Stage 4 — the pinned run over the SAME WorkGraph (w9a run service,
  // REAL deterministic child process + fixture-labeled model lane).
  // ---------------------------------------------------------------------
  const workGraphs = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now: systemClockNow });
  const artifacts = new ArtifactGraphService({ now: () => FIXED_TIME });
  await workGraphs.openIntent({
    workGraphId: "wg:vertical-slice",
    intent: {
      goal: "P9 vertical slice: reviewed pipeline + attached app on one lineage",
      constraints: [],
      artifactRequirements: ["trimmed event stream", "app effect evidence"],
    },
  });
  const runArtifactNode = await workGraphs.appendNode({
    workGraphId: "wg:vertical-slice",
    kind: "artifact",
    actor: { actorKind: "agent-run", actorRef: "run:vertical-slice" },
  });
  const transformHash = new Sha256TransformHash();
  const componentStore = new DeterministicComponentStore(
    [jsonEventStreamTrimComponent(transformHash)],
    transformHash,
  );
  const runService = new TransformRunService({
    clock: new TransformFixedClock(FIXED_TIME),
    hash: transformHash,
    artifacts,
    blobs: new InMemoryArtifactBlobStore((bytes) => transformHash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: new DeterministicFilterNodeAdapter({ store: componentStore }),
    components: componentStore,
    workGraphRefs: workGraphs,
    workGraphArtifactNode: runArtifactNode.nodeId,
  });
  const run = await runService.runPipeline({
    manifest,
    workGraph: { workGraphId: "wg:vertical-slice", runRef: "run:vertical-slice" },
    parameters: { "node:trim": { startMs: 1500, endMs: 4500 }, "node:model": {} },
    inputs: [
      {
        artifactRef: "art:feed-w9c",
        rightsSnapshot: "rights:w9c-fixture-authorization",
        bytes: eventStreamBytes(),
        provenance: {
          sourceKind: "authorized-source",
          sourceRef: "source:feed-w9c",
          capturedAt: FIXED_TIME,
          confidence: 0.95,
        },
      },
    ],
    releaseDigest: admittedSelection.admitted ? admittedSelection.releaseDigest : undefined,
  });

  // The run pins the ADMITTED digest (decision == listing == entitlement == run).
  assert.equal(run.release.releaseDigest, submitted.candidateDigest);
  assert.equal(run.steps.length, 2);
  assert.equal(run.steps[0]?.status, "succeeded"); // REAL deterministic child process
  assert.ok((run.steps[0]?.timingMs ?? 0) > 0, "real child wall-clock");
  assert.equal(run.steps[1]?.status, "succeeded"); // fixture model lane
  assert.equal(run.semanticFidelity.grade, "fixture"); // honest: the model lane is fixture
  assert.equal(run.outputs.length, 2);
  // The WorkGraph node carries the pipeline output revisions.
  const graphAfterRun = await workGraphs.readWorkGraph("wg:vertical-slice");
  const runRevisionRefs = graphAfterRun?.nodes
    .find((node) => node.nodeId === runArtifactNode.nodeId)
    ?.refs?.filter((ref) => ref.kind === "artifact-revision") ?? [];
  assert.equal(runRevisionRefs.length, 2);

  // ---------------------------------------------------------------------
  // Stage 5 — ONE REAL attached app action over the REAL agent path,
  // reconciled onto the SAME WorkGraph (this lane, W9C-7).
  // ---------------------------------------------------------------------
  const app = await installLocalTagBoardApp();
  const agent = await installAgentWrapper();
  try {
    const envClock = new FixedClock(FIXED_TIME);
    const descriptors = new InMemoryApplicationDescriptorStore();
    const appAttachments = new InMemoryApplicationAttachmentStore();
    const appSessions = new InMemoryApplicationSessionStore();
    const appAudit = new InMemoryApplicationActionAuditStore();
    const sessionService = new ApplicationSessionService({
      clock: envClock,
      attachments: appAttachments,
      descriptors,
      sessions: appSessions,
    });
    const environment = new ApplicationEnvironmentService({
      clock: envClock,
      descriptors,
      attachments: appAttachments,
      adapter: app.adapter,
      sessions: sessionService,
    });
    const actions = new ApplicationActionService({
      clock: envClock,
      hash,
      descriptors,
      attachments: appAttachments,
      sessions: appSessions,
      audit: appAudit,
      invocation: app.adapter,
      effectSink: makeRealEffectSink(artifacts, workGraphs),
    });
    const endpoint = new ApplicationActionToolEndpoint({ actions });
    const runtime = new ZCodeAgentRuntimeAdapter({ now: systemClockNow, zcodeCliPath: agent.wrapperPath });
    try {
      const descriptor = await app.adapter.buildDescriptorFromProbe({
        descriptorId: "desc:tagboard-vs",
        workspaceBinding: { tenant: "tenant:test", workspace: "ws:test" },
        policy: testPolicy,
        licensing: { license: "MIT", provenance: "demo local app" },
        limitations: ["demo app"],
        dataClasses: ["app-status", "app-highlights"],
      });
      environment.registerDescriptor(descriptor);
      // Run-scoped grant: exactly THIS WorkGraph.
      const attachment = await environment.consentToAttach({
        descriptorId: descriptor.descriptorId,
        consentedBy: "user:w9c",
        tenant: "tenant:test",
        scope: { workspace: "ws:test", workGraphId: "wg:vertical-slice" },
        grantedCapabilityClasses: ["observe", "control"],
        expiresAt: "2026-10-14T00:00:00.000Z",
        policySnapshot: "policy:test-v1",
      });
      assert.equal(attachment.learningConsent.granted, false); // lock 31
      const session = await sessionService.openSession({ attachmentId: attachment.attachmentId });
      const { url } = await endpoint.listen();
      const agentRun = await runAgentAppAction({
        runtime,
        task: {
          capabilityId: "cap:append-highlight",
          parameters: { label: "vertical-slice save", eventId: "evt-3" },
          actor: "agent:zcode-demo",
        },
        workGraphId: "wg:vertical-slice",
        toolUrl: url,
        sessionId: session.sessionId,
      });
      assert.equal(agentRun.events[agentRun.events.length - 1]?.type, "completed");
      const state = await readTagBoardState(app.statePath);
      assert.equal(state.highlights.length, 1);
      assert.equal(state.highlights[0]?.label, "vertical-slice save");

      // The app-action revision joins the pipeline revisions on the SAME graph.
      const auditStream = actions.readAudit(session.sessionId);
      const actionRecord = auditStream[auditStream.length - 1];
      assert.equal(actionRecord?.status, "succeeded");
      assert.equal(actionRecord?.reconciledRefs.workGraphId, "wg:vertical-slice");
      const appRevisionId = actionRecord?.reconciledRefs.artifactRevisionIds[0];
      assert.match(appRevisionId ?? "", /^rev:app:/);
      const graphFinal = await workGraphs.readWorkGraph("wg:vertical-slice");
      const allArtifactRefs =
        graphFinal?.nodes.flatMap((node) => node.refs?.filter((ref) => ref.kind === "artifact-revision") ?? []) ?? [];
      assert.equal(allArtifactRefs.length, 3); // 2 pipeline outputs + 1 app effect
      assert.ok(
        allArtifactRefs.some((ref) => ref.refId === appRevisionId),
        "the app-effect revision is on the same WorkGraph as the pipeline outputs",
      );
      // The fabric holds all three revisions immutably.
      for (const ref of allArtifactRefs) {
        const revision = await artifacts.readRevision(ref.refId);
        assert.ok(revision !== null, `revision ${ref.refId} is readable in the fabric`);
      }

      // -----------------------------------------------------------------
      // Stage 6 — revocation blocks the next agent action (P9-20).
      // -----------------------------------------------------------------
      environment.revokeAttachment(attachment.attachmentId);
      const denied = await runAgentAppAction({
        runtime,
        task: {
          capabilityId: "cap:append-highlight",
          parameters: { label: "after revoke", eventId: "evt-4" },
          actor: "agent:zcode-demo",
        },
        workGraphId: "wg:vertical-slice",
        toolUrl: url,
        sessionId: session.sessionId,
      });
      assert.equal(denied.events[denied.events.length - 1]?.type, "completed");
      const denialEvent = denied.events.find((event) =>
        event.detail.includes("attachment-revoked"),
      );
      assert.ok(denialEvent !== undefined, "the typed revocation refusal is in the agent stream");
      const stateAfter = await readTagBoardState(app.statePath);
      assert.equal(stateAfter.highlights.length, 1, "no further mutation happened");
      const finalStream = actions.readAudit(session.sessionId);
      assert.equal(finalStream[finalStream.length - 1]?.status, "denied");
      assert.equal(
        sessionService.readSession(session.sessionId)?.closeState,
        "revoked-mid-session",
      );
    } finally {
      runtime.dispose();
      await endpoint.close();
    }
  } finally {
    await app.cleanup();
    await agent.cleanup();
  }
});
