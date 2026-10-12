/**
 * W7C-2 — the local-boot surfaces (SPEC §W7C-2): the SportaHostPort (the
 * SportaPanel route's exact contract — readState + the two write paths)
 * and the headless loop driver, constructed over the boot's wired core.
 *
 * The surface law is composition.ts's (W4-C) verbatim: the host owns
 * EXACTLY two write paths (learning-consent intake, takeover append);
 * everything else is the read-only projection. The difference from the
 * W4-C composition is the backing stores: editor sessions are durable on
 * the real FS (the broker appends through its FsEditorSessionHistoryStore
 * dep — no manual history writes here), and runs are journaled (the
 * ResumingAgentRuntime wired by boot.ts).
 */
import type { SportaConsentInput, SportaConsentOutcome, SportaHostPort, SportaHostState, SportaTakeoverInput, SportaTakeoverOutcome } from "../hostPorts.js";
import type { SportaLoopDriver } from "../composition.js";
import type { WorkGraphService } from "@sporta/work/contract";
import type { OrganizationRegistryService, OrganizationResolverService } from "@sporta/organizations/contract";
import type { ArtifactGraphService, FsArtifactBlobStore } from "@sporta/artifacts/contract";
import type { EditorBrokerService, KdenliveAdapter } from "@sporta/editors/contract";
import type { ArenaClientService } from "@sporta/arena/contract";
import type { LearningIntakeService, ProductLoopProjection } from "@sporta/product/contract";
import type { ResumingAgentRuntime } from "@sporta/work/contract";
import { LearningConsentRefusedError } from "@sporta/product/contract";
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
} from "../hostSeeds.js";

/** The wired core the surfaces drive (constructed by boot.ts). */
export interface BootCore {
  readonly workService: WorkGraphService;
  readonly registry: OrganizationRegistryService;
  readonly resolver: OrganizationResolverService;
  readonly artifacts: ArtifactGraphService;
  readonly blobStore: FsArtifactBlobStore;
  readonly editors: EditorBrokerService;
  readonly arena: ArenaClientService;
  readonly learningIntake: LearningIntakeService;
  readonly runtime: ResumingAgentRuntime;
  readonly kdenlive: KdenliveAdapter;
  /** The product loop projection (readState's read model). */
  readonly projection: ProductLoopProjection;
}

/** Build the host port + headless loop driver over the wired core. */
export function buildBootSurfaces(core: BootCore): {
  host: SportaHostPort;
  loop: SportaLoopDriver;
} {
  const {
    workService,
    registry,
    resolver,
    artifacts,
    blobStore,
    editors,
    arena,
    learningIntake,
    runtime,
    kdenlive,
    projection,
  } = core;

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
        provenance: { sourceKind: "agent-run", sourceRef: "run:sporta-host-seed", capturedAt: new Date().toISOString() },
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
        const currentBytes = await blobStore.read(currentRevisionHash); // REAL FS read
        const parsed = kdenlive.parseKdenliveXml(new TextDecoder().decode(currentBytes));
        const edited = sportaHostUserEdit(parsed); // fixture edit content (labeled)
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
          // The broker's own sessionHistory dep (the REAL FS store) already
          // appended this session — durability is the broker's write path.
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

  return { host, loop };
}
