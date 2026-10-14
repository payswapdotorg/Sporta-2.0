/**
 * Runs screen ports (W11C — SCREEN-PORTS.md: "run manifests + per-step
 * evidence + typed refusals: `TransformRunManifest` records + the run
 * service reads | `@sporta/transforms/contract`").
 *
 * TYPE-ONLY module. The shapes are STRUCTURAL MIRRORS of the frozen
 * `TransformRunManifest` / `TransformStepResult` / `LiveSessionEvidence`
 * records (the marketplaceViews.ts mirror precedent) so the REAL run
 * service's records satisfy them without this lane importing run-service
 * implementation modules. Compat is proven in the node battery by
 * projecting REAL run records (deterministic + live) through the views.
 *
 * State-owner law: the lane owns NO run store and no run authority; the
 * port is satisfied by a labeled fixture host for the browser demo and
 * by REAL service records in the node battery. A run-history read seam
 * on the composition is NEXT DEPENDENCIES.
 */
import type { ScreenBacking } from "../marketplace/marketplaceScreenPorts.js";

/** Record-level grade vocabulary (verbatim from the transforms seam). */
export type RunRecordGrade = "measured" | "fixture" | "declared";

/** One run input as pinned on the manifest. */
export interface RunInputRef {
  artifactRef: string;
  rightsSnapshot: string;
}

/** One step result (structural mirror of TransformStepResult). */
export interface RunStepShape {
  nodeId: string;
  status: "succeeded" | "typed-failure" | "fallback-used" | "cancelled";
  timingMs: number;
  resourceUse: { cpuMs: number; memoryMiB: number; outputBytes: number };
  cost: { amount: number; currency: string } | null;
  detail: string;
  provenance: {
    sourceKind: string;
    sourceRef: string;
    capturedAt: string;
    confidence?: number;
  } | null;
}

/** Pinned live-session evidence (structural mirror, W10-A shapes). */
export interface RunLiveSessionShape {
  descriptor: {
    sourceId: string;
    grade: "real-local-live" | "fixture";
    contentKind: string;
    cadenceMs: number;
    queueBound: number;
  };
  framesConsumed: number;
  openedAt: string;
  closedAt: string | null;
  closeReason: "completed" | "aborted" | "refused" | "in-flight";
  refusal: { kind: string; detail: string; framesConsumed: number } | null;
}

/** One run record (structural mirror of TransformRunManifest). */
export interface RunRecordShape {
  runManifestId: string;
  workGraph: { workGraphId: string; runRef: string };
  release: { pipelineId: string; version: string; releaseDigest: string };
  componentDigests: readonly { nodeId: string; digest: string }[];
  configHash: string;
  inputs: readonly RunInputRef[];
  grantedApplicationCapabilities: readonly string[];
  steps: readonly RunStepShape[];
  outputs: readonly { artifactRevisionId: string; semanticEvidence: string }[];
  semanticFidelity: { grade: RunRecordGrade; note: string };
  startedAt: string;
  finishedAt: string;
  retention: string;
  /** Live-session evidence where present (real-local-live is rendered verbatim). */
  liveSessions?: readonly RunLiveSessionShape[];
}

/**
 * The runs screen port (screen id "runs"). A run-history read seam on
 * the composition does not exist at this SHA — the adapter surfaces the
 * typed refusal; the fixture host carries demo records; the node
 * battery projects REAL service records through the same views.
 */
export interface RunsScreenPort {
  readonly backing: ScreenBacking;
  /** Run summaries (honest states; refused/failed runs stay visible). */
  listRuns(): Promise<readonly RunRecordShape[]>;
  /** Full record for one run (typed errors propagate verbatim). */
  readRun(runManifestId: string): Promise<RunRecordShape>;
}
