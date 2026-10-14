/**
 * Live-source evidence display mapping (PURE — no react, no IO; W11B).
 *
 * Projects the W10 live lanes (`LiveSourceDescriptor` /
 * `LiveSessionEvidence` / `LiveIngressRefusal` shapes — see the
 * structural mirrors in studioPorts.ts) into the display rows the
 * workbench source rail shows. THE VERBATIM LAW: the exact grade
 * string (`real-local-live` / `fixture`), the frame statistics, the
 * close reason, and the typed refusal (kind + detail + frames
 * consumed) flow through UNCHANGED — never paraphrased into a
 * different vocabulary, never softened, "production" unutterable.
 *
 * Compat with the frozen @sporta/transforms W10 types is structural
 * (the studio-lane law: no @sporta/* runtime import in render
 * modules); it is proven by the battery tests feeding REAL
 * `LiveTransformRunService` evidence through `liveSourceFromEvidence`.
 */
import type { StudioLiveSourceView } from "./studioPorts.js";

/** The descriptor shape (structural mirror of LiveSourceDescriptor). */
export interface StudioLiveDescriptorShape {
  readonly sourceId: string;
  readonly grade: "real-local-live" | "fixture";
  readonly contentKind: string;
  readonly cadenceMs: number;
  readonly queueBound: number;
}

/**
 * The session shape (the W10 LiveSessionEvidence MINUS the descriptor,
 * which the view hoists to the top level so it shows even when no
 * session has opened yet).
 */
export interface StudioLiveSessionShape {
  readonly framesConsumed: number;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly closeReason: "completed" | "aborted" | "refused" | "in-flight";
  readonly refusal: {
    readonly kind: string;
    readonly detail: string;
    readonly framesConsumed: number;
  } | null;
}

/**
 * Adapter from the REAL W10 session evidence (a
 * `LiveSessionEvidence`-shaped record — descriptor included, exactly
 * as `LiveTransformRunService` pins it) into the view shape. Every
 * field copies VERBATIM; nothing is re-classified.
 */
export function liveSourceFromEvidence(evidence: {
  descriptor: StudioLiveDescriptorShape;
  framesConsumed: number;
  openedAt: string;
  closedAt: string | null;
  closeReason: StudioLiveSessionShape["closeReason"];
  refusal: StudioLiveSessionShape["refusal"];
}): StudioLiveSourceView {
  return {
    descriptor: { ...evidence.descriptor },
    session: {
      framesConsumed: evidence.framesConsumed,
      openedAt: evidence.openedAt,
      closedAt: evidence.closedAt,
      closeReason: evidence.closeReason,
      refusal:
        evidence.refusal === null
          ? null
          : { kind: evidence.refusal.kind, detail: evidence.refusal.detail, framesConsumed: evidence.refusal.framesConsumed },
    },
  };
}

/**
 * The grade badge: the text IS the grade string (verbatim), the tone
 * only drives color/weight (state never rides on color alone — the
 * string itself is always shown).
 */
export function liveGradeBadge(grade: StudioLiveDescriptorShape["grade"]): {
  text: string;
  tone: "real" | "fixture";
} {
  return { text: grade, tone: grade === "real-local-live" ? "real" : "fixture" };
}

/** One display row (label + verbatim value) in the session evidence list. */
export interface LiveEvidenceRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Project one pinned session into display rows — every value is the
 * record's own field stringified, nothing re-classified.
 */
export function liveSessionRows(
  descriptor: StudioLiveDescriptorShape,
  session: StudioLiveSessionShape,
): readonly LiveEvidenceRow[] {
  return [
    { label: "Session", value: descriptor.sourceId },
    { label: "Grade", value: liveGradeBadge(descriptor.grade).text },
    { label: "Content", value: descriptor.contentKind },
    { label: "Frames consumed", value: String(session.framesConsumed) },
    { label: "Opened", value: session.openedAt },
    { label: "Closed", value: session.closedAt === null ? "not closed yet" : session.closedAt },
    { label: "Close reason", value: session.closeReason },
    {
      label: "Cadence / queue bound",
      value: `${String(descriptor.cadenceMs)}ms / ${String(descriptor.queueBound)} frames`,
    },
  ];
}

/**
 * The refusal line, verbatim: kind, detail, and the partial-evidence
 * frame count (a refusal retains what was consumed — never hidden).
 */
export function liveRefusalLine(refusal: NonNullable<StudioLiveSessionShape["refusal"]>): string {
  return `${refusal.kind} — ${refusal.detail} (frames consumed before refusal: ${String(refusal.framesConsumed)})`;
}

/**
 * Project a full live-source view (descriptor + optional session) into
 * the rows the rail renders. Without a session the descriptor still
 * shows (a declared source is visible; its absence of session is
 * stated, never fabricated).
 */
export function liveSourceRows(view: StudioLiveSourceView): readonly LiveEvidenceRow[] {
  if (view.session === null) {
    return [
      { label: "Source", value: view.descriptor.sourceId },
      { label: "Grade", value: liveGradeBadge(view.descriptor.grade).text },
      { label: "Content", value: view.descriptor.contentKind },
      {
        label: "Cadence / queue bound",
        value: `${String(view.descriptor.cadenceMs)}ms / ${String(view.descriptor.queueBound)} frames`,
      },
      { label: "Session", value: "no session evidence yet" },
    ];
  }
  return liveSessionRows(view.descriptor, view.session);
}

/** Whether the live session closed cleanly (drives the status tone). */
export function liveSessionHealthy(session: StudioLiveSessionShape): boolean {
  return session.closeReason === "completed" && session.refusal === null;
}
