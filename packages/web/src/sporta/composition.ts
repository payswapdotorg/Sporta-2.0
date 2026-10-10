/**
 * The Sporta host composition root (W4C-3 — SPEC.md "Wave-4 host
 * conversion", ADR: docs/architecture/adr-wave4-c6-host.md).
 *
 * HEADLESS Node composition — this module NEVER enters the browser
 * bundle (no React file may import it; the browser route uses the
 * labeled fixture host). It wires the loop per the a17-full-real
 * composition:
 *
 * REAL legs (labeled): the process leg (a real spawned child process
 * speaking the stream-json headless interface — the executable is the
 * caller-supplied CLI path; the vendored zcode-cli remains unbuildable
 * in this sandbox, tests pass the labeled stand-in while the process,
 * pipes, wall time and exit code are real), the storage leg
 * (FsArtifactBlobStore on a real directory, real content-addressed
 * bytes), the editor leg (real KdenliveAdapter MLT parse → mutate →
 * serialize → re-parse through the real EditorBrokerService), the arena
 * leg (real HttpArenaTransport; the Arena ROLE behind the URL is the
 * caller's — a fixture-scripted server in tests), and the read seams
 * (real ArenaClientService escalation seam, real LearningIntakeService
 * learning seam, real OrganizationCandidateReadService organization
 * seam, real EditorSessionHistoryService session seam).
 *
 * FIXTURE (labeled): the in-memory work-graph/organization/preference/
 * session stores, the seed data (hostSeeds.ts), and the scripted Arena
 * role. No durability is claimed for fixture legs.
 *
 * DEPENDENCY LAW (WO-C1): @sporta/* resolves through the transitional
 * gitignored symlinks in packages/web/node_modules/@sporta (see
 * packages/web/.gitignore); no manifest or lockfile is touched here.
 */
import type { EditorSessionHistoryReadPort } from "@sporta/contracts/contract";
import {
  WorkGraphService,
  InMemoryWorkGraphStore,
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
  InMemoryEditorSessionStore,
  InMemoryEditorSessionHistoryStore,
  KdenliveAdapter,
  sha256EditorHash,
  SystemClock as EditorSystemClock,
} from "@sporta/editors/contract";
import { ArenaClientService, HttpArenaTransport } from "@sporta/arena/contract";
import {
  LearningIntakeService,
  LearningConsentRefusedError,
  ProductLoopProjection,
} from "@sporta/product/contract";
import type { SportaConsentInput, SportaConsentOutcome, SportaHostPort, SportaHostState, SportaTakeoverInput, SportaTakeoverOutcome } from "./hostPorts.js";
import {
  SPORTA_HOST_ARTIFACT_ID,
  SPORTA_HOST_INITIAL_MLT_XML,
  SPORTA_HOST_INTENT,
  SPORTA_HOST_ORG_ID,
  SPORTA_HOST_POLICY,
  SPORTA_HOST_REVISION_1,
  SPORTA_HOST_TENANT,
  SPORTA_HOST_USER,
  SPORTA_HOST_WORK_GRAPH_ID,
  sportaHostOrgDraft,
  sportaHostUserEdit,
} from "./hostSeeds.js";

/** Constructor config — every REAL leg's location is caller-supplied. */
export interface SportaHostCompositionConfig {
  /** Real CLI executable for the process leg (tests: the labeled stand-in). */
  zcodeCliPath: string;
  /** Real directory for the FS blob store leg. */
  blobRoot: string;
  /** Real Arena HTTP base URL for the arena leg (tests: a real localhost server). */
  arenaBaseUrl: string;
}

/**
 * Headless loop-driving primitives (NOT part of the host surface law —
 * the React surface consumes ONLY the `host` port; the headless test
 * drives the loop stages through these exactly like the a17 test).
 */
export interface SportaLoopDriver {
  openIntent(): Promise<void>;
  registerOrganizationDraft(
    version: number,
    learnedPreferences?: readonly string[],
  ): Promise<void>;
  promoteOrganization(version: number): Promise<void>;
  runExecution(task: string): Promise<{ events: number; wallMs: number }>;
  seedRenderArtifact(): Promise<{ contentHash: string }>;
  recordGapAndEscalate(gapId: string): Promise<{ escalationId: string }>;
  appendOutcome(nodeId: string): Promise<void>;
  arena(): ArenaClientService;
  readGraphStatus(): Promise<string>;
}

/** Everything the headless harness (test) may touch. */
export interface SportaHostComposition {
  host: SportaHostPort;
  loop: SportaLoopDriver;
  dispose(): Promise<void>;
}

/**
 * The usage-declared editor-history bridge: the projection consumes the
 * FROZEN contracts port (whose query carries no usage field), while the
 * real W3-B EditorSessionHistoryService is fail-closed (no usage ⇒
 * lists nothing — invariant 22). This adapter is the HOST declaring its
 * usage context at wiring time (the operator's usages; sessions carry
 * the operator policy, so the gate passes). The SERVICE and GATE are
 * real; only the declaration site is this adapter.
 */
