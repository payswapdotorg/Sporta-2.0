/**
 * The workbench flow state (PURE — no react, no IO; W11B).
 *
 * The feed-to-output workflow the studio presents as ONE coherent
 * flow: source → pipeline → preview → launch → status/output. The
 * module owns the flow STATE and the stage derivation; the IO always
 * belongs to the host seams (the state-owner law) — this module never
 * fetches, validates or admits anything itself.
 *
 * Laws encoded here:
 * - a downstream selection resets when its upstream changes (changing
 *   the source invalidates the launch context; changing the pipeline
 *   invalidates preview + launch);
 * - the launch stage may only progress when a pipeline is selected
 *   (a disclosure without a pipeline is unrepresentable);
 * - locked stages carry an honest, user-language reason (never a raw
 *   stage id as the only explanation).
 */

/** The feed being worked (mirrors launchSelection.StudioFeedKind). */
export type WorkbenchFeedKind = "prerecorded" | "live";

/** The selected feed/source (identity + honest evidence line). */
export interface WorkbenchSourceState {
  readonly feedKind: WorkbenchFeedKind;
  /** The source reference (sample feed ref, or the live sourceId). */
  readonly sourceRef: string;
  /** Product label shown in the rail. */
  readonly label: string;
  /** The honest evidence line shown with the selection (verbatim). */
  readonly evidenceLine: string;
}

/** The five workbench stages, in flow order. */
export type WorkbenchStage = "source" | "pipeline" | "preview" | "launch" | "status";

export const WORKBENCH_STAGE_ORDER: readonly WorkbenchStage[] = [
  "source",
  "pipeline",
  "preview",
  "launch",
  "status",
];

/** Product labels for the stage rail (Sporta copy, never stage ids). */
export const WORKBENCH_STAGE_LABELS: Readonly<Record<WorkbenchStage, string>> = {
  source: "Source",
  pipeline: "Pipeline",
  preview: "Preview",
  launch: "Launch",
  status: "Status & output",
};

/** The launch half of the flow (the launchSelection machine's stages). */
export type WorkbenchLaunchStage =
  | "idle"
  | "disclosure"
  | "awaiting-confirmation"
  | "admitted"
  | "refused";

/** The whole flow state the workbench renders from. */
export interface WorkbenchFlowState {
  readonly source: WorkbenchSourceState | null;
  readonly listingId: string | null;
  /** Whether the selected pipeline has a sample preview (honest null-safe flag). */
  readonly hasPreview: boolean;
  readonly launchStage: WorkbenchLaunchStage;
}

/** The initial flow: nothing selected, launch idle. */
export function initialWorkbenchFlow(): WorkbenchFlowState {
  return { source: null, listingId: null, hasPreview: false, launchStage: "idle" };
}

/** Select the feed/source; downstream selections reset (new context). */
export function selectWorkbenchSource(
  state: WorkbenchFlowState,
  source: WorkbenchSourceState,
): WorkbenchFlowState {
  return { ...state, source, launchStage: "idle" };
}

/** Select/deselect the pipeline; preview + launch reset (new context). */
export function selectWorkbenchListing(
  state: WorkbenchFlowState,
  listingId: string | null,
): WorkbenchFlowState {
  return { ...state, listingId, hasPreview: false, launchStage: "idle" };
}

/** Record whether the selected pipeline carries a sample preview. */
export function markWorkbenchPreview(
  state: WorkbenchFlowState,
  hasPreview: boolean,
): WorkbenchFlowState {
  return state.listingId === null ? state : { ...state, hasPreview };
}

/**
 * Record the launch machine's stage. Only meaningful with a selected
 * pipeline; without one the state is unchanged (a disclosure without
 * a pipeline is unrepresentable).
 */
export function markWorkbenchLaunch(
  state: WorkbenchFlowState,
  launchStage: WorkbenchLaunchStage,
): WorkbenchFlowState {
  return state.listingId === null ? state : { ...state, launchStage };
}

/** One stage-rail row (the derived progress the UI renders). */
export interface WorkbenchStageRow {
  readonly stage: WorkbenchStage;
  readonly label: string;
  readonly state: "done" | "current" | "locked";
  /** For locked rows: the honest reason; for done rows: the selection summary. */
  readonly detail: string;
}

/** The furthest coherent stage of the current flow. */
export function workbenchCurrentStage(state: WorkbenchFlowState): WorkbenchStage {
  if (state.launchStage === "admitted" || state.launchStage === "refused") return "status";
  if (state.launchStage !== "idle") return "launch";
  if (state.listingId !== null) return state.hasPreview ? "preview" : "launch";
  if (state.source !== null) return "pipeline";
  return "source";
}

/**
 * Derive the stage rail: every stage before the current one is done,
 * the current one is current, the rest are locked with the honest
 * reason they are not reachable yet.
 */
export function workbenchProgress(state: WorkbenchFlowState): readonly WorkbenchStageRow[] {
  const current = workbenchCurrentStage(state);
  const currentIndex = WORKBENCH_STAGE_ORDER.indexOf(current);
  const sourceDetail =
    state.source === null
      ? "select a recorded or live feed"
      : `${state.source.label} (${state.source.feedKind})`;
  const pipelineDetail =
    state.listingId === null ? "select a published pipeline" : `selected ${state.listingId}`;
  const launchDetail =
    state.launchStage === "idle"
      ? "open the launch disclosure"
      : state.launchStage === "admitted"
        ? "admitted — pinned release"
        : state.launchStage === "refused"
          ? "refused by admission"
          : "disclosure shown";
  const details: Record<WorkbenchStage, string> = {
    source: sourceDetail,
    pipeline: pipelineDetail,
    preview: state.hasPreview ? "sample preview available" : "no sample preview for this pipeline",
    launch: launchDetail,
    status:
      state.launchStage === "admitted"
        ? "pinned release + outputs"
        : state.launchStage === "refused"
          ? "read the typed refusal"
          : "run the confirmation to see status",
  };
  return WORKBENCH_STAGE_ORDER.map((stage, index) => ({
    stage,
    label: WORKBENCH_STAGE_LABELS[stage],
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "locked",
    detail: details[stage],
  }));
}

/** Whether the launch stage is reachable (source + pipeline selected). */
export function workbenchLaunchReady(state: WorkbenchFlowState): boolean {
  return state.source !== null && state.listingId !== null;
}
