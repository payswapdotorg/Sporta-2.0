/**
 * W7C-2 — `bootSportaLocal`: the single-entry LOCAL BOOT composition
 * (SPEC §W7C-2, the P8 "local install" leg).
 *
 * HEADLESS Node only — this module NEVER enters the browser bundle (the
 * W4-C composition law; no React file may import it). One call wires the
 * REAL product host:
 *
 * - real FS stores on disk: artifact blobs (FsArtifactBlobStore), editor
 *   sessions (FsEditorSessionHistoryStore wired as the broker's
 *   sessionHistory dep — every openSession/reconcile append is durable),
 *   shared sessions (FsSharedSessionStore behind the level-3 service), and
 *   run journals (FsAgentRunJournal + ResumingAgentRuntime over the real
 *   process adapter — the w7a persistent-worker lane);
 * - the REAL product projection deps: ALL read seams (editor-session
 *   history via the usage-declared real service, learning artifacts,
 *   organization candidates, escalations) PLUS the w6c sharedSessionHistory
 *   seam (SharedSessionStoreProjection over the real FS store);
 * - the live shared-session service over the real WS delta sink, bound to
 *   a real port (the ACTUAL port read back and reported);
 * - the SportaHostPort surface (the SportaPanel route's exact contract).
 *
 * The returned wiring FACTS are measured, never defaulted silently. The
 * optional w7c-3 `wsAuth` config is the fail-closed origin/token auth;
 * absent = the documented dev-mode law (SPEC §W7C-3).
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  FsAgentRunJournal,
  InMemoryWorkGraphStore,
  ResumingAgentRuntime,
  WorkGraphService,
  ZCodeAgentRuntimeAdapter,
  systemClockNow,
} from "@sporta/work/contract";
import {
  InMemoryOrganizationStore,
  InMemoryUserPreferenceStore,
  OrganizationRegistryService,
  OrganizationResolverService,
  UserPreferenceService,
} from "@sporta/organizations/contract";
import { OrganizationCandidateReadService } from "@sporta/lab/contract";
import {
  ArtifactGraphService,
  FsArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import {
  EditorBrokerService,
  EditorSessionHistoryService,
  FsEditorSessionHistoryStore,
  FsSharedSessionStore,
  InMemoryEditorSessionStore,
  KdenliveAdapter,
  SharedEditorSessionService,
  WsSharedDeltaSink,
  sha256EditorHash,
  SystemClock as EditorSystemClock,
  type WsUpgradeAuthConfig,
} from "@sporta/editors/contract";
import { ArenaClientService, HttpArenaTransport } from "@sporta/arena/contract";
import {
  LearningIntakeService,
  ProductLoopProjection,
  SharedSessionProjection,
  SharedSessionStoreProjection,
  sharedSessionProjectionFromDeps,
} from "@sporta/product/contract";
import type { SportaHostPort } from "../hostPorts.js";
import type { SportaLoopDriver } from "../composition.js";
import { SPORTA_HOST_POLICY, SPORTA_HOST_USER } from "../hostSeeds.js";
import { buildBootSurfaces, type BootCore } from "./bootSurfaces.js";
import {
  LOCAL_BOOT_COMPONENT_IDS,
  type LocalBootComponentId,
} from "./deploymentDescriptor.js";

/** The local boot config — every REAL leg's location is caller-supplied. */
export interface SportaLocalBootConfig {
  /** Real directory the four store roots live under (created by the boot). */
  readonly storeRoot: string;
  /** Real CLI executable for the process leg (the w7a persistent-worker runtime). */
  readonly zcodeCliPath: string;
  /** Real Arena HTTP base URL for the arena leg. */
  readonly arenaBaseUrl: string;
  /** Bind host for the WS delta sink; default '127.0.0.1' (the local-install posture). */
  readonly wsHost?: string;
  /** Bind port for the WS delta sink; default 0 = OS-assigned (actual port reported). */
  readonly wsPort?: number;
  /**
   * w7c-3 optional WS auth (origin allow-list + shared token, fail-closed).
   * Absent = the documented dev-mode law.
   */
  readonly wsAuth?: WsUpgradeAuthConfig;
}

/** The measured wiring facts (ports read back from the OS, roots on disk). */
export interface LocalBootWiringFacts {
  readonly bootedAt: string;
  readonly storeRoots: {
    readonly blobs: string;
    readonly editorSessions: string;
    readonly sharedSessions: string;
    readonly runJournals: string;
  };
  /** The ACTUAL bound port, read back from the OS (never the requested guess). */
  readonly ports: { readonly wsDeltaSink: number };
  readonly seams: {
    readonly editorSessionHistory: true;
    readonly learningArtifacts: true;
    readonly organizationCandidates: true;
    readonly escalations: true;
    readonly sharedSessionHistory: true;
  };
  readonly components: readonly LocalBootComponentId[];
  readonly wsAuthMode: "dev-mode" | "fail-closed";
}

/** Everything a booted local Sporta exposes. */
export interface SportaLocalBoot {
  /** The SportaPanel route's exact contract (readState + the two write paths). */
  readonly host: SportaHostPort;
  /** Headless loop primitives (mirrors the W4-C composition's driver). */
  readonly loop: SportaLoopDriver;
  /** The level-3 live/shared editor session service (the WS sink's writer). */
  readonly sharedSessions: SharedEditorSessionService;
  /** The real WS delta sink (bound; the actual port is in the facts). */
  readonly deltaSink: WsSharedDeltaSink;
  /** The w6c-4 read-only shared-session projection (the takeover UX seam). */
  readonly sharedSessionProjection: SharedSessionProjection;
  readonly facts: LocalBootWiringFacts;
  /** Tear down cleanly: close the sink's clients + listener, dispose the runtime. */
  dispose(): Promise<void>;
}

