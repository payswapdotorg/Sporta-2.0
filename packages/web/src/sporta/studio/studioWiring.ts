/**
 * The studio world wiring (W9C-6) — constructs the service bundle the
 * composition composes: the w9b marketplace services (real services over
 * fixture-labeled in-memory stores), the w9a transform lanes (REAL
 * deterministic lane + fixture model lane), the w9c app-environment
 * services (over the REAL ZCode agent path + REAL local file app target),
 * and the REAL WorkGraph + Artifact Fabric services. Pure construction —
 * no seeding, no port logic (those live in studioComposition.ts).
 */
import {
  AppActionService,
  AppSessionService,
  AttachmentService,
  DescriptorRegistryService,
  FixedClock,
  InMemoryAppEnvironmentStore,
  LocalFileAppTargetAdapter,
  Sha256AppEnvironmentHash,
} from "@sporta/app-environments/contract";
import {
  ArtifactGraphService,
  FsArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import {
  EntitlementService,
  FeedLaunchAdmissionService,
  FixedClock as MarketplaceFixedClock,
  FixtureManifestSource,
  FixtureSettlementAdapter,
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
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  Sha256TransformHash,
  TransformRunService,
  validateTransformPipelineManifest,
} from "@sporta/transforms/contract";
import { InMemoryWorkGraphStore, WorkGraphService, ZCodeAgentRuntimeAdapter } from "@sporta/work/contract";
import { STUDIO_TRIM_COMPONENT } from "./studioGraph.js";

/** Constructor config — every REAL leg's location is caller-supplied. */
export interface StudioWorldConfig {
  /** Real agent-path executable (tests: the labeled stand-in). */
  zcodeCliPath: string;
  /** Real directory for the FS blob store leg. */
  blobRoot: string;
  /** Real directory for the local app target leg. */
  appRoot: string;
}

/** The wired world (all services + stores, ready for seeding). */
export interface StudioWorld {
  clock: FixedClock;
  appEnvStore: InMemoryAppEnvironmentStore;
  localTarget: LocalFileAppTargetAdapter;
  agentRuntime: ZCodeAgentRuntimeAdapter;
  workService: WorkGraphService;
  artifacts: ArtifactGraphService;
  registry: DescriptorRegistryService;
  attachments: AttachmentService;
  appSessions: AppSessionService;
  appActions: AppActionService;
  deterministic: DeterministicFilterNodeAdapter;
  models: FixtureTransformModelAdapter;
  runs: TransformRunService;
  manifests: FixtureManifestSource;
  submission: SubmissionService;
  review: ReviewService;
  listingService: ListingService;
  entitlement: EntitlementService;
  admission: FeedLaunchAdmissionService;
  listings: InMemoryListingStore;
  decisions: InMemoryDecisionStore;
}

/** Wire the full studio world (real services; fixture-labeled stores). */
export function wireStudioWorld(config: StudioWorldConfig): StudioWorld {
  const clock = new FixedClock("2026-10-13T00:00:00.000Z");
  const appEnvStore = new InMemoryAppEnvironmentStore();
  const appHash = new Sha256AppEnvironmentHash();
  const localTarget = new LocalFileAppTargetAdapter({ rootDir: config.appRoot, hash: appHash });

  // REAL ZCode agent path (the only spawn path — no second runtime).
  const agentRuntime = new ZCodeAgentRuntimeAdapter({
    now: () => clock.now(),
    zcodeCliPath: config.zcodeCliPath,
  });

  // REAL WorkGraph + Artifact Fabric services (fixture work store; the
  // artifact service is real with a REAL FS blob store leg).
  const workService = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now: () => clock.now() });
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());

  // The app-environment services (this lane).
  const registry = new DescriptorRegistryService({ clock, descriptors: appEnvStore, targets: localTarget });
  const attachments = new AttachmentService({
    clock,
    descriptors: appEnvStore,
    attachments: appEnvStore,
    sessions: appEnvStore,
  });
  const appSessions = new AppSessionService({
    clock,
    descriptors: appEnvStore,
    attachments: appEnvStore,
    sessions: appEnvStore,
  });
  const appActions = new AppActionService({
    clock,
    hash: appHash,
    descriptors: appEnvStore,
    attachments: appEnvStore,
    sessions: appEnvStore,
    audit: appEnvStore,
    agentRuntime,
    targets: localTarget,
    workGraphs: workService,
    workGraphRefs: workService,
    artifactRevisions: artifacts,
  });

  // The transform lanes (w9a): REAL deterministic lane + fixture model lane.
  const transformHash = new Sha256TransformHash();
  const componentStore = new DeterministicComponentStore([STUDIO_TRIM_COMPONENT], transformHash);
  const deterministic = new DeterministicFilterNodeAdapter({ store: componentStore });
  const models = new FixtureTransformModelAdapter();
  const runs = new TransformRunService({
    clock,
    hash: transformHash,
    artifacts,
    models,
    deterministic,
    components: componentStore,
    // REAL FS blob store leg (content-addressed files on disk); the hash
    // fn is the transform hash port so digests match the run service's
    // computed content hashes (fail-closed drift check stays honest).
    blobs: new FsArtifactBlobStore(config.blobRoot, (bytes) => transformHash.bytes(bytes)),
    workGraphRefs: workService,
    workGraphArtifactNode: "art:studio-outputs",
  });

  // The marketplace world (w9b services; fixture-labeled stores).
  const marketClock = new MarketplaceFixedClock("2026-10-13T00:00:00.000Z");
  const marketHash = new Sha256MarketplaceHash();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const suspensions = new InMemorySuspensionStore();
  const listingEvents = new InMemoryListingStateEventStore();
  const manifests = new FixtureManifestSource();
  const submission = new SubmissionService({
    clock: marketClock,
    hash: marketHash,
    candidates,
    lanes,
    manifests,
    validateGraph: validateTransformPipelineManifest,
  });
  const review = new ReviewService({ clock: marketClock, hash: marketHash, candidates, decisions, lanes });
  const listingService = new ListingService({
    clock: marketClock,
    hash: marketHash,
    candidates,
    decisions,
    listings,
    suspensions,
    events: listingEvents,
    manifests,
  });
  const entitlement = new EntitlementService({
    clock: marketClock,
    hash: marketHash,
    listings,
    entitlements,
    settlements: new FixtureSettlementAdapter(),
  });
  const admission = new FeedLaunchAdmissionService({
    clock: marketClock,
    hash: marketHash,
    listings,
    entitlements,
    candidates,
    manifests,
  });

  return {
    clock,
    appEnvStore,
    localTarget,
    agentRuntime,
    workService,
    artifacts,
    registry,
    attachments,
    appSessions,
    appActions,
    deterministic,
    models,
    runs,
    manifests,
    submission,
    review,
    listingService,
    entitlement,
    admission,
    listings,
    decisions,
  };
}
