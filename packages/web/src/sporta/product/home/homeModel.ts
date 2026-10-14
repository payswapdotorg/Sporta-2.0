/**
 * sporta-product Home view model (W11A-3, SPEC.md §5.2) — PURE
 * derivation, no React, no IO: everything Home shows is derived from the
 * EXISTING host port state (`SportaHostPort.readState` — the
 * state-owner law, SCREEN-PORTS.md home row) plus the optional
 * sample-run read from the EXISTING studio seam. Evidence grades flow
 * VERBATIM (UI-15): the host's "real"/"fixture" label and the studio's
 * "measured"/"fixture"/"declared" grade are never re-badged, never
 * inflated. Attention derivation is STAGE-STATE-driven only — never
 * string-parsing of seam detail text.
 */
import type { ProductLoopStage, ProductLoopStageKind } from "@sporta/product/contract";
import type { SportaHostState } from "../../hostPorts.js";
import type { StudioEvidenceGrade, StudioSamplePreviewView } from "../../studio/studioPorts.js";
import type { SportaScreenEvidenceGrade, SportaScreenRoute } from "../contract.js";

/** Severity order: blocked, refused, attention, info (render order follows). */
export type SportaHomeAttentionSeverity = "blocked" | "refused" | "attention" | "info";

/** One thing on the project that needs (or deserves) the user's eyes. */
export interface SportaHomeAttention {
  readonly id: string;
  readonly severity: SportaHomeAttentionSeverity;
  readonly title: string;
  /** The seam's own detail string, VERBATIM (null when the seam gave none). */
  readonly detail: string | null;
  /** The source stage — secondary technical label (UI-05), never the headline. */
  readonly stage: ProductLoopStageKind;
  /** An in-product next step when one genuinely exists. */
  readonly actionRoute?: SportaScreenRoute;
  readonly actionLabel?: string;
}

/** One of Home's task entrypoints (recorded feed / live source / resume). */
export interface SportaHomeStartAction {
  readonly id: "recorded-feed" | "live-source" | "resume-project";
  readonly title: string;
  readonly description: string;
  readonly target: SportaScreenRoute;
  readonly enabled: boolean;
  /** UI-06: the visible reason when disabled (null when enabled). */
  readonly disabledReason: string | null;
}

/** Per-state counts over the 12 product-loop stages (state-driven). */
export interface SportaHomeStageCounts {
  readonly total: number;
  readonly done: number;
  readonly active: number;
  readonly blocked: number;
  readonly refused: number;
  readonly pending: number;
}

/** The honest Home view model (see SPEC.md §5.2). */
export interface SportaHomeViewModel {
  /** The host's evidence label VERBATIM ("real" | "fixture" — UI-15). */
  readonly evidence: SportaScreenEvidenceGrade;
  readonly workGraphId: string;
  readonly stageCounts: SportaHomeStageCounts;
  /** e.g. "8 of 12 stages complete · in flight". */
  readonly projectSummary: string;
  readonly attention: readonly SportaHomeAttention[];
  readonly startActions: readonly SportaHomeStartAction[];
  /** The learning stage state (drives the consent decision card). */
  readonly learningStage: { state: ProductLoopStage["state"]; detail: string | null };
  /** The latest run card from the studio seam (null = not available). */
  readonly sampleRun: {
    readonly pipelineId: string;
    readonly version: string;
    readonly outputSummary: string;
    readonly semanticEvidence: string;
    /** The studio seam's grade VERBATIM (StudioEvidenceGrade, never re-badged). */
    readonly evidenceGrade: StudioEvidenceGrade;
  } | null;
  /** The raw trace — secondary expandable technical evidence (UI-05). */
  readonly trace: readonly ProductLoopStage[];
}

/** Friendly product names for the 12 stages (blocked/refused headlines). */
const FRIENDLY_STAGE: Record<ProductLoopStageKind, string> = {
  intent: "The project intent",
  organization: "The organization selection",
  execution: "The production run",
  progress: "Run progress",
  artifact: "The output artifact",
  takeover: "The takeover edit",
  editor: "The editor session",
  learning: "Learning",
  "capability-gap": "A capability gap",
  arena: "The Arena escalation",
  result: "The result",
  "organization-improvement": "The organization improvement",
};

/**
 * The learning-consent scopes the decision card offers — the intent's
 * declared learning scopes (LearningPolicyRef.scopes) with product
 * labels (SPEC.md §5.3). The write itself goes through the EXISTING
 * host port write path (submitConsent).
 */
export const SPORTA_HOME_CONSENT_SCOPES: readonly { id: string; label: string }[] = [
  { id: "preference", label: "My preferences" },
  { id: "workflow", label: "How I run workflows" },
  { id: "capability", label: "Capability choices" },
  { id: "organization-composition", label: "Organization composition" },
  { id: "knowledge", label: "Knowledge base" },
];

/** The honest note where a runs FEED would be (the seam is missing). */
export const SPORTA_HOME_RUNS_FEED_NOTE =
  "Run history isn't connected in this build — the Runs screen ships with full run history and evidence.";

function countStages(stages: readonly ProductLoopStage[]): SportaHomeStageCounts {
  const counts = { total: stages.length, done: 0, active: 0, blocked: 0, refused: 0, pending: 0 };
  for (const stage of stages) {
    if (stage.state === "done") counts.done += 1;
    else if (stage.state === "active") counts.active += 1;
    else if (stage.state === "blocked") counts.blocked += 1;
    else if (stage.state === "refused") counts.refused += 1;
    else counts.pending += 1;
  }
  return counts;
}

