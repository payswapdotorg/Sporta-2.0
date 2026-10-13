/**
 * The Transform Studio headless composition (W9C-6) — SPEC "Transform
 * Studio UX". NEVER enters the browser bundle (no React file may import
 * it; a browser route uses the labeled fixture host).
 *
 * REAL legs (labeled): the @sporta/transforms validation + deterministic
 * execution lane (REAL child process over real temp-dir files), the
 * @sporta/marketplace services over real sha256 (submission → checks →
 * 3-role review → listing → entitlement → fail-closed admission), the
 * @sporta/app-environments services over the REAL ZCode agent path
 * (ZCodeAgentRuntimeAdapter spawns the caller-supplied executable — the
 * labeled stand-in in the sandbox; the real zcode-cli in production),
 * the REAL local file app target, the REAL WorkGraphService and
 * ArtifactGraphService + FsArtifactBlobStore on a real directory.
 *
 * FIXTURE (labeled): the in-memory stores, the FixedClock, the demo seed
 * content (manifest/feed/reviewers/organization), the
 * FixtureTransformModelAdapter model lane, the FixtureManifestSource.
 *
 * P9-03 law: launchSelectedPipeline executes the PINNED reviewed release
 * manifest (never the live draft), with the admitted release digest.
 */
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import type {
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
  ExecuteAppActionResult,
} from "@sporta/app-environments/contract";
import type {
  TransformLaunchDisclosure,
  TransformListingSelectionResult,
} from "@sporta/marketplace/contract";
import { validateTransformPipelineManifest } from "@sporta/transforms/contract";
import type {
  StudioGraphEdit,
  StudioHostPort,
  StudioLaunchState,
  StudioPreviewState,
  StudioState,
} from "./studioPorts.js";
import type { StudioAppActionResult } from "./studioPorts.js";
import {
  STUDIO_DEMO_POLICY,
  STUDIO_FEED_PROVENANCE,
  addPaletteNode,
  buildStudioManifest,
  connectNodes,
  initialStudioDraft,
  removeNode,
  setParameters,
  type StudioDraft,
} from "./studioGraph.js";
import {
  STUDIO_APP_TARGET_IDENTITY,
  STUDIO_PRINCIPAL,
  STUDIO_SESSION_PERMISSIONS,
  STUDIO_TENANT,
  STUDIO_WORKSPACE,
  demoJournalDescriptor,
  seedStudioMarketplace,
} from "./studioSeed.js";
import { runStudioPreview } from "./studioPreview.js";
import { projectStudioState, type StudioProjectionSeams } from "./studioProjection.js";
import { wireStudioWorld, type StudioWorldConfig } from "./studioWiring.js";

export type { StudioWorldConfig as StudioCompositionConfig } from "./studioWiring.js";

const WORK_GRAPH_ID = "wg:studio-demo";
const ARTIFACT_NODE_ID = "art:studio-outputs";