class UsageDeclaredEditorHistory implements EditorSessionHistoryReadPort {
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

/** Build the full host composition (real legs per the composition law). */
export function createSportaHost(
  config: SportaHostCompositionConfig,
): SportaHostComposition {
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

  // REAL storage + editor legs.
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const blobStore = new FsArtifactBlobStore(config.blobRoot);
  const editors = new EditorBrokerService({
    clock: new EditorSystemClock(),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveAdapter(sha256EditorHash)],
  });

  // REAL session-history read seam (real service + gate; fixture store).
  const editorHistoryStore = new InMemoryEditorSessionHistoryStore();
  const editorHistory = new UsageDeclaredEditorHistory(
    new EditorSessionHistoryService({ history: editorHistoryStore }),
    SPORTA_HOST_POLICY.rights.usages,
  );

  // REAL arena leg (real HTTP transport; the role behind the URL is the caller's).
  const arena = new ArenaClientService({
    transport: new HttpArenaTransport({ baseUrl: config.arenaBaseUrl }),
  });

  // REAL read seams: learning intake + organization candidates.
  const learningIntake = new LearningIntakeService({ workGraphs: workService });
  const candidateReads = new OrganizationCandidateReadService({ catalog: registry });

  // REAL process leg (real spawn; executable is caller-supplied).
  const runtime = new ZCodeAgentRuntimeAdapter({ now: systemClockNow, zcodeCliPath: config.zcodeCliPath });

  // The projection: read-only, all seams wired.
  const projection = new ProductLoopProjection({
    workGraphs: workService,
    organizations: resolver,
    artifacts,
    editors,
    arena,
    userRef: SPORTA_HOST_USER,
    environmentProfile: "local",
    constraints: [],
    editorSessionHistory: editorHistory,
    learningArtifacts: learningIntake,
    organizationCandidates: candidateReads,
    escalations: arena,
  });

  let currentRevisionId = SPORTA_HOST_REVISION_1;
  let currentRevisionHash: string | null = null;
  let editorSessionId: string | null = null;

  const appendAgent = (input: { kind: "task" | "run" | "artifact" | "outcome"; nodeId: string; parent?: string; actorRef: string }) =>
    workService.appendNode({
      workGraphId: SPORTA_HOST_WORK_GRAPH_ID,
      actor: { actorKind: "agent-run", actorRef: input.actorRef },
      kind: input.kind,
      nodeId: input.nodeId,
      ...(input.parent === undefined ? {} : { parent: input.parent }),
    });

