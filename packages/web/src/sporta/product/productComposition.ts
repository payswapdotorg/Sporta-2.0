/**
 * productComposition.ts — the W12-D TL integration: the headless REAL
 * composition behind the product screens (runs / library / my-pipelines /
 * connected-apps). Composes the three W12 lanes' REAL hosts over the REAL
 * services (W12-A runs+library, W12-B marketplace submission-states,
 * W12-C connected-apps audit+revoke) behind ONE wiring point.
 *
 * HEADLESS Node composition — this module NEVER enters the browser bundle
 * (no React file may import it; the browser mount keeps the labeled fixture
 * hosts through app.tsx's OPTIONAL `realScreenPorts` — absent = fixture,
 * present = these REAL hosts). The composition owns NO state: every host
 * is a pure projection over its REAL service (the state-owner law); the
 * services behind them are constructed here once and shared per-leg.
 *
 * Honesty law (W12-07): every REAL host carries its additive `gradeNote`
 * verbatim from its lane (fixture-grade in-memory stores labeled, never
 * re-badged); `backing: "real"` is the host grade — the STORE grades ride
 * in the notes.
 *
 * DEPENDENCY LAW (WO-C1): @sporta/* resolves through the transitional
 * gitignored symlinks in packages/web/node_modules/@sporta; no manifest or
 * lockfile is touched here.
 */
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  Sha256TransformHash,
  TransformRunService,
  jsonEventStreamTrimComponent,
} from "@sporta/transforms/contract";
import type { TransformRunService as RunService } from "@sporta/transforms/contract";
import {
  CreatorCandidateQueryService,
  FixtureManifestSource,
  InMemoryCandidateStore,
  InMemoryCheckLaneStore,
  InMemoryDecisionStore,
  Sha256MarketplaceHash,
  SubmissionService,
  systemClockNow,
} from "@sporta/marketplace/contract";
import {
  ArtifactGraphService,
  FsArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import type { ArtifactBlobStorePort } from "@sporta/artifacts/contract";
import {
  ApplicationActionService,
  ApplicationEnvironmentService,
  ApplicationSessionService,
  InMemoryApplicationActionAuditStore,
  InMemoryApplicationAttachmentStore,
  InMemoryApplicationDescriptorStore,
  InMemoryApplicationSessionStore,
  Sha256AppEnvironmentHash,
} from "@sporta/app-environments/contract";
import type { ApplicationCapabilityInvocationPort } from "@sporta/app-environments/contract";
import { InMemoryWorkGraphStore, WorkGraphService } from "@sporta/work/contract";
import { validateTransformPipelineManifest } from "@sporta/transforms/contract";
import { createRunsRealHost } from "../runs/runsRealHost.js";
import type { RunsRealHost } from "../runs/runsRealHost.js";
import { createLibraryRealHost } from "../library/libraryRealHost.js";
import type { LibraryRealHost } from "../library/libraryRealHost.js";
import { createMyPipelinesRealHost } from "../marketplace/myPipelinesRealHost.js";
import type { MyPipelinesRealHost } from "../marketplace/myPipelinesRealHost.js";
import { createAppsRealHost } from "../apps/appsRealHost.js";
import type { AppsRealHost } from "../apps/appsRealHost.js";

/** Constructor config — the REAL FS blob-store leg's location is caller-supplied. */
export interface SportaProductCompositionConfig {
  /** Real directory for the FS blob store legs (content-addressed; shared root law). */
  readonly blobRoot: string;
  /** Injectable clock (default: the real system clock). */
  readonly now?: () => string;
}

/**
 * The composition's REAL services (harness-facing): the headless harness
 * drives REAL data through these — the hosts project it to the screens.
 * The stores are the lane-labeled fixture-grade in-memory ones (the
 * W12 gradeNotes carry that verbatim — never re-badged here).
 */
export interface SportaProductCompositionServices {
  /** The REAL run ledger authority (W12-A). */
  readonly runService: RunService;
  /** The REAL artifact registry authority (W12-A library lane). */
  readonly artifacts: ArtifactGraphService;
  /** The REAL candidate store behind the creator query (W12-B). */
  readonly candidates: InMemoryCandidateStore;
  /** The REAL decision store behind the frozen review seam (W12-B). */
  readonly decisions: InMemoryDecisionStore;
  /** The REAL submission service (the candidate write path — harness-facing). */
  readonly submission: SubmissionService;
  /** The REAL app-environment service (W12-C). */
  readonly environment: ApplicationEnvironmentService;
  /** The REAL app action/audit service (W12-C). */
  readonly actionAudit: ApplicationActionService;
}

/** What the product composition exposes: the four REAL hosts + services. */
export interface SportaProductComposition {
  readonly runs: RunsRealHost;
  readonly library: LibraryRealHost;
  readonly myPipelines: MyPipelinesRealHost;
  readonly connectedApps: AppsRealHost;
  readonly services: SportaProductCompositionServices;
}

/**
 * The FS-backed blob store with the transforms hash-format bridge (the
 * studioComposition precedent, verbatim pattern): the run service hashes
 * in the `@sporta/transforms` form ("sha256:<hex>") while the REAL FS
 * store shards by bare-hex content addresses. A pure format adapter —
 * both hashes are REAL sha-256 over the same bytes.
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

/**
 * The composition's capability-invocation probe (the studio composition's
 * StudioFixtureProbe precedent): targets reachable so attach verifies
 * REAL (fail-closed); invoke is never a fake success — the honest typed
 * failure (this composition hosts no app process; the app-action path
 * belongs to the attached-app adapters, not the composition root).
 */
class ProductCompositionProbe implements ApplicationCapabilityInvocationPort {
  async probeTarget(): Promise<{ reachable: boolean; detail: string }> {
    return {
      reachable: true,
      detail: "product composition probe (fixture) — attach verification only; no app process is hosted by the composition root",
    };
  }
  async invoke(): Promise<never> {
    throw new Error(
      "product composition hosts no app-action path — invoke is refused (the studio-no-app-action-path law)",
    );
  }
}

/**
 * Build the W12-D REAL product composition. Every leg is the REAL service
 * the lane froze; every host is the lane's pure projection. Nothing is
 * seeded here — the honest empty states surface until the harness (or
 * a production host) drives data through the services.
 */
export function createSportaProductComposition(
  config: SportaProductCompositionConfig,
): SportaProductComposition {
  const now = config.now ?? systemClockNow;

  // --- W12-A: the runs + library legs -----------------------------------
  const transformHash = new Sha256TransformHash();
  const componentStore = new DeterministicComponentStore(
    [jsonEventStreamTrimComponent(transformHash)],
    transformHash,
  );
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const blobs = new TransformHashBlobStore(config.blobRoot);
  const workGraphs = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now });
  const runService = new TransformRunService({
    clock: { now },
    hash: transformHash,
    artifacts,
    blobs,
    models: new FixtureTransformModelAdapter(), // FIXTURE-labeled; never invoked (no model node)
    deterministic: new DeterministicFilterNodeAdapter({ store: componentStore }),
    components: componentStore,
    workGraphRefs: workGraphs,
  });
  const runs = createRunsRealHost({ service: runService });
  const library = createLibraryRealHost({ graph: artifacts });

  // --- W12-B: the marketplace submission-states legs ---------------------
  const marketplaceHash = new Sha256MarketplaceHash();
  const manifests = new FixtureManifestSource();
  const candidates = new InMemoryCandidateStore();
  const decisions = new InMemoryDecisionStore();
  const lanes = new InMemoryCheckLaneStore();
  const submission = new SubmissionService({
    clock: { now },
    hash: marketplaceHash,
    candidates,
    lanes,
    manifests,
    validateGraph: validateTransformPipelineManifest,
  });
  const query = new CreatorCandidateQueryService({ candidates });
  // The frozen review seam: the decision store's byCandidate read (the
  // structural CreatorReviewDecisionRead — no write surface exposed).
  const myPipelines = createMyPipelinesRealHost({ query, review: decisions });

  // --- W12-C: the connected-apps legs ------------------------------------
  const clock = { now };
  const appHash = new Sha256AppEnvironmentHash();
  const descriptorStore = new InMemoryApplicationDescriptorStore();
  const attachmentStore = new InMemoryApplicationAttachmentStore();
  const sessionStore = new InMemoryApplicationSessionStore();
  const auditStore = new InMemoryApplicationActionAuditStore();
  const sessions = new ApplicationSessionService({
    clock,
    attachments: attachmentStore,
    descriptors: descriptorStore,
    sessions: sessionStore,
  });
  const environment = new ApplicationEnvironmentService({
    clock,
    descriptors: descriptorStore,
    attachments: attachmentStore,
    adapter: new ProductCompositionProbe(),
    sessions,
  });
  const actionAudit = new ApplicationActionService({
    clock,
    hash: appHash,
    descriptors: descriptorStore,
    attachments: attachmentStore,
    sessions: sessionStore,
    audit: auditStore,
    invocation: new ProductCompositionProbe(),
  });
  // The host rides the session STORE's enumeration read (the W12-C law:
  // the session store is the single session state owner).
  const connectedApps = createAppsRealHost({ environment, actionAudit, sessions: sessionStore });

  return {
    runs,
    library,
    myPipelines,
    connectedApps,
    services: {
      runService,
      artifacts,
      candidates,
      decisions,
      submission,
      environment,
      actionAudit,
    },
  };
}