/** The usage-declared editor-history bridge (the W4-C host wiring pattern). */
class UsageDeclaredEditorHistory {
  readonly #service: EditorSessionHistoryService;
  readonly #usages: readonly string[];
  constructor(service: EditorSessionHistoryService, usages: readonly string[]) {
    this.#service = service;
    this.#usages = usages;
  }
  async listEditorSessions(query: Parameters<EditorSessionHistoryService["listEditorSessions"]>[0]) {
    return this.#service.listEditorSessions({ ...query, usage: { usages: this.#usages } });
  }
}

/** One call boots the composition and returns the wiring facts. */
export async function bootSportaLocal(config: SportaLocalBootConfig): Promise<SportaLocalBoot> {
  // The four store roots, created on the real FS (measured facts, not defaults).
  const storeRoots = {
    blobs: join(config.storeRoot, "blobs"),
    editorSessions: join(config.storeRoot, "editor-history"),
    sharedSessions: join(config.storeRoot, "shared-sessions"),
    runJournals: join(config.storeRoot, "run-journals"),
  };
  await Promise.all(
    Object.values(storeRoots).map((root) => fs.mkdir(root, { recursive: true })),
  );

  // FIXTURE stores (labeled): in-memory work/organization/preference/session.
  const workService = new WorkGraphService({ store: new InMemoryWorkGraphStore(), now: systemClockNow });
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now: systemClockNow,
  });
  const preferences = new UserPreferenceService({
    store: new InMemoryUserPreferenceStore(),
    now: systemClockNow,
  });
  const resolver = new OrganizationResolverService({ catalog: registry, preferences });

  // REAL storage + editor legs (blob store + broker with DURABLE history).
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const blobStore = new FsArtifactBlobStore(storeRoots.blobs);
  const editorHistoryStore = new FsEditorSessionHistoryStore(storeRoots.editorSessions);
  const editors = new EditorBrokerService({
    clock: new EditorSystemClock(),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveAdapter(sha256EditorHash)],
    sessionHistory: editorHistoryStore, // REAL durable appends
  });

  // REAL arena leg (real HTTP transport; the role behind the URL is the caller's).
  const arena = new ArenaClientService({
    transport: new HttpArenaTransport({ baseUrl: config.arenaBaseUrl }),
  });

  // REAL read seams: learning intake + organization candidates.
  const learningIntake = new LearningIntakeService({ workGraphs: workService });
  const candidateReads = new OrganizationCandidateReadService({ catalog: registry });

  // REAL process leg with the w7a persistent-worker journal.
  const runtime = new ResumingAgentRuntime({
    inner: new ZCodeAgentRuntimeAdapter({ now: systemClockNow, zcodeCliPath: config.zcodeCliPath }),
    journal: new FsAgentRunJournal(storeRoots.runJournals),
  });

  // The w6c-4 shared-session seam: the REAL FsSharedSessionStore ledger
  // projected read-only for the takeover UX.
  const sharedSessionStore = new FsSharedSessionStore(storeRoots.sharedSessions);
  const sharedSessionHistory = new SharedSessionStoreProjection(
    sharedSessionStore,
    storeRoots.sharedSessions,
  );
  const sharedSessionProjection = sharedSessionProjectionFromDeps({ sharedSessionHistory });

  // The projection: read-only, ALL seams wired (incl. sharedSessionHistory).
  const projection = new ProductLoopProjection({
    workGraphs: workService,
    organizations: resolver,
    artifacts,
    editors,
    arena,
    userRef: SPORTA_HOST_USER,
    environmentProfile: "local",
    constraints: [],
    editorSessionHistory: new UsageDeclaredEditorHistory(
      new EditorSessionHistoryService({ history: editorHistoryStore }),
      SPORTA_HOST_POLICY.rights.usages,
    ),
    learningArtifacts: learningIntake,
    organizationCandidates: candidateReads,
    escalations: arena,
    sharedSessionHistory,
  });

  // The live shared-session service over the REAL WS delta sink (w6c-1).
  const deltaSink = new WsSharedDeltaSink({ auth: config.wsAuth });
  const actualWsPort = await deltaSink.listen(config.wsPort ?? 0, config.wsHost ?? "127.0.0.1");
  const sharedSessions = new SharedEditorSessionService({
    clock: new EditorSystemClock(),
    hash: sha256EditorHash,
    broker: editors,
    artifactGraph: artifacts,
    sharedSessionStore,
    deltaSink,
  });

  // The host surfaces (the SportaPanel route's contract + the loop driver).
  const core: BootCore = {
    workService,
    registry,
    resolver,
    artifacts,
    blobStore,
    editors,
    arena,
    learningIntake,
    runtime,
    kdenlive: new KdenliveAdapter(sha256EditorHash),
    projection,
  };
  const { host, loop } = buildBootSurfaces(core);

  const facts: LocalBootWiringFacts = {
    bootedAt: new Date().toISOString(),
    storeRoots,
    ports: { wsDeltaSink: actualWsPort }, // the ACTUAL bound port, read back
    seams: {
      editorSessionHistory: true,
      learningArtifacts: true,
      organizationCandidates: true,
      escalations: true,
      sharedSessionHistory: true,
    },
    components: [...LOCAL_BOOT_COMPONENT_IDS],
    wsAuthMode: config.wsAuth === undefined ? "dev-mode" : "fail-closed",
  };

  return {
    host,
    loop,
    sharedSessions,
    deltaSink,
    sharedSessionProjection,
    facts,
    dispose: async () => {
      await deltaSink.close(); // closes every client with 1001, then the listener
      runtime.dispose();
    },
  };
}
