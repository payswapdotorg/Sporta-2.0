/**
 * Runs screen view-models (W11C — PURE, no react, no IO). Projections
 * of the TransformRunManifest mirror shapes into the runs list/detail
 * views. Evidence grades render the record's own grade verbatim (UI-15);
 * typed failures are typed, never softened; audit references surface as
 * the record carries them.
 */
import type { RunLiveSessionShape, RunRecordShape, RunStepShape } from "./runsScreenPorts.js";

/** The run state class the screen shows (honest, from the record only). */
export type RunStateClass =
  | "succeeded"
  | "typed-failure"
  | "fallback-used"
  | "cancelled"
  | "in-flight"
  | "empty";

/**
 * Classify the run's state from its steps (pure). A run with no steps
 * and an unfinished record is honestly in-flight; nothing is inferred
 * beyond the record.
 */
export function runStateClass(run: RunRecordShape): RunStateClass {
  if (run.steps.length === 0) {
    return run.finishedAt === "" ? "in-flight" : "empty";
  }
  if (run.steps.every((step) => step.status === "succeeded")) return "succeeded";
  if (run.steps.some((step) => step.status === "typed-failure")) return "typed-failure";
  if (run.steps.some((step) => step.status === "fallback-used")) return "fallback-used";
  if (run.steps.some((step) => step.status === "cancelled")) return "cancelled";
  return "empty";
}

/** The product-language state label (do not lean on color alone). */
export function runStateLabel(state: RunStateClass): string {
  switch (state) {
    case "succeeded":
      return "Finished — succeeded";
    case "typed-failure":
      return "Finished — typed failure";
    case "fallback-used":
      return "Finished — fallback used";
    case "cancelled":
      return "Cancelled";
    case "in-flight":
      return "In flight";
    case "empty":
      return "No step records";
  }
}

/** One list-row projection. */
export interface RunRowView {
  runManifestId: string;
  pipelineId: string;
  version: string;
  workGraphId: string;
  runRef: string;
  startedAt: string;
  finishedAt: string;
  stateClass: RunStateClass;
  stateLabel: string;
  outputsCount: number;
  liveSessionsCount: number;
}

/** Project a run into its list row (pure). */
export function runRow(run: RunRecordShape): RunRowView {
  const state = runStateClass(run);
  return {
    runManifestId: run.runManifestId,
    pipelineId: run.release.pipelineId,
    version: run.release.version,
    workGraphId: run.workGraph.workGraphId,
    runRef: run.workGraph.runRef,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    stateClass: state,
    stateLabel: runStateLabel(state),
    outputsCount: run.outputs.length,
    liveSessionsCount: run.liveSessions?.length ?? 0,
  };
}

/** The step-status label (typed statuses verbatim, plus a readable form). */
export function stepStatusLabel(status: RunStepShape["status"]): string {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "typed-failure":
      return "typed failure";
    case "fallback-used":
      return "fallback used";
    case "cancelled":
      return "cancelled";
  }
}

/** Cost line for a step (null cost is explicit). */
export function stepCostLine(step: RunStepShape): string {
  return step.cost === null ? "no cost recorded" : `${step.cost.amount} ${step.cost.currency}`;
}

/** Resource line for a step (the bounded-envelope facts). */
export function stepResourceLine(step: RunStepShape): string {
  return `${step.timingMs}ms · cpu ${step.resourceUse.cpuMs}ms · mem ${step.resourceUse.memoryMiB}MiB · out ${step.resourceUse.outputBytes}B`;
}

/** The live-session evidence line — the record's grade VERBATIM (UI-15). */
export function liveSessionLine(session: RunLiveSessionShape): string {
  const closed =
    session.closedAt === null ? "not closed" : `closed (${session.closeReason}) at ${session.closedAt}`;
  const refusal =
    session.refusal === null
      ? "no refusal"
      : `refused ${session.refusal.kind} after ${session.refusal.framesConsumed} frame(s): ${session.refusal.detail}`;
  return (
    `live session ${session.descriptor.sourceId} — grade ${session.descriptor.grade} · ` +
    `${session.framesConsumed} frame(s) · ${closed} · ${refusal}`
  );
}

/** Audit/workgraph reference lines for the detail view. */
export function runAuditLines(run: RunRecordShape): readonly { label: string; value: string }[] {
  return [
    { label: "Work graph", value: `${run.workGraph.workGraphId} · run ${run.workGraph.runRef}` },
    { label: "Release digest", value: run.release.releaseDigest.slice(0, 19) + "…" },
    { label: "Config hash", value: run.configHash.slice(0, 19) + "…" },
    {
      label: "Component digests",
      value: run.componentDigests.map((c) => `${c.nodeId}=${c.digest.slice(0, 13)}…`).join(", ") || "none",
    },
    {
      label: "Inputs",
      value: run.inputs.map((i) => `${i.artifactRef} (rights: ${i.rightsSnapshot})`).join("; ") || "none",
    },
    {
      label: "Granted app capabilities",
      value: run.grantedApplicationCapabilities.join(", ") || "none",
    },
    { label: "Retention", value: run.retention },
    {
      label: "Semantic fidelity",
      value: `${run.semanticFidelity.grade} — ${run.semanticFidelity.note}`,
    },
    ...run.outputs.map((output, index) => ({
      label: `Output ${index + 1}`,
      value: `${output.artifactRevisionId} — ${output.semanticEvidence}`,
    })),
  ];
}

/** Disabled-action reasons (every visible action honest; work-order law). */
export const RUNS_DISABLED_REASONS = {
  cancel:
    "Cancel is disabled: run control (cancel/checkpoint) lives behind the WorkGraph run service write path, which the screen read model does not expose. Recorded in NEXT DEPENDENCIES.",
  retry:
    "Retry is disabled: starting a run requires the feed-launch admission path (Studio) plus a run-start seam on the composition; the screen read model does not expose it. Recorded in NEXT DEPENDENCIES.",
} as const;
