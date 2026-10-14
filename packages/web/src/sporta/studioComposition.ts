/**
 * The Transform Studio host composition (W10A-1 — the studio README's
 * "Composition wiring" seam, closed by this wave).
 *
 * HEADLESS Node composition — NEVER enters the browser bundle (the
 * W4-C composition law; no React file may import it; the browser route
 * uses the labeled fixture host studioBrowserFixture.ts). Implements
 * `TransformStudioHostPort` over the REAL seams:
 *
 * REAL legs (labeled): graph validation (the REAL
 * `validateTransformPipelineManifest` — studio drafts map 1:1 onto
 * `TransformNode`/edge fields through studioSeeds.studioDraftManifest;
 * the composition adds ONLY the declared envelopes the manifest
 * requires); the marketplace read legs (REAL
 * Submission/Review/Listing/Entitlement/FeedLaunchAdmission services
 * over real ports); the fail-closed admission (`selectForLaunch` — the
 * typed result surfaces VERBATIM, never softened; the operator rights
 * snapshot is the host's wiring-time declaration, the
 * UsageDeclaredEditorHistory precedent — absent = the admission runs
 * WITHOUT a snapshot and refuses typed, P9-14); app-environment reads
 * (the REAL ApplicationEnvironmentService — descriptor validation,
 * catalog-stability and scoped-grant laws); the sample preview (a REAL
 * TransformRunService run of the seeded pipeline: a REAL
 * deterministic-filter child process on real pipes, REAL
 * content-addressed FS blob writes, REAL artifact revisions + WorkGraph
 * reconciliation, measured carry-forward evidence).
 *
 * FIXTURE (labeled): the in-memory marketplace/app-environment/work
 * stores (the packages' own FIXTURE adapters), the seed CONTENT
 * (studioSeeds.ts — the hostSeeds.ts precedent: fixture seeds behind
 * REAL ports), the fixture model adapter (never invoked — the seeded
 * pipeline is purely deterministic), and the fixture probe used at
 * app-attach seed time (the REAL app-action lane is the
 * app-environments battery + the P9-23 vertical slice).
 *
 * DEPENDENCY LAW (WO-C1): @sporta/transforms, @sporta/marketplace and
 * @sporta/app-environments resolve through the transitional gitignored
 * symlinks in packages/web/node_modules/@sporta; no manifest or
 * lockfile is touched here.
 */
import {
  DeterministicComponentStore, DeterministicFilterNodeAdapter, FixtureTransformModelAdapter,
  Sha256TransformHash, TransformRunService, jsonEventStreamTrimComponent,
  validateTransformPipelineManifest,
  type TransformPipelineManifest, type TransformRunManifest,
} from "@sporta/transforms/contract";
import {
  EntitlementService, FeedLaunchAdmissionService, FixtureManifestSource, FixtureSettlementAdapter,
  InMemoryCandidateStore, InMemoryCheckLaneStore, InMemoryDecisionStore, InMemoryEntitlementStore,
  InMemoryListingStateEventStore, InMemoryListingStore, InMemorySuspensionStore, ListingService,
  ReviewService, Sha256MarketplaceHash, SubmissionService, systemClockNow,
  type TransformListing, type TransformRightsSnapshot,
} from "@sporta/marketplace/contract";
import {
  ApplicationEnvironmentService, ApplicationSessionService, InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore, InMemoryApplicationSessionStore,
  type ApplicationCapabilityInvocationPort, type ApplicationCapabilityInvocationResult,
} from "@sporta/app-environments/contract";
import { InMemoryWorkGraphStore, WorkGraphService } from "@sporta/work/contract";
import { ArtifactGraphService, FsArtifactBlobStore, SystemClock as ArtifactSystemClock } from "@sporta/artifacts/contract";
import type { ArtifactBlobStorePort } from "@sporta/artifacts/contract";
import type { PolicySet } from "@sporta/contracts/contract";
import { SPORTA_HOST_POLICY, SPORTA_HOST_TENANT, SPORTA_HOST_USER } from "./hostSeeds.js";
import {
  STUDIO_PUBLISHER, STUDIO_SAMPLE_FEED_REF, STUDIO_SAMPLE_PIPELINE_ID, STUDIO_SAMPLE_PROVENANCE_AT,
  STUDIO_SUSPENDED_PIPELINE_ID, STUDIO_VERSION, STUDIO_WORKSPACE, STUDIO_WORK_GRAPH_ID,
  studioDraftManifest, studioSampleFeedBytes, studioSeedDescriptor, studioSeedManifest,
} from "./studioSeeds.js";
import type { StudioAppAttachmentView, StudioGraphDraft, StudioValidationResult, TransformStudioHostPort } from "./studio/studioPorts.js";
import { projectDisclosure, projectListing, projectReviewStatus } from "./studio/marketplaceViews.js";
import { projectAppAttachment } from "./studio/appAttachmentViews.js";
import { projectSamplePreview } from "./studio/samplePreview.js";