  const loop: SportaLoopDriver = {
    async openIntent() {
      await workService.openIntent({ workGraphId: SPORTA_HOST_WORK_GRAPH_ID, intent: SPORTA_HOST_INTENT });
    },
    async registerOrganizationDraft(version: number, learnedPreferences?: readonly string[]) {
      await registry.registerDraft({ record: sportaHostOrgDraft(version, learnedPreferences) });
    },
    async promoteOrganization(version: number) {
      await registry.promote({ organizationId: SPORTA_HOST_ORG_ID, version });
    },
    async runExecution(task: string) {
      const graph = await workService.readWorkGraph(SPORTA_HOST_WORK_GRAPH_ID);
      if (graph === null) {
        throw new Error("runExecution: the intent must be opened first");
      }
      const selection = await resolver.resolve({
        intent: SPORTA_HOST_INTENT,
        workGraph: graph,
        userRef: SPORTA_HOST_USER,
        environmentProfile: "local",
        constraints: [],
      });
      const started = Date.now();
      const handle = await runtime.startRun({
        workGraphId: SPORTA_HOST_WORK_GRAPH_ID,
        organization: selection.selected.organization,
        task,
      });
      let events: readonly { type: string }[] = [];
      const deadline = Date.now() + 30_000;
      for (;;) {
        events = await runtime.observeRun(handle.runId);
        const last = events[events.length - 1];
        if (last !== undefined && (last.type === "completed" || last.type === "failed")) break;
        if (Date.now() > deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await appendAgent({ kind: "task", nodeId: "task:render", actorRef: handle.runId });
      await appendAgent({ kind: "run", nodeId: handle.runId, actorRef: handle.runId });
      return { events: events.length, wallMs: Date.now() - started };
    },
    async seedRenderArtifact() {
      const bytes = new TextEncoder().encode(SPORTA_HOST_INITIAL_MLT_XML);
      const contentHash = await blobStore.put(bytes); // REAL FS write
      await artifacts.recordArtifact({
        artifactId: SPORTA_HOST_ARTIFACT_ID,
        kind: "tactical-board-video",
        editability: "editable",
        policy: SPORTA_HOST_POLICY,
      });
      await artifacts.commitRevision({
        artifactId: SPORTA_HOST_ARTIFACT_ID,
        revisionId: SPORTA_HOST_REVISION_1,
        contentHash,
        organizationVersion: { organizationId: SPORTA_HOST_ORG_ID, version: 1 },
        toolVersions: ["sporta-render@0"],
        provenance: { sourceKind: "agent-run", sourceRef: "run:sporta-host-seed", capturedAt: systemClockNow() },
        policy: SPORTA_HOST_POLICY,
      });
      const graph = await workService.readWorkGraph(SPORTA_HOST_WORK_GRAPH_ID);
      await appendAgent({
        kind: "artifact",
        nodeId: SPORTA_HOST_ARTIFACT_ID,
        parent: graph?.nodes.find((node) => node.kind === "run")?.nodeId,
        actorRef: "run:sporta-host-seed",
      });
      currentRevisionHash = contentHash;
      return { contentHash };
    },
    async recordGapAndEscalate(gapId: string) {
      await arena.recordGap({
        gapId,
        workGraphId: SPORTA_HOST_WORK_GRAPH_ID,
        capabilityNeed: "broadcast-frame-tracking",
        attemptedStrategies: ["builtin-tracker@0"],
        contextRefs: [SPORTA_HOST_WORK_GRAPH_ID, SPORTA_HOST_ARTIFACT_ID],
        evidence: [],
      });
      await workService.transitionStatus(SPORTA_HOST_WORK_GRAPH_ID, "escalated");
      const escalation = await arena.escalate({
        idempotencyKey: `esc:${gapId}`,
        gapId,
        tenantRef: SPORTA_HOST_TENANT,
        urgency: "high",
        sessionMode: "unblock",
        permittedActions: ["observe", "correct"],
        learningPermissions: { scopes: ["workflow", "capability"], requireConsent: true },
        contextRefs: [gapId],
        policy: SPORTA_HOST_POLICY,
      });
      return { escalationId: escalation.escalationId };
    },
    async appendOutcome(nodeId: string) {
      await appendAgent({ kind: "outcome", nodeId, parent: "task:render", actorRef: "run:sporta-host-seed" });
    },
    arena: () => arena,
    async readGraphStatus() {
      return (await workService.readWorkGraph(SPORTA_HOST_WORK_GRAPH_ID))?.status ?? "unknown";
    },
  };

  const host: SportaHostPort = {
    async readState(): Promise<SportaHostState> {
      return {
        workGraphId: SPORTA_HOST_WORK_GRAPH_ID,
        trace: await projection.trace(SPORTA_HOST_WORK_GRAPH_ID),
        evidence: "real",
      };
    },
    async submitConsent(input: SportaConsentInput): Promise<SportaConsentOutcome> {
      try {
        const artifact = await learningIntake.recordConsent({
          workGraphId: SPORTA_HOST_WORK_GRAPH_ID,
          userId: SPORTA_HOST_USER,
          scopes: input.scopes,
          decision: input.decision,
        });
        return { outcome: "granted", detail: artifact.learningArtifactId };
      } catch (error) {
        if (error instanceof LearningConsentRefusedError) {
          return { outcome: "refused", detail: error.message }; // surfaced, never swallowed
        }
        throw error;
      }
    },
    async submitTakeover(input: SportaTakeoverInput): Promise<SportaTakeoverOutcome> {
      try {
        if (currentRevisionHash === null) {
          return { outcome: "failed", detail: "no artifact revision to take over yet" };
        }
        const kdenlive = new KdenliveAdapter(sha256EditorHash);
        const currentBytes = await blobStore.read(currentRevisionHash); // REAL FS read
        const parsed = kdenlive.parseKdenliveXml(new TextDecoder().decode(currentBytes));
        const edited = sportaHostUserEdit(parsed); // fixture edit content
        const editedXml = kdenlive.exportToKdenliveXml(edited); // REAL serialize
        const reparsed = kdenlive.parseKdenliveXml(editedXml); // REAL re-parse
        if (JSON.stringify(reparsed) !== JSON.stringify(edited)) {
          return { outcome: "failed", detail: "MLT round-trip identity failed" };
        }
        if (editorSessionId === null) {
          const session = await editors.openSession({
            editorSessionId: `es:${SPORTA_HOST_WORK_GRAPH_ID}`,
            revisionId: currentRevisionId,
            editorId: "kdenlive",
            mode: "local",
            policy: SPORTA_HOST_POLICY,
          });
          editorSessionId = session.editorSessionId;
          await editorHistoryStore.append(session); // the real seam's store
        }
        const xmlBytes = new TextEncoder().encode(editedXml);
        const changedHash = await blobStore.put(xmlBytes); // REAL FS write
        const reconciled = await editors.reconcileSession({
          editorSessionId,
          changedProjectHash: changedHash,
          externalTool: { name: "kdenlive", version: "24.08.0" },
          projectFormat: "kdenlive",
          projectState: edited,
        });
        currentRevisionId = reconciled.revision.revisionId;
        currentRevisionHash = changedHash;
        await workService.appendNode({
          workGraphId: SPORTA_HOST_WORK_GRAPH_ID,
          actor: { actorKind: "user", actorRef: SPORTA_HOST_USER },
          kind: "action",
          nodeId: `edit:${input.label}`,
          parent: SPORTA_HOST_ARTIFACT_ID,
        });
        return { outcome: "appended", detail: `user edit "${input.label}" appended`, revisionId: currentRevisionId };
      } catch (error) {
        return { outcome: "failed", detail: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  return {
    host,
    loop,
    dispose: async () => {
      runtime.dispose();
    },
  };
}