function projectSummaryOf(counts: SportaHomeStageCounts): string {
  const base = `${counts.done} of ${counts.total} stages complete`;
  const qualifier =
    counts.blocked > 0
      ? " · blocked"
      : counts.refused > 0
        ? " · needs review"
        : counts.active > 0
          ? " · in flight"
          : counts.pending > 0
            ? " · finishing"
            : " · complete";
  return base + qualifier;
}

/** Derive the attention list — stage-STATE-driven only (SPEC.md §5.2). */
function deriveAttention(stages: readonly ProductLoopStage[]): SportaHomeAttention[] {
  const items: SportaHomeAttention[] = [];
  const byKind = new Map(stages.map((stage) => [stage.stage, stage]));

  // Blocked / refused first (product language; details VERBATIM).
  for (const stage of stages) {
    if (stage.state === "blocked") {
      items.push({
        id: `${stage.stage}:blocked`,
        severity: "blocked",
        title: `${FRIENDLY_STAGE[stage.stage]} is blocked`,
        detail: stage.detail ?? null,
        stage: stage.stage,
      });
    } else if (stage.state === "refused") {
      items.push({
        id: `${stage.stage}:refused`,
        severity: "refused",
        title: `${FRIENDLY_STAGE[stage.stage]} was refused`,
        detail: stage.detail ?? null,
        stage: stage.stage,
      });
    }
  }

  // Actionable states next (state-driven; no detail-string parsing).
  const learning = byKind.get("learning");
  if (learning !== undefined && learning.state === "pending") {
    items.push({
      id: "learning:decision",
      severity: "attention",
      title: "Learning consent decision pending",
      detail: learning.detail ?? null,
      stage: "learning",
    });
  }
  const arena = byKind.get("arena");
  if (arena !== undefined && arena.state === "active") {
    items.push({
      id: "arena:in-flight",
      severity: "attention",
      title: "An escalation with the Arena is in flight",
      detail: arena.detail ?? null,
      stage: "arena",
      actionRoute: { screen: "runs" },
      actionLabel: "Open Runs",
    });
  }
  const result = byKind.get("result");
  if (result !== undefined && result.state === "active") {
    items.push({
      id: "result:validation",
      severity: "attention",
      title: "A result is awaiting validation",
      detail: result.detail ?? null,
      stage: "result",
      actionRoute: { screen: "runs" },
      actionLabel: "Open Runs",
    });
  }

  // Informational states last.
  const execution = byKind.get("execution");
  if (execution !== undefined && execution.state === "active") {
    items.push({
      id: "execution:in-flight",
      severity: "info",
      title: "A production run is in flight",
      detail: execution.detail ?? null,
      stage: "execution",
      actionRoute: { screen: "runs" },
      actionLabel: "Open Runs",
    });
  }
  if (result !== undefined && result.state === "done") {
    items.push({
      id: "result:ready",
      severity: "info",
      title: "A validated result is ready",
      detail: result.detail ?? null,
      stage: "result",
      actionRoute: { screen: "library" },
      actionLabel: "Open Library",
    });
  }
  const improvement = byKind.get("organization-improvement");
  if (improvement !== undefined && improvement.state === "active") {
    items.push({
      id: "organization-improvement:live",
      severity: "info",
      title: "An organization improvement candidate is live",
      detail: improvement.detail ?? null,
      stage: "organization-improvement",
    });
  }
  return items;
}

/** The three task entrypoints (UI-07) — live source honestly disabled (UI-06). */
function deriveStartActions(): SportaHomeStartAction[] {
  return [
    {
      id: "recorded-feed",
      title: "Start from a recorded feed",
      description: "Bring in a finished recording and run an approved pipeline on it.",
      target: { screen: "studio" },
      enabled: true,
      disabledReason: null,
    },
    {
      id: "live-source",
      title: "Start from a live source",
      description: "Capture or attach a live feed while the event is happening.",
      target: { screen: "studio" },
      enabled: false,
      disabledReason:
        "Live-source capture isn't wired into this build yet — recorded feeds are available now.",
    },
    {
      id: "resume-project",
      title: "Resume current project",
      description: "Pick up the current production project where it stands.",
      target: { screen: "studio" },
      enabled: true,
      disabledReason: null,
    },
  ];
}

/**
 * Derive the Home view model (PURE). `state` comes from the EXISTING
 * host port; `sampleRun` from the EXISTING studio seam (optional).
 */
export function deriveSportaHomeView(
  state: SportaHostState,
  sampleRun: StudioSamplePreviewView | null,
): SportaHomeViewModel {
  const counts = countStages(state.trace.stages);
  const learning = state.trace.stages.find((stage) => stage.stage === "learning");
  return {
    evidence: state.evidence, // VERBATIM ("real" | "fixture" — never re-badged)
    workGraphId: state.workGraphId,
    stageCounts: counts,
    projectSummary: projectSummaryOf(counts),
    attention: deriveAttention(state.trace.stages),
    startActions: deriveStartActions(),
    learningStage: {
      state: learning?.state ?? "pending",
      detail: learning?.detail ?? null,
    },
    sampleRun:
      sampleRun === null
        ? null
        : {
            pipelineId: sampleRun.pipelineId,
            version: sampleRun.version,
            outputSummary: sampleRun.outputSummary,
            semanticEvidence: sampleRun.semanticEvidence,
            evidenceGrade: sampleRun.evidenceGrade, // VERBATIM studio grade
          },
    trace: state.trace.stages,
  };
}
