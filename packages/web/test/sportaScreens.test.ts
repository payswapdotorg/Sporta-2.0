/**
 * W11C — the destination-screens battery (packages/web, node:test + tsx
 * — the project law; the studioComposition.test.ts precedent).
 *
 * Drives Worker C's screen adapters + view-models through the EXISTING
 * seams (the state-owner law — no parallel state anywhere in this file):
 *
 * EVIDENCE CLASS (labeled):
 *   REAL — the marketplace/marketplace adapter reads ride the REAL
 *   @sporta/marketplace services over the REAL W10 studio composition
 *   (createStudioHostComposition); the runs records come from the REAL
 *   TransformRunService (a REAL deterministic-filter child process on
 *   real pipes, real carry-forward re-verification — including a REAL
 *   typed model-refusal step and a REAL live run whose pinned session
 *   evidence carries the exact "real-local-live" grade over a real
 *   localhost HTTP source); the library lineage is the REAL
 *   ArtifactGraphService chain; the app revoke is the REAL
 *   ApplicationEnvironmentService.revokeAttachment path.
 *   FIXTURE — the in-memory stores, the seed/manifest CONTENT, the
 *   fixture model adapter refusal, the labeled browser fixture hosts
 *   (asserted to report backing "fixture"), the fixture probe.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSportaScreenRoute, type SportaScreenId } from "../src/sporta/product/contract.js";
import {
  MARKETPLACE_SCREEN_REGISTRATION,
  MY_PIPELINES_SCREEN_REGISTRATION,
} from "../src/sporta/marketplace/registrations.js";
import { RUNS_SCREEN_REGISTRATION } from "../src/sporta/runs/registrations.js";
import { LIBRARY_SCREEN_REGISTRATION } from "../src/sporta/library/registrations.js";
import { CONNECTED_APPS_SCREEN_REGISTRATION } from "../src/sporta/apps/registrations.js";
import { createMarketplaceScreenHost } from "../src/sporta/marketplace/marketplaceScreenHost.js";
import type { MarketplaceStudioReadShape } from "../src/sporta/marketplace/marketplaceScreenHost.js";
import { createMarketplaceFixtureHost } from "../src/sporta/marketplace/marketplaceFixtureHost.js";
import { createRunsFixtureHost } from "../src/sporta/runs/runsFixtureHost.js";
import {
  liveSessionLine,
  runAuditLines,
  runRow,
  runStateClass,
  runStateLabel,
} from "../src/sporta/runs/runsScreenViews.js";
import { createLibraryFixtureHost } from "../src/sporta/library/libraryFixtureHost.js";
import { revisionRows, lineageSummaryLine, editabilityLabel } from "../src/sporta/library/libraryScreenViews.js";
import {
  appDataScopeLine,
  appLearningConsentLine,
  appNotGrantedClasses,
  appPermissionSummary,
} from "../src/sporta/apps/appsScreenViews.js";
import type { ConnectedAppView } from "../src/sporta/apps/appsScreenPorts.js";
import { createAppsFixtureHost } from "../src/sporta/apps/appsFixtureHost.js";
import { createStudioHostComposition } from "../src/sporta/studioComposition.js";
import {
  STUDIO_SAMPLE_PIPELINE_ID,
  STUDIO_SUSPENDED_PIPELINE_ID,
  STUDIO_WORKSPACE,
  studioSeedDescriptor,
} from "../src/sporta/studioSeeds.js";
import {
  ArtifactGraphService,
  InMemoryArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import {
  ApplicationEnvironmentService,
  ApplicationSessionService,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationSessionStore,
  type ApplicationCapabilityInvocationPort,
  type ApplicationCapabilityInvocationResult,
  type ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  LiveTransformRunService,
  RealLocalHttpLiveSourceAdapter,
  Sha256TransformHash,
  TransformRunService,
  jsonEventStreamTrimComponent,
} from "@sporta/transforms/contract";
import type {
  TransformNode,
  TransformPipelineManifest,
  TransformRunManifest,
} from "@sporta/transforms/contract";

const FIXED_NOW = "2026-10-13T12:00:00.000Z";
const PINNED = "sha256:" + "ab".repeat(32);
const STREAM = { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" as const };

// ---------------------------------------------------------------------------
// Screen registrations vs the frozen contract (compile+runtime proof).
// ---------------------------------------------------------------------------

test("W11C registrations: every lane screen id is a frozen-vocabulary id with product copy", () => {
  const registrations = [
    MARKETPLACE_SCREEN_REGISTRATION,
    MY_PIPELINES_SCREEN_REGISTRATION,
    RUNS_SCREEN_REGISTRATION,
    LIBRARY_SCREEN_REGISTRATION,
    CONNECTED_APPS_SCREEN_REGISTRATION,
  ];
  const ids = registrations.map((registration) => registration.id);
  assert.deepEqual([...new Set(ids)].sort(), [
    "connected-apps",
    "library",
    "marketplace",
    "my-pipelines",
    "runs",
  ]);
  for (const registration of registrations) {
    const verdict = validateSportaScreenRoute({ screen: registration.id as SportaScreenId });
    assert.equal(verdict.ok, true, `screen ${registration.id} must validate against the closed vocabulary`);
    assert.ok(registration.navLabel.length > 0, "product nav label present");
    assert.ok(registration.purpose.length > 0, "product purpose present");
    // The no-second-authority law in copy: Sporta product vocabulary only.
    assert.doesNotMatch(`${registration.navLabel} ${registration.purpose}`, /zcode|zai/i);
  }
});

// ---------------------------------------------------------------------------
// Marketplace + My Pipelines adapters over the REAL studio composition.
// ---------------------------------------------------------------------------

test("W11C marketplace adapter: REAL composition records flow through the screen port", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "w11c-marketplace-"));
  const composition = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs"), now: () => FIXED_NOW });
  try {
    // STRUCTURAL COMPAT (compile-time): the REAL studio host port satisfies
    // the lane's read shape — the state-owner law without cross-lane imports.
    const studioShape: MarketplaceStudioReadShape = composition.host;
    void studioShape;

    const { marketplace, myPipelines } = createMarketplaceScreenHost(composition.host);
    assert.equal(marketplace.backing, "real", "the headless composition reports REAL backing");

    const listings = await marketplace.listPublicListings();
    assert.equal(listings.length, 2, "the two seeded listings (published + suspended) surface honestly");
    const published = listings.find((listing) => listing.pipelineId === STUDIO_SAMPLE_PIPELINE_ID);
    const suspended = listings.find((listing) => listing.pipelineId === STUDIO_SUSPENDED_PIPELINE_ID);
    assert.ok(published !== undefined && suspended !== undefined);
    assert.equal(published.status, "PUBLISHED");
    assert.equal(suspended.status, "SUSPENDED", "suspended stays visible, never hidden");

    // Detail: review + disclosure + preview ride the SAME read models.
    const detail = await marketplace.readListingDetail(published.listingId);
    assert.ok(detail.review !== null);
    assert.deepEqual(detail.review.reviewerRoles, ["product", "rights", "security"]);
    assert.ok(detail.disclosure !== null);
    assert.equal(
      detail.disclosure.releaseDigest,
      published.releaseDigest,
      "digest byte-equality listing -> disclosure through the screen port",
    );
    assert.match(detail.disclosure.legalNotice, /never implies legal clearance/);
    // The REAL measured sample preview (a REAL run) reaches the detail view.
    assert.ok(detail.preview !== null, "the seeded sample pipeline carries its measured preview");
    assert.equal(detail.preview.evidenceGrade, "measured");

    // Typed refusal for an unknown listing (verbatim, never a fake detail).
    await assert.rejects(
      () => marketplace.readListingDetail("list:unknown"),
      /no listing list:unknown/,
    );

    // My-pipelines: the SAME records filtered by creator.
    const creatorRecords = await myPipelines.listCreatorRecords("publisher:studio-host");
    assert.equal(creatorRecords.length, 3, "two real records + the declared submission-seam gap row");
    const released = creatorRecords.find((record) => record.creatorState === "released");
    const suspendedRow = creatorRecords.find((record) => record.creatorState === "suspended");
    const seamGap = creatorRecords.find((record) => record.pipelineId === "seam:submission-reads");
    assert.ok(released !== undefined && suspendedRow !== undefined && seamGap !== undefined);
    assert.equal(released.origin, "record");
    assert.equal(released.approvedVersion, "1.0.0");
    assert.match(seamGap.note ?? "", /NEXT DEPENDENCIES/);

    // Version status: REAL review read + honest refusal for unknowns.
    const review = await myPipelines.readCreatorVersionStatus(STUDIO_SAMPLE_PIPELINE_ID, "1.0.0");
    assert.ok(!("reason" in review));
    if (!("reason" in review)) assert.equal(review.outcome, "approved");
    const missing = await myPipelines.readCreatorVersionStatus("pipe:unknown", "9.9.9");
    assert.ok("reason" in missing && /no review decision recorded/.test(missing.reason));

    // Other creators see no records (the filter is the creator scope).
    const otherCreator = await myPipelines.listCreatorRecords("publisher:someone-else");
    assert.equal(otherCreator.length, 1, "only the seam-gap row, never another creator's records");
  } finally {
    await composition.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Runs view-models over REAL TransformRunService records.
// ---------------------------------------------------------------------------

const trimComponent = jsonEventStreamTrimComponent(new Sha256TransformHash());

function trimNode(): TransformNode {
  return {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: { kind: "deterministic-filter", digest: trimComponent.digest, name: trimComponent.name },
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

function modelNode(mode: "declared-fallback" | "fail-closed"): TransformNode {
  return {
    nodeId: "node:model",
    kind: "model",
    componentRef: { kind: "model", digest: `sha256:${"6".repeat(64)}`, name: "fixture-event-summer" },
    inputs: [STREAM],
    outputs: [{ name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" }],
    parameterSchema: {},
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 5_000, maxOutputBytes: 100_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior:
      mode === "declared-fallback"
        ? { mode: "declared-fallback", contract: "refusals fall back to identity pass-through" }
        : { mode: "fail-closed", contract: "refusals fail the step closed — never a silent pass-through" },
    provenanceRules: ["model output labeled with its evidence grade"],
  };
}

function testManifest(nodes: readonly TransformNode[]): TransformPipelineManifest {
  return {
    pipelineId: "pipe:w11c-runs",
    version: "1.0.0",
    manifestDigest: PINNED,
    publisher: "publisher:w11c-test",
    purpose: "w11c runs battery",
    limitations: ["test only"],
    inputs: [STREAM],
    outputs: [STREAM],
    nodes,
    edges: [],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [],
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

function eventStreamBytes(): Uint8Array {
  const events = [0, 1, 2, 3, 4].map((index) => ({
    eventId: `evt-${index + 1}`,
    entityId: index % 2 === 0 ? "team-A" : "team-B",
    atMs: 1000 + index * 1000,
    confidence: 0.3 + index / 10,
    provenance: { sourceKind: "observation", sourceRef: `source:${index + 1}`, capturedAt: "2026-10-13T00:00:00.000Z" },
  }));
  return new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

function makeRuns(): TransformRunService {
  const hash = new Sha256TransformHash();
  const store = new DeterministicComponentStore([trimComponent], hash);
  return new TransformRunService({
    clock: { now: () => FIXED_NOW },
    hash,
    artifacts: new ArtifactGraphService({ now: () => FIXED_NOW }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: new DeterministicFilterNodeAdapter({ store }),
    components: store,
  });
}

test("W11C runs views: a REAL deterministic run projects succeeded state + audit lines", async () => {
  const runs = makeRuns();
  const manifest: TransformRunManifest = await runs.runPipeline({
    manifest: testManifest([trimNode()]),
    workGraph: { workGraphId: "wg:w11c-runs", runRef: "run:w11c-1" },
    parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
    inputs: [{
      artifactRef: "art:w11c-feed",
      rightsSnapshot: "rights:w11c-operator",
      bytes: eventStreamBytes(),
      provenance: { sourceKind: "authorized-source", sourceRef: "source:feed-1", capturedAt: "2026-10-13T00:00:00.000Z", confidence: 0.95 },
    }],
    releaseDigest: `sha256:${"f".repeat(64)}`,
  });
  // The REAL run: one REAL child-process step, measured carry-forward.
  assert.equal(manifest.steps.length, 1);
  assert.equal(manifest.steps[0]?.status, "succeeded");
  assert.ok((manifest.steps[0]?.timingMs ?? 0) > 0, "real child-process timing");
  assert.equal(manifest.semanticFidelity.grade, "measured");

  const row = runRow(manifest);
  assert.equal(row.stateClass, "succeeded");
  assert.equal(row.stateLabel, "Finished — succeeded");
  assert.equal(row.outputsCount, 1);
  const state = runStateClass(manifest);
  assert.equal(state, "succeeded");
  const audit = runAuditLines(manifest);
  assert.ok(audit.some((line) => line.label === "Work graph" && line.value.includes("wg:w11c-runs")));
  assert.ok(audit.some((line) => line.label === "Semantic fidelity" && line.value.startsWith("measured")));
  assert.ok(audit.some((line) => line.label.startsWith("Output")));
});

test("W11C runs views: a REAL typed model refusal projects the typed-failure state verbatim", async () => {
  const runs = makeRuns();
  const manifest = await runs.runPipeline({
    manifest: testManifest([modelNode("fail-closed")]),
    workGraph: { workGraphId: "wg:w11c-runs", runRef: "run:w11c-2" },
    parameters: { "node:model": { forceRefusal: "provider-unavailable" } },
    inputs: [{
      artifactRef: "art:w11c-feed",
      rightsSnapshot: "rights:w11c-operator",
      bytes: eventStreamBytes(),
      provenance: { sourceKind: "authorized-source", sourceRef: "source:feed-1", capturedAt: "2026-10-13T00:00:00.000Z", confidence: 0.95 },
    }],
    releaseDigest: `sha256:${"f".repeat(64)}`,
  });
  assert.equal(manifest.steps.length, 1);
  assert.equal(manifest.steps[0]?.status, "typed-failure", "the REAL run service records the typed refusal step");
  assert.match(manifest.steps[0]?.detail ?? "", /refusal/);
  const row = runRow(manifest);
  assert.equal(row.stateClass, "typed-failure");
  assert.equal(row.stateLabel, "Finished — typed failure");
});

test("W11C runs views: a declared-fallback model refusal honestly projects fallback-used", async () => {
  const runs = makeRuns();
  const manifest = await runs.runPipeline({
    manifest: testManifest([modelNode("declared-fallback")]),
    workGraph: { workGraphId: "wg:w11c-runs", runRef: "run:w11c-3" },
    parameters: { "node:model": { forceRefusal: "provider-unavailable" } },
    inputs: [{
      artifactRef: "art:w11c-feed",
      rightsSnapshot: "rights:w11c-operator",
      bytes: eventStreamBytes(),
      provenance: { sourceKind: "authorized-source", sourceRef: "source:feed-1", capturedAt: "2026-10-13T00:00:00.000Z", confidence: 0.95 },
    }],
    releaseDigest: `sha256:${"f".repeat(64)}`,
  });
  assert.equal(manifest.steps[0]?.status, "fallback-used", "the DECLARED fallback mode is honored, never relabeled");
  assert.equal(runRow(manifest).stateClass, "fallback-used");
  assert.equal(runRow(manifest).stateLabel, "Finished — fallback used");
});

test("W11C runs views: a REAL live run pins real-local-live session evidence, rendered verbatim", async () => {
  const hash = new Sha256TransformHash();
  const store = new DeterministicComponentStore([trimComponent], hash);
  const runs = new TransformRunService({
    clock: { now: () => FIXED_NOW },
    hash,
    artifacts: new ArtifactGraphService({ now: () => FIXED_NOW }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: new DeterministicFilterNodeAdapter({ store }),
    components: store,
  });
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: eventStreamBytesTexts() });
  try {
    const live = new LiveTransformRunService({ runs });
    const manifest = await live.runLivePipeline({
      run: {
        manifest: testManifest([trimNode()]),
        workGraph: { workGraphId: "wg:w11c-live", runRef: "run:w11c-live-1" },
        parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
        releaseDigest: `sha256:${"f".repeat(64)}`,
      },
      liveSource: {
        port: adapter,
        descriptor: {
          sourceId: "live:w11c-match",
          grade: "real-local-live",
          contentKind: "application/jsonl",
          cadenceMs: 25,
          queueBound: 8,
        },
      },
      feed: {
        artifactRef: "art:w11c-live-feed",
        rightsSnapshot: "rights:w11c-operator",
        provenance: { sourceKind: "authorized-source", sourceRef: "source:live-1", capturedAt: "2026-10-13T00:00:00.000Z", confidence: 0.95 },
      },
    });
    assert.equal(manifest.liveSessions.length, 1);
    const session = manifest.liveSessions[0];
    assert.ok(session !== undefined);
    assert.equal(session.descriptor.grade, "real-local-live", "the exact honest grade is pinned on the record");
    // UI-15: the screen line renders the record's grade VERBATIM.
    const line = liveSessionLine(session);
    assert.match(line, /grade real-local-live/);
    assert.match(line, /5 frame\(s\)/);
    assert.doesNotMatch(line, /production/);
    const row = runRow(manifest);
    assert.equal(row.liveSessionsCount, 1);
  } finally {
    await adapter.dispose();
  }
});

function eventStreamBytesTexts(): string[] {
  return new TextDecoder().decode(eventStreamBytes()).trim().split("\n");
}

// ---------------------------------------------------------------------------
// Library view-models over the REAL ArtifactGraphService lineage.
// ---------------------------------------------------------------------------

test("W11C library views: the REAL artifact fabric lineage projects root-first with head marked", async () => {
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const policy = {
    rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
    privacy: { visibility: "tenant" as const, exportableFields: [] },
    retention: { disposition: "retain" as const },
  };
  await artifacts.recordArtifact({ artifactId: "art:w11c-lib", kind: "tactical-board-video", editability: "editable", policy });
  const rev1 = await artifacts.commitRevision({
    artifactId: "art:w11c-lib",
    revisionId: "rev:w11c-lib-1",
    contentHash: `sha256:${"1".repeat(64)}`,
    toolVersions: ["sporta-render@0"],
    provenance: { sourceKind: "agent-run", sourceRef: "run:w11c-1", capturedAt: FIXED_NOW },
    policy,
  });
  const rev2 = await artifacts.commitRevision({
    artifactId: "art:w11c-lib",
    revisionId: "rev:w11c-lib-2",
    parentRevisionId: rev1.revisionId,
    contentHash: `sha256:${"2".repeat(64)}`,
    toolVersions: ["kdenlive@24.08.0"],
    provenance: { sourceKind: "user-edit", sourceRef: "edit:w11c-user-1", capturedAt: FIXED_NOW, confidence: 1 },
    policy,
  });
  const lineage = await artifacts.lineage("art:w11c-lib");
  assert.equal(lineage.length, 2);
  const rows = revisionRows(lineage);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.revisionId, "rev:w11c-lib-1");
  assert.equal(rows[0]?.isHead, false, "the root revision is not the head");
  assert.equal(rows[0]?.parentRevisionId, null);
  assert.equal(rows[1]?.revisionId, rev2.revisionId);
  assert.equal(rows[1]?.isHead, true, "the newest revision is marked HEAD");
  assert.equal(rows[1]?.parentRevisionId, rev1.revisionId, "the lineage chain is preserved");
  assert.match(rows[1]?.provenanceLine ?? "", /user-edit edit:w11c-user-1/);
  assert.equal(
    editabilityLabel("editable"),
    "Editable project",
    "editability renders in product language",
  );
  assert.match(
    lineageSummaryLine({ artifact: { artifactId: "art:w11c-lib", kind: "tactical-board-video", editability: "editable" }, revisions: lineage, lineageNote: null }),
    /agent-run:run:w11c-1 → user-edit:edit:w11c-user-1/,
    "the provenance chain renders as the lineage summary",
  );
});

// ---------------------------------------------------------------------------
// Connected Apps: the REAL ApplicationEnvironmentService paths.
// ---------------------------------------------------------------------------

class W11cProbe implements ApplicationCapabilityInvocationPort {
  async probeTarget(): Promise<{ reachable: boolean; detail: string }> {
    return { reachable: true, detail: "w11c battery probe (fixture)" };
  }
  async invoke(): Promise<ApplicationCapabilityInvocationResult> {
    return { status: "failed", failureKind: "w11c-battery-no-app", detail: "the battery never invokes app capabilities" };
  }
}

test("W11C connected apps: the REAL service grant -> audit -> revoke path projects through the screen views", async () => {
  const descriptors = new InMemoryApplicationDescriptorStore();
  const attachments = new InMemoryApplicationAttachmentStore();
  const environment = new ApplicationEnvironmentService({
    clock: { now: () => FIXED_NOW },
    descriptors,
    attachments,
    adapter: new W11cProbe(),
    sessions: new ApplicationSessionService({
      clock: { now: () => FIXED_NOW },
      attachments,
      descriptors,
      sessions: new InMemoryApplicationSessionStore(),
    }),
  });
  void new InMemoryApplicationActionAuditStore(); // the real audit store lane (next dependencies for screen reads)
  const descriptor = environment.registerDescriptor(
    studioSeedDescriptor(FIXED_NOW) as ApplicationEnvironmentDescriptor,
  );
  assert.equal(descriptor.descriptorId, "desc:studio-tag-board");
  const expiry = "2026-11-13T12:00:00.000Z";
  const granted = await environment.consentToAttach({
    attachmentId: "att:w11c-controller",
    descriptorId: descriptor.descriptorId,
    consentedBy: "user:operator",
    tenant: "tenant:operator",
    scope: { workspace: STUDIO_WORKSPACE, workGraphId: "wg:w11c-runs" },
    grantedCapabilityClasses: ["observe", "control"],
    expiresAt: expiry,
    policySnapshot: "policy:w11c-v1",
  });
  const observeOnly = await environment.consentToAttach({
    attachmentId: "att:w11c-observer",
    descriptorId: descriptor.descriptorId,
    consentedBy: "user:operator",
    tenant: "tenant:operator",
    scope: { workspace: STUDIO_WORKSPACE, workGraphId: null },
    grantedCapabilityClasses: ["observe"],
    expiresAt: expiry,
    policySnapshot: "policy:w11c-v1",
  });

  // Project the REAL records into the screen views (structural subset).
  const project = (attachment: typeof granted): ConnectedAppView => {
    const desc = environment.readDescriptor(attachment.descriptorId);
    if (desc === null) throw new Error("descriptor vanished");
    return {
      descriptor: {
        descriptorId: desc.descriptorId,
        applicationId: desc.applicationId,
        appVersion: desc.appVersion,
        targetKind: desc.targetKind,
        targetIdentity: desc.targetIdentity,
        dataClasses: [...desc.dataClasses],
        networkNeeds: desc.networkNeeds,
        limitations: [...desc.limitations],
        licensing: { ...desc.licensing },
        capabilities: desc.capabilities.map((capability) => ({
          capabilityId: capability.capabilityId,
          capabilityClass: capability.capabilityClass,
          action: capability.action,
          sideEffects: [...capability.sideEffects],
          requiredPermissions: [...capability.requiredPermissions],
        })),
      },
      attachment: {
        attachmentId: attachment.attachmentId,
        descriptorId: attachment.descriptorId,
        grantedCapabilityClasses: [...attachment.grantedCapabilityClasses],
        grantedAt: attachment.grantedAt,
        expiresAt: attachment.expiresAt,
        revokedAt: attachment.revokedAt,
        learningConsent: attachment.learningConsent,
        consentedBy: attachment.consentedBy,
        scope: { ...attachment.scope },
        policySnapshot: attachment.policySnapshot,
      },
    };
  };

  const controllerView = project(granted);
  assert.match(appPermissionSummary(controllerView), /granted: observe, control — expires/);
  assert.deepEqual(appNotGrantedClasses(controllerView), [], "every declared class granted on the controller");
  assert.match(appDataScopeLine(controllerView), /app-status, app-highlights — no network access/);
  const observerView = project(observeOnly);
  assert.deepEqual(appNotGrantedClasses(observerView), ["control"], "capability-class independence is visible");
  assert.match(appLearningConsentLine(observerView), /NOT granted \(attaching grants no learning\)/);

  // THE REAL REVOCATION PATH (service REAL; stores fixture-grade).
  const revokedRecord = environment.revokeAttachment("att:w11c-observer");
  assert.ok(revokedRecord.revokedAt !== null, "the REAL service stamped the revocation time");
  const after = environment
    .listAttachmentsByScope(STUDIO_WORKSPACE)
    .find((a) => a.attachmentId === "att:w11c-observer");
  assert.ok(after !== undefined && after.revokedAt !== null, "the REAL service revoked the attachment");
  const revokedView = project(after);
  assert.match(appPermissionSummary(revokedView), /^revoked at .* \(was: observe\)/);
  assert.doesNotMatch(appLearningConsentLine(revokedView), /granted —/);
});

// ---------------------------------------------------------------------------
// Fixture hosts: honest FIXTURE backing, labeled demo rows, typed refusals.
// ---------------------------------------------------------------------------

test("W11C fixture hosts: every browser fixture host reports fixture backing and honest labels", async () => {
  const { marketplace, myPipelines } = createMarketplaceFixtureHost();
  assert.equal(marketplace.backing, "fixture");
  const listings = await marketplace.listPublicListings();
  assert.equal(listings.length, 2);
  await assert.rejects(() => marketplace.readListingDetail("list:unknown"), /fixture host: no listing/);
  const demoRows = await myPipelines.listCreatorRecords("publisher:fixture-market");
  const demos = demoRows.filter((row) => row.origin === "fixture-demo");
  assert.ok(demos.length >= 3, "draft/submitted/changes-requested demo rows exist");
  for (const demo of demos) {
    assert.match(demo.note ?? "", /fixture demo row/, "every demo row carries its fixture note");
  }

  const runsHost = createRunsFixtureHost();
  assert.equal(runsHost.backing, "fixture");
  const runRows = await runsHost.listRuns();
  assert.equal(runRows.length, 3);
  const failureRun = runRows.find((run) => run.runManifestId === "run:fixture-failure-1");
  assert.ok(failureRun !== undefined);
  assert.equal(runStateClass(failureRun), "typed-failure");
  assert.equal(runStateLabel(runStateClass(failureRun)), "Finished — typed failure");
  const fallbackRun = runRows.find((run) => run.runManifestId === "run:fixture-fallback-1");
  assert.ok(fallbackRun !== undefined);
  assert.equal(runStateClass(fallbackRun), "fallback-used");
  await assert.rejects(() => runsHost.readRun("run:unknown"), /fixture host: no run/);

  const libraryHost = createLibraryFixtureHost();
  assert.equal(libraryHost.backing, "fixture");
  const projectDetail = await libraryHost.readArtifact("art:fixture-project-1");
  const rows = revisionRows(projectDetail.revisions);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.isHead, true);
  assert.match(projectDetail.lineageNote ?? "", /fixture demo lineage/);
  await assert.rejects(() => libraryHost.readArtifact("art:unknown"), /fixture host: no artifact/);

  const appsHost = createAppsFixtureHost();
  assert.equal(appsHost.backing, "fixture");
  const views = await appsHost.listAttachments();
  assert.equal(views.length, 3);
  const revokedView = views.find((view) => view.attachment.attachmentId === "att:fixture-revoked-1");
  assert.ok(revokedView !== undefined);
  assert.match(appPermissionSummary(revokedView), /^revoked at/);
  // The honest LOCAL fixture transition (typed, demo-only).
  const revoke = await appsHost.revoke("att:fixture-observe-1");
  assert.ok(revoke.ok);
  const alreadyRevoked = await appsHost.revoke("att:fixture-observe-1");
  assert.equal(alreadyRevoked.ok, false, "re-revoking refuses typed");
  if (!alreadyRevoked.ok) assert.match(alreadyRevoked.reason, /already revoked/);
  const unknownRevoke = await appsHost.revoke("att:unknown");
  assert.equal(unknownRevoke.ok, false);
});