/** Constructor config — the REAL blob-store leg's location is caller-supplied. */
export interface StudioHostCompositionConfig {
  /** Real directory for the FS blob store leg (the sample run's outputs). */
  readonly blobRoot: string;
  /** The host operator principal (entitlement + admission subject). */
  readonly principal?: string;
  /**
   * The operator's rights-snapshot declaration at wiring time (the
   * UsageDeclaredEditorHistory precedent: the HOST declares the
   * operator's context; the admission GATE stays real and fail-closed).
   * Absent = admission runs WITHOUT a snapshot and refuses typed
   * (P9-14) — never softened.
   */
  readonly operatorRights?: TransformRightsSnapshot | null;
  /** Injectable clock (default: the real system clock). */
  readonly now?: () => string;
}

/** What the studio composition exposes: the port + dispose. */
export interface StudioHostComposition {
  readonly host: TransformStudioHostPort;
  dispose(): Promise<void>;
}

/**
 * The FIXTURE probe used at app-attach seed time (clearly labeled — the
 * studio owns no app-action path; invoke is an honest typed failure).
 */
class StudioFixtureProbe implements ApplicationCapabilityInvocationPort {
  async probeTarget(): Promise<{ reachable: boolean; detail: string }> {
    return { reachable: true, detail: "fixture probe — studio host seed attach (no real app process in the studio composition)" };
  }
  async invoke(): Promise<ApplicationCapabilityInvocationResult> {
    return { status: "failed", failureKind: "studio-no-app-action-path", detail: "the studio host never invokes app capabilities (no app-action path)" };
  }
}

/**
 * The blob-store hash-format bridge: the run service hashes in the
 * `@sporta/transforms` form ("sha256:<hex>") while the REAL FS store
 * shards by its own bare-hex content addresses (the W4-C path law). A
 * pure format adapter — both hashes are REAL sha-256 over the same
 * bytes, and the run service's fail-closed drift check still compares
 * real hash values on every commit.
 */
class TransformHashBlobStore implements ArtifactBlobStorePort {
  readonly #inner: FsArtifactBlobStore;
  constructor(rootDir: string) {
    this.#inner = new FsArtifactBlobStore(rootDir);
  }
  async put(content: Uint8Array): Promise<string> {
    return `sha256:${await this.#inner.put(content)}`;
  }
  async read(contentHash: string): Promise<Uint8Array> {
    return this.#inner.read(contentHash.replace(/^sha256:/, ""));
  }
}

