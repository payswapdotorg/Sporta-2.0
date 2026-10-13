/**
 * The Transform Studio port — the packages/web surface law types
 * (W9C-6, SPEC "Transform Studio UX").
 *
 * TYPE-ONLY module: what the React render surface and the headless Node
 * composition share. Imports only types from the @sporta packages
 * (erased at build — verbatimModuleSyntax), so the browser bundle never
 * resolves a Node-only dependency.
 *
 * Surface law: one read state + typed write paths (graph edits,
 * validation, sample preview, launch selection/execution, app
 * attach/amend/revoke/learning-consent/act). The evidence grade is
 * surfaced IN the state (the honesty law: "real" vs "fixture").
 */
import type {
  ApplicationActionAdmissionResult,
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationCapabilityClass,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import type {
  TransformLaunchDisclosure,
  TransformListing,
  TransformReviewDecision,
} from "@sporta/marketplace/contract";
import type { TransformGraphValidation, TransformRunManifest } from "@sporta/transforms/contract";

/** Evidence grade of the backing studio host, surfaced in the UI. */
export type StudioEvidence = "real" | "fixture";

/** One node of the studio graph builder (the editable draft). */
export interface StudioGraphNode {
  nodeId: string;
  kind: string;
  componentName: string;
  componentDigest: string;
  note: string;
}

/** The graph-building + validation view state. */
export interface StudioGraphState {
  pipelineId: string;
  version: string;
  nodes: readonly StudioGraphNode[];
  edges: readonly { from: string; to: string }[];
  parameters: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  validation: TransformGraphValidation;
}

/** The sample-preview state (evidence graded per lane). */
export interface StudioPreviewState {
  status: "idle" | "ran" | "failed";
  detail: string;
  outputPreview: string;
  laneNotes: readonly string[];
  evidenceGrade: "real" | "fixture";
}

/** The marketplace/review status view (read ports only). */
export interface StudioMarketplaceState {
  listing: TransformListing | null;
  decisions: readonly TransformReviewDecision[];
  disclosure: TransformLaunchDisclosure | null;
}

/** The pipeline-selection-at-launch surfaces (admission/result). */
export interface StudioLaunchState {
  feedKind: "prerecorded" | "live";
  /** live ingress is fixture-labeled in the first slice (P9-25). */
  ingressGrade: "real" | "fixture";
  lastAdmission: { admitted: boolean; reason?: string; detail: string; releaseDigest?: string } | null;
  lastDisclosure: TransformLaunchDisclosure | null;
  lastRunManifest: {
    runManifestId: string;
    releaseDigest: string;
    outputs: number;
    semanticFidelity: TransformRunManifest["semanticFidelity"];
    steps: readonly { nodeId: string; status: string }[];
  } | null;
}

/** One attached app as the permission/data-scope panel sees it. */
export interface StudioAttachedAppState {
  attachment: ApplicationAttachment;
  dataScope: readonly string[];
  capabilityCatalog: readonly {
    capabilityId: string;
    capabilityClass: ApplicationCapabilityClass;
    action: string;
    sideEffects: readonly string[];
    requiredPermissions: readonly string[];
  }[];
  sessions: readonly ApplicationSession[];
  auditTrail: readonly ApplicationActionRecord[];
  targetVerification: { reachable: boolean; stateDigest: string | null } | null;
}

/** The app-environment permission surface (W9C-6). */
export interface StudioAppsState {
  attachableApp: {
    applicationId: string;
    descriptorId: string;
    targetIdentity: string;
    targetKind: string;
    dataScope: readonly string[];
    networkNeeds: string;
    limitations: readonly string[];
    licensing: { license: string; provenance: string };
    capabilities: StudioAttachedAppState["capabilityCatalog"];
  } | null;
  attached: readonly StudioAttachedAppState[];
}

/** The full studio read state. */
export interface StudioState {
  evidence: StudioEvidence;
  graph: StudioGraphState;
  preview: StudioPreviewState | null;
  marketplace: StudioMarketplaceState | null;
  launch: StudioLaunchState | null;
  apps: StudioAppsState;
}

/** Typed graph edits (the graph-building write path). */
export type StudioGraphEdit =
  | { kind: "add-node"; component: "json-event-stream-trim" | "fixture-event-summer" }
  | { kind: "remove-node"; nodeId: string }
  | { kind: "connect-edge"; from: string; to: string }
  | { kind: "set-parameters"; nodeId: string; values: Readonly<Record<string, unknown>> }
  | { kind: "reset" };

/** The last app-action admission/result surface (typed refusals visible). */
export interface StudioAppActionResult {
  admission: ApplicationActionAdmissionResult;
  record: ApplicationActionRecord;
}

/**
 * The studio host port: one read + the typed writes. Implemented
 * HEADLESS (Node) by the composition (studioComposition.ts) and by the
 * labeled fixture host for a browser route (studioFixtureHost.ts).
 */
export interface StudioHostPort {
  readState(): Promise<StudioState>;
  applyGraphEdit(edit: StudioGraphEdit): Promise<StudioState>;
  validateGraph(): Promise<StudioState>;
  previewSample(input: { feedBytes: Uint8Array }): Promise<StudioState>;
  selectForLaunch(input: {
    feedKind: "prerecorded" | "live";
    rightsSatisfied: readonly string[];
    rightsEvidenceRefs?: readonly string[];
  }): Promise<StudioState>;
  launchSelectedPipeline(input: {
    feedBytes: Uint8Array;
    rightsSatisfied: readonly string[];
    rightsEvidenceRefs?: readonly string[];
  }): Promise<StudioState>;
  attachApp(input: {
    grantedClasses: readonly ApplicationCapabilityClass[];
    consentedBy: string;
    expiresAt: string;
  }): Promise<StudioState>;
  amendAppGrant(input: {
    attachmentId: string;
    grantedClasses: readonly ApplicationCapabilityClass[];
    consentedBy: string;
  }): Promise<StudioState>;
  revokeAppAttachment(input: { attachmentId: string }): Promise<StudioState>;
  grantLearningConsent(input: { attachmentId: string; scope: string; retention: string }): Promise<StudioState>;
  executeAppAction(input: {
    capabilityId: string;
    payload?: string | null;
    confirm?: boolean;
  }): Promise<StudioState & { lastActionResult: StudioAppActionResult }>;
  dispose?(): Promise<void>;
}