/** Build the studio host (the headless composition root; async seeding). */
export async function createStudioHost(config: StudioWorldConfig): Promise<StudioHostPort> {
  const world = wireStudioWorld(config);
  const {
    appEnvStore,
    localTarget,
    agentRuntime,
    workService,
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
  } = world;

  // Demo seed (fixture-labeled content; real services and real digests).
  const demoDescriptor = demoJournalDescriptor();
  registry.registerDescriptor(demoDescriptor);
  await localTarget.installDemoAppState(STUDIO_APP_TARGET_IDENTITY, { status: "ok", notes: [] });
  await workService.openIntent({
    workGraphId: WORK_GRAPH_ID,
    intent: {
      goal: "Compose, validate, launch and reconcile a transform pipeline with one attached app action",
      constraints: ["first slice: prerecorded feed, single input"],
      artifactRequirements: ["trimmed event stream"],
      learningPolicy: { scopes: [], requireConsent: true },
      policy: STUDIO_DEMO_POLICY,
    },
  });
  await workService.appendNode({
    workGraphId: WORK_GRAPH_ID,
    kind: "task",
    nodeId: "task:studio-launch",
    actor: { actorKind: "user", actorRef: STUDIO_PRINCIPAL },
  });
  await workService.appendNode({
    workGraphId: WORK_GRAPH_ID,
    kind: "artifact",
    nodeId: ARTIFACT_NODE_ID,
    parent: "task:studio-launch",
    actor: { actorKind: "user", actorRef: STUDIO_PRINCIPAL },
  });
  const published = seedStudioMarketplace({ manifests, submission, review, listing: listingService, entitlement });

  // Mutable studio view state.
  let draft: StudioDraft = initialStudioDraft();
  let preview: StudioPreviewState | null = null;
  let launch: StudioLaunchState | null = null;
  let lastVerification: { reachable: boolean; stateDigest: string | null } | null = null;
  let actionCounter = 0;
  let runCounter = 0;

  const seams: StudioProjectionSeams = {
    validate: (current) =>
      validateManifest(current),
    listingByPipeline: (pipelineId) => listings.byPipeline(pipelineId),
    decisionsByCandidateDigest: (digest) => decisions.byCandidate(digest),
    disclosureForListing: (listingId): TransformLaunchDisclosure | null => {
      try {
        return admission.buildLaunchDisclosure(listingId);
      } catch {
        return null; // unresolvable manifest refuses disclosure (fail-closed)
      }
    },
    attachments: () => attachments.listAttachments(demoDescriptor.applicationId),
    appDescriptor: (): ApplicationEnvironmentDescriptor | null =>
      appEnvStore.byDescriptorId(demoDescriptor.descriptorId),
    sessionsOf: (attachmentId) => appEnvStore.listByAttachment(attachmentId),
    auditTrailOf: (sessionIds) =>
      sessionIds.flatMap((sessionId) => appActions.readAuditTrail(sessionId)),
    targetVerification: () => lastVerification,
  };

  const state = (): StudioState => projectStudioState({ seams, draft, preview, launch });

  const stateWithResult = (
    result: StudioAppActionResult,
  ): StudioState & { lastActionResult: StudioAppActionResult } => ({
    ...projectStudioState({ seams, draft, preview, launch }),
    lastActionResult: result,
  });

  const selectLaunch = (
    feedKind: "prerecorded" | "live",
    rightsSatisfied: readonly string[],
    rightsEvidenceRefs: readonly string[],
  ): StudioLaunchState => {
    const result: TransformListingSelectionResult = admission.selectForLaunch({
      listingId: published.listingId,
      principal: STUDIO_PRINCIPAL,
      rightsSnapshot: { satisfied: rightsSatisfied, evidenceRefs: rightsEvidenceRefs },
    });
    let disclosure: TransformLaunchDisclosure | null = null;
    try {
      disclosure = admission.buildLaunchDisclosure(published.listingId);
    } catch {
      disclosure = null;
    }
    return {
      feedKind,
      ingressGrade: feedKind === "prerecorded" ? "real" : "fixture",
      lastAdmission: result.admitted
        ? {
            admitted: true,
            detail: `entitlement ${result.entitlementId} admitted the pinned release`,
            releaseDigest: result.releaseDigest,
          }
        : { admitted: false, reason: result.reason, detail: result.detail },
      lastDisclosure: disclosure,
      lastRunManifest: launch?.lastRunManifest ?? null,
    };
  };

  return {
    async readState() {
      return state();
    },
    async applyGraphEdit(edit: StudioGraphEdit) {
      draft = applyEdit(draft, edit);
      return state();
    },
    async validateGraph() {
      return state();
    },
    async previewSample(input: { feedBytes: Uint8Array }) {
      preview = await runStudioPreview(draft, input.feedBytes, deterministic, models);
      return state();
    },
    async selectForLaunch(input: {
      feedKind: "prerecorded" | "live";
      rightsSatisfied: readonly string[];
      rightsEvidenceRefs?: readonly string[];
    }) {
      launch = selectLaunch(input.feedKind, input.rightsSatisfied, input.rightsEvidenceRefs ?? []);
      return state();
    },
    async launchSelectedPipeline(input: {
      feedBytes: Uint8Array;
      rightsSatisfied: readonly string[];
      rightsEvidenceRefs?: readonly string[];
    }) {
      launch = selectLaunch("prerecorded", input.rightsSatisfied, input.rightsEvidenceRefs ?? []);
      const admitted = launch.lastAdmission?.admitted === true ? launch.lastAdmission : null;
      if (admitted === null || admitted.releaseDigest === undefined) return state();
      runCounter += 1;
      const runNode = `run:studio-launch-${runCounter}`;
      await workService.appendNode({
        workGraphId: WORK_GRAPH_ID,
        kind: "run",
        nodeId: runNode,
        parent: "task:studio-launch",
        actor: { actorKind: "agent-run", actorRef: runNode },
      });
      // P9-03: the run executes the PINNED reviewed release manifest.
      const runManifest = await runs.runPipeline({
        manifest: published.manifest,
        workGraph: { workGraphId: WORK_GRAPH_ID, runRef: runNode },
        parameters: draft.parameters,
        inputs: [
          {
            artifactRef: "feed:studio-demo",
            rightsSnapshot: JSON.stringify({ satisfied: input.rightsSatisfied }),
            bytes: input.feedBytes,
            provenance: STUDIO_FEED_PROVENANCE,
          },
        ],
        releaseDigest: admitted.releaseDigest,
      });
      launch = {
        ...launch,
        lastRunManifest: {
          runManifestId: runManifest.runManifestId,
          releaseDigest: runManifest.release.releaseDigest,
          outputs: runManifest.outputs.length,
          semanticFidelity: runManifest.semanticFidelity,
          steps: runManifest.steps.map((step) => ({ nodeId: step.nodeId, status: step.status })),
        },
      };
      return state();
    },
    async attachApp(input: {
      grantedClasses: readonly ApplicationCapabilityClass[];
      consentedBy: string;
      expiresAt: string;
    }) {
      const attachment = attachments.attachApplication({
        applicationId: demoDescriptor.applicationId,
        descriptorId: demoDescriptor.descriptorId,
        consentedBy: input.consentedBy,
        tenant: STUDIO_TENANT,
        scope: { workspace: STUDIO_WORKSPACE, workGraphId: WORK_GRAPH_ID },
        grantedCapabilityClasses: input.grantedClasses,
        expiresAt: input.expiresAt,
        policySnapshot: "policy:studio-demo-v1",
      });
      appSessions.openSession({
        attachmentId: attachment.attachmentId,
        versions: {
          app: demoDescriptor.appVersion,
          adapter: demoDescriptor.providerAdapterId,
          target: demoDescriptor.targetIdentity,
        },
      });
      const verification = await registry.verifyTarget(demoDescriptor.descriptorId);
      lastVerification = { reachable: verification.reachable, stateDigest: verification.stateDigest };
      return state();
    },
    async amendAppGrant(input: {
      attachmentId: string;
      grantedClasses: readonly ApplicationCapabilityClass[];
      consentedBy: string;
    }) {
      attachments.amendGrant({
        attachmentId: input.attachmentId,
        consentedBy: input.consentedBy,
        grantedCapabilityClasses: input.grantedClasses,
      });
      return state();
    },
    async revokeAppAttachment(input: { attachmentId: string }) {
      attachments.revokeAttachment({ attachmentId: input.attachmentId });
      return state();
    },
    async grantLearningConsent(input: { attachmentId: string; scope: string; retention: string }) {
      attachments.grantLearningConsent(input);
      return state();
    },
    async executeAppAction(input: { capabilityId: string; payload?: string | null; confirm?: boolean }) {
      // The LATEST attachment (revoked or not) and its session (closed or
      // not): the ACTION SERVICE's admission ladder produces the typed
      // refusal for revoked/expired/closed states — the product surface
      // shows the refusal instead of hiding the state.
      const latestAttachment = attachments.listAttachments(demoDescriptor.applicationId)[0];
      if (latestAttachment === undefined) {
        throw new Error("no app attachment on record — attach the app before executing an action");
      }
      const session = appEnvStore.listByAttachment(latestAttachment.attachmentId)[0];
      if (session === undefined) {
        throw new Error("no app session on record — the attachment never opened a session");
      }
      actionCounter += 1;
      const organization: OrganizationVersionRecord = {
        organizationId: "org:studio-demo",
        version: actionCounter,
        intentProfile: "sports-replay",
        roleGraph: [],
        agentBodies: [],
        cognitiveSubstrates: [],
        toolGraph: [],
        workflowGraph: [],
        environmentProfile: "local",
        fallbacks: [],
        budgets: {},
        learnedPreferences: [],
        evidence: [],
        policy: STUDIO_DEMO_POLICY,
      };
      const result: ExecuteAppActionResult = await appActions.executeAppAction({
        sessionId: session.sessionId,
        capabilityId: input.capabilityId,
        actor: "agent:studio-demo",
        inputRefs: [],
        payload: input.payload ?? null,
        sandbox: { grantedPermissions: STUDIO_SESSION_PERMISSIONS, networkAllowed: false },
        confirm: input.confirm,
        organization,
        workGraphId: WORK_GRAPH_ID,
        workGraphArtifactNode: ARTIFACT_NODE_ID,
      });
      return stateWithResult(result);
    },
    async dispose() {
      agentRuntime.dispose();
    },
  };
}

/** Validate one draft through the REAL w9a validation port. */
function validateManifest(current: StudioDraft) {
  return validateTransformPipelineManifest(buildStudioManifest(current), {
    parameters: current.parameters,
  });
}

/** Apply one typed graph edit. */
function applyEdit(draft: StudioDraft, edit: StudioGraphEdit): StudioDraft {
  switch (edit.kind) {
    case "add-node":
      return addPaletteNode(draft, edit.component);
    case "remove-node":
      return removeNode(draft, edit.nodeId);
    case "connect-edge":
      return connectNodes(draft, edit.from, edit.to);
    case "set-parameters":
      return setParameters(draft, edit.nodeId, edit.values);
    case "reset":
      return initialStudioDraft();
  }
}