/** Build the REAL studio host composition (seeding is async + fail-honest). */
export function createStudioHostComposition(config: StudioHostCompositionConfig): StudioHostComposition {
  const principal = config.principal ?? SPORTA_HOST_USER;
  const now = config.now ?? systemClockNow;

  // REAL marketplace services over their ports (stores injected).
  const marketplaceHash = new Sha256MarketplaceHash();
  const manifests = new FixtureManifestSource();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const listings = new InMemoryListingStore();
  const entitlements = new InMemoryEntitlementStore();
  const lanes = new InMemoryCheckLaneStore(); // SHARED: submission writes, review reads
  const submission = new SubmissionService({
    clock: { now }, hash: marketplaceHash, candidates, lanes, manifests,
    validateGraph: validateTransformPipelineManifest,
  });
  const review = new ReviewService({ clock: { now }, hash: marketplaceHash, candidates, decisions, lanes });
  const listingService = new ListingService({
    clock: { now }, hash: marketplaceHash, candidates, decisions, listings,
    suspensions: new InMemorySuspensionStore(), events: new InMemoryListingStateEventStore(), manifests,
  });
  const entitlementService = new EntitlementService({
    clock: { now }, hash: marketplaceHash, listings, entitlements, settlements: new FixtureSettlementAdapter(),
  });
  const admission = new FeedLaunchAdmissionService({
    clock: { now }, hash: marketplaceHash, listings, entitlements, candidates, manifests,
  });

  // REAL app-environment service over its ports.
  const appDescriptors = new InMemoryApplicationDescriptorStore();
  const appAttachments = new InMemoryApplicationAttachmentStore();
  const environment = new ApplicationEnvironmentService({
    clock: { now }, descriptors: appDescriptors, attachments: appAttachments, adapter: new StudioFixtureProbe(),
    sessions: new ApplicationSessionService({
      clock: { now }, attachments: appAttachments, descriptors: appDescriptors,
      sessions: new InMemoryApplicationSessionStore(),
    }),
  });

  // REAL sample-run legs: deterministic child process + REAL FS blob store.
  const transformHash = new Sha256TransformHash();
  const componentStore = new DeterministicComponentStore([jsonEventStreamTrimComponent(transformHash)], transformHash);
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const blobStore = new TransformHashBlobStore(config.blobRoot);
  const workGraphs = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now });
  const runService = new TransformRunService({
    clock: { now }, hash: transformHash, artifacts, blobs: blobStore,
    models: new FixtureTransformModelAdapter(), // FIXTURE-labeled; never invoked (no model node)
    deterministic: new DeterministicFilterNodeAdapter({ store: componentStore }),
    components: componentStore, workGraphRefs: workGraphs,
  });

  const sampleManifest = studioSeedManifest(STUDIO_SAMPLE_PIPELINE_ID);
  const suspendedManifest = studioSeedManifest(STUDIO_SUSPENDED_PIPELINE_ID);

  /** Seed the world (async: entitlement grant + consent-to-attach probe). */
  const ready = (async () => {
    const published = publishSeed(sampleManifest, "Studio highlights trim");
    await entitlementService.grantEntitlement({ principal, listingId: published.listingId });
    const boards = publishSeed(suspendedManifest, "Studio tag boards (suspended)");
    await entitlementService.grantEntitlement({ principal, listingId: boards.listingId });
    listingService.suspendListing(
      boards.listingId,
      { reason: "studio host seed: suspended listing (new runs blocked, history kept)" },
      STUDIO_PUBLISHER,
    );
    // App attachments: observe-only, observe+control with learning
    // consent, and a revoked one (all through the REAL service paths;
    // DISTINCT attachment ids — the same-clock default id would collide).
    const descriptor = environment.registerDescriptor(studioSeedDescriptor(now()));
    const expiry = new Date(Date.parse(now()) + 30 * 24 * 3600 * 1000).toISOString();
    const consent = (attachmentId: string, granted: readonly ("observe" | "control")[], workGraphId: string | null) =>
      environment.consentToAttach({
        attachmentId, descriptorId: descriptor.descriptorId, consentedBy: principal, tenant: SPORTA_HOST_TENANT,
        scope: { workspace: STUDIO_WORKSPACE, workGraphId }, grantedCapabilityClasses: granted,
        expiresAt: expiry, policySnapshot: "policy:studio-host-v1",
      });
    await consent("att:studio-observe-1", ["observe"], null);
    const controller = await consent("att:studio-controller-1", ["observe", "control"], STUDIO_WORK_GRAPH_ID);
    environment.grantLearningConsent(controller.attachmentId, { scope: "app-highlights", retention: "30 days" });
    environment.revokeAttachment((await consent("att:studio-revoked-1", ["observe"], null)).attachmentId);
    // The sample run's WorkGraph home (real service, fixture store).
    await workGraphs.openIntent({
      workGraphId: STUDIO_WORK_GRAPH_ID,
      intent: {
        goal: "studio host: sample preview run of the seeded trim pipeline",
        constraints: [], artifactRequirements: ["trimmed event stream"],
        learningPolicy: { scopes: ["preference", "workflow", "capability"], requireConsent: true },
        policy: SPORTA_HOST_POLICY satisfies PolicySet,
      },
    });
    const runNode = await workGraphs.appendNode({
      workGraphId: STUDIO_WORK_GRAPH_ID, kind: "artifact",
      actor: { actorKind: "agent-run", actorRef: "run:studio-sample" },
    });
    return { published, boards, runNode };
  })();
  ready.catch(() => undefined); // observed here; port calls re-throw it honestly

  /** Publish one seeded manifest through the REAL marketplace gates. */
  function publishSeed(manifest: TransformPipelineManifest, title: string): TransformListing {
    manifests.register(manifest);
    const draft = submission.startDraft({
      pipelineId: manifest.pipelineId, version: manifest.version, manifestDigest: manifest.manifestDigest,
      contentHashes: [{ kind: "code", digest: marketplaceHash.text(`code@${manifest.version}`) }],
      attestations: [{ kind: "license", reference: `license:${manifest.version}` }, { kind: "sbom", reference: `sbom:${manifest.version}` }],
      submittedBy: manifest.publisher,
    });
    submission.submitCandidate(draft.candidateId);
    submission.runAutomatedChecks(draft.candidateId, { dependencySignals: { "json-event-stream-trim": "clean" }, similaritySignal: null });
    const reviewedAt = now();
    review.recordReviewDecision({
      candidateId: draft.candidateId, outcome: "approved",
      humanReview: [
        { role: "product", reviewer: "reviewer:studio-product", reviewedAt },
        { role: "rights", reviewer: "reviewer:studio-rights", reviewedAt },
        { role: "security", reviewer: "reviewer:studio-security", reviewedAt },
      ],
      rationale: "studio host fixture content, real review gates", policyVersion: "policy:studio-host-v1",
    });
    return listingService.publishApprovedRelease({
      candidateId: draft.candidateId, title,
      description: "studio host seed listing (fixture content, real gates)",
      category: "video", supportedFeedTypes: ["prerecorded"],
      expectedOutputs: [...manifest.expectedOutputs], limitations: [...manifest.limitations],
      compatibility: ["local"], support: manifest.publisher,
      offer: { kind: "free", price: null, settlementProviderRef: null, usageLimits: { maxRuns: null, expiresAt: null }, termsLicense: "MIT" },
      rightsPrerequisites: ["authorized source footage"], changelog: `release ${manifest.version}`,
    });
  }

  let sampleRun: TransformRunManifest | null = null;
  const runSample = async (): Promise<TransformRunManifest> => {
    if (sampleRun === null) {
      const { published, runNode } = await ready;
      sampleRun = await runService.runPipeline({
        manifest: sampleManifest,
        workGraph: { workGraphId: STUDIO_WORK_GRAPH_ID, runRef: "run:studio-sample" },
        parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
        inputs: [{
          artifactRef: STUDIO_SAMPLE_FEED_REF, rightsSnapshot: "rights:studio-host-operator",
          bytes: studioSampleFeedBytes(),
          provenance: {
            sourceKind: "authorized-source", sourceRef: STUDIO_SAMPLE_FEED_REF,
            capturedAt: STUDIO_SAMPLE_PROVENANCE_AT, confidence: 0.95,
          },
        }],
        releaseDigest: published.currentRelease.releaseDigest, // pin the APPROVED release
        ...(runNode === undefined ? {} : { workGraphArtifactNode: runNode.nodeId }),
      });
    }
    return sampleRun;
  };

  const host: TransformStudioHostPort = {
    evidence: "real",
    async validateGraph(draft: StudioGraphDraft): Promise<StudioValidationResult> {
      await ready; // seeding failures surface here, never faked success
      return validateTransformPipelineManifest(studioDraftManifest(draft)); // typed result VERBATIM
    },
    async listListings() {
      const { published, boards } = await ready;
      return [published, boards]
        .map((listing) => listings.byId(listing.listingId))
        .filter((listing): listing is TransformListing => listing !== null)
        .map(projectListing);
    },
    async readReviewStatus(pipelineId: string, version: string) {
      await ready;
      const candidate = candidates.byPipelineAndVersion(pipelineId, version);
      if (candidate === null || candidate.candidateDigest === null) return null;
      const forDigest = decisions.byCandidate(candidate.candidateDigest);
      const latest = forDigest[forDigest.length - 1];
      return latest === undefined ? null : projectReviewStatus(latest);
    },
    async readLaunchDisclosure(listingId: string) {
      await ready;
      // Typed errors (unknown listing / unresolvable manifest) PROPAGATE.
      return projectDisclosure(admission.buildLaunchDisclosure(listingId));
    },
    async readSamplePreview(pipelineId: string, version: string) {
      await ready;
      if (pipelineId !== STUDIO_SAMPLE_PIPELINE_ID || version !== STUDIO_VERSION) return null;
      return projectSamplePreview(await runSample(), "5-event prerecorded sample feed (window 1500ms..4500ms)");
    },
    async listAppAttachments() {
      await ready;
      const views: StudioAppAttachmentView[] = [];
      for (const attachment of environment.listAttachmentsByScope(STUDIO_WORKSPACE)) {
        const descriptor = environment.readDescriptor(attachment.descriptorId);
        if (descriptor === null) continue; // honest skip: no descriptor, no view
        views.push(projectAppAttachment(descriptor, attachment));
      }
      return views;
    },
    async selectForLaunch(listingId: string) {
      await ready;
      return admission.selectForLaunch({ // fail-closed result VERBATIM
        listingId, principal, rightsSnapshot: config.operatorRights ?? null,
      });
    },
  };

  return {
    host,
    dispose: async () => {
      // No composition-owned long-lived resource: the sample-run child
      // process is scoped to its call (the adapter cleans its temp dir);
      // the FS blob store holds no handle. Await seeding so dispose
      // never outruns it (a seeding failure was already surfaced or
      // will be by any port call).
      await ready.catch(() => undefined);
    },
  };
}

/**
 * The product-host convenience wiring: the studio composition with the
 * OPERATOR defaults (the host operator principal + the operator's
 * wiring-time rights declaration — the UsageDeclaredEditorHistory
 * precedent: the HOST declares the operator's context; the admission
 * GATE stays real and fail-closed; this declares, it never bypasses).
 */
export function createOperatorStudioHostComposition(blobRoot: string): StudioHostComposition {
  return createStudioHostComposition({
    blobRoot,
    principal: SPORTA_HOST_USER,
    operatorRights: {
      satisfied: ["authorized source footage"],
      evidenceRefs: ["rights:sporta-host-operator-declaration"],
    },
  });
}
