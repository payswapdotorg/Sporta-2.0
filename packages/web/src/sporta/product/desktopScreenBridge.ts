/**
 * desktopScreenBridge.ts — the W14 renderer-side typed bridge over the
 * preload IPC surface.
 *
 * RUNTIME LAW: this file is browser-safe (it may be imported by the
 * React mount) — every import from the headless Node composition is
 * TYPE-ONLY (erased at build; the browser bundle never carries node:fs
 * or the @sporta/* Node legs). The bridge's RUNTIME surface is the
 * preload's `window.sportaDesktopPorts` functions (contextBridge,
 * sandbox-safe), which forward to the Electron main process where the
 * REAL desktopComposition hosts live.
 *
 * VALUE LAW: every port shape crossing the bridge is plain JSON (the
 * frozen screen-port shapes — no bytes, no classes). THROWN typed
 * refusals propagate through IPC as Error messages; the screens
 * surface messages verbatim (their catch law) — never swallowed.
 */
import type { SportaRealScreenPorts } from "./app.js";
import type { SportaDesktopCompositionFacts } from "./desktopComposition.js";
import type { RunRecordShape } from "../runs/runsScreenPorts.js";
import type { LibraryArtifactShape, LibraryArtifactDetail } from "../library/libraryScreenPorts.js";
import type {
  CreatorPipelineRecord,
  MarketplaceReviewShape,
  ScreenRefusal,
} from "../marketplace/marketplaceScreenPorts.js";
import type { ConnectedAppView, ConnectedAppAuditShape } from "../apps/appsScreenPorts.js";
import type { TransformStudioHostPort } from "../studio/studioPorts.js";
import type {
  StudioGraphDraft,
  StudioValidationResult,
  StudioListingView,
  StudioReviewStatus,
  StudioDisclosureView,
  StudioSamplePreviewView,
  StudioAppAttachmentView,
  StudioLaunchAdmissionResult,
} from "../studio/studioPorts.js";

/** The preload-exposed function surface (ipcRenderer.invoke forwards). */
export interface SportaDesktopBridge {
  facts(): Promise<SportaDesktopCompositionFacts>;
  runsList(): Promise<readonly RunRecordShape[]>;
  runsRead(runManifestId: string): Promise<RunRecordShape>;
  libraryList(): Promise<readonly LibraryArtifactShape[]>;
  libraryRead(artifactId: string): Promise<LibraryArtifactDetail>;
  pipelinesList(creator: string): Promise<readonly CreatorPipelineRecord[]>;
  pipelinesStatus(pipelineId: string, version: string): Promise<MarketplaceReviewShape | ScreenRefusal>;
  appsList(): Promise<readonly ConnectedAppView[]>;
  appsAudit(attachmentId: string): Promise<readonly ConnectedAppAuditShape[]>;
  appsRevoke(attachmentId: string): Promise<{ ok: true; revokedAt: string } | { ok: false; reason: string }>;
  studioValidate(draft: StudioGraphDraft): Promise<StudioValidationResult>;
  studioListings(): Promise<readonly StudioListingView[]>;
  studioReview(pipelineId: string, version: string): Promise<StudioReviewStatus | null>;
  studioDisclosure(listingId: string): Promise<StudioDisclosureView>;
  studioPreview(pipelineId: string, version: string): Promise<StudioSamplePreviewView | null>;
  studioApps(): Promise<readonly StudioAppAttachmentView[]>;
  studioLaunch(listingId: string): Promise<StudioLaunchAdmissionResult>;
}

/** The preload's contextBridge global name (desktop only; null in browsers). */
const BRIDGE_GLOBAL = "sportaDesktopPorts";

/** Read the preload bridge — null in a plain browser (fixture mount). */
export function getSportaDesktopBridge(): SportaDesktopBridge | null {
  const candidate = (globalThis as { [key: string]: unknown })[BRIDGE_GLOBAL];
  return typeof candidate === "object" && candidate !== null
    ? (candidate as SportaDesktopBridge)
    : null;
}

/**
 * The REAL screen ports over the bridge (the app.tsx `realScreenPorts`
 * injection contract). The backing/gradeNote values come from the
 * MEASURED facts (the main-process composition's honest labels) —
 * never hardcoded here.
 */
export function createDesktopRealScreenPorts(
  bridge: SportaDesktopBridge,
  facts: SportaDesktopCompositionFacts,
): SportaRealScreenPorts {
  return {
    runs: {
      backing: facts.ports.runs.backing,
      gradeNote: facts.ports.runs.gradeNote,
      listRuns: () => bridge.runsList(),
      readRun: (runManifestId) => bridge.runsRead(runManifestId),
    },
    library: {
      backing: facts.ports.library.backing,
      gradeNote: facts.ports.library.gradeNote,
      listArtifacts: () => bridge.libraryList(),
      readArtifact: (artifactId) => bridge.libraryRead(artifactId),
    },
    myPipelines: {
      backing: facts.ports.myPipelines.backing,
      gradeNote: facts.ports.myPipelines.gradeNote,
      listCreatorRecords: (creator) => bridge.pipelinesList(creator),
      readCreatorVersionStatus: (pipelineId, version) =>
        bridge.pipelinesStatus(pipelineId, version),
    },
    connectedApps: {
      backing: facts.ports.connectedApps.backing,
      gradeNote: facts.ports.connectedApps.gradeNote,
      listAttachments: () => bridge.appsList(),
      readAuditTrail: (attachmentId) => bridge.appsAudit(attachmentId),
      revoke: (attachmentId) => bridge.appsRevoke(attachmentId),
    },
  };
}

/**
 * The REAL studio host over the bridge. The optional live-evidence and
 * dispose methods are omitted honestly (the composed studio host omits
 * the live seam; disposal belongs to the main process) — the workbench
 * shows its honest "not composed into this host" empty state.
 */
export function createDesktopStudioHost(
  bridge: SportaDesktopBridge,
  facts: SportaDesktopCompositionFacts,
): TransformStudioHostPort {
  return {
    evidence: facts.studio.evidence,
    validateGraph: (draft) => bridge.studioValidate(draft),
    listListings: () => bridge.studioListings(),
    readReviewStatus: (pipelineId, version) => bridge.studioReview(pipelineId, version),
    readLaunchDisclosure: (listingId) => bridge.studioDisclosure(listingId),
    readSamplePreview: (pipelineId, version) => bridge.studioPreview(pipelineId, version),
    listAppAttachments: () => bridge.studioApps(),
    selectForLaunch: (listingId) => bridge.studioLaunch(listingId),
  };
}
