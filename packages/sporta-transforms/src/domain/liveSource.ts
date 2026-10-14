/**
 * W10-A — live-feed ingress at the REAL-local grade (TL Wave 0 freeze).
 *
 * Source of truth: docs/architecture/adr-p10-integration-reality.md
 * (product rules 13-16) and docs/testing/p10-acceptance.md (P10-01..P10-05).
 *
 * Honest-grade law (ADR rule 13): a live source labels what it actually is.
 * The exercisable real grade here is "real-local-live" — a real streaming
 * source over real localhost HTTP. It is never "production" and the type is
 * closed so it cannot say so.
 *
 * Bounded law (ADR rule 16): a descriptor declares its queue bound up front;
 * overflow is a typed refusal retaining partial evidence. Live runs never
 * block unboundedly and never drop frames silently.
 */
import type { SportaId, Iso8601 } from "@sporta/contracts/contract";

/** The honest grades a live source may carry. Closed vocabulary. */
export type LiveSourceGrade = "real-local-live" | "fixture";

/** Typed live-source declaration. Validated fail-closed before any IO. */
export interface LiveSourceDescriptor {
  /** Stable source identity within the declaring run/launch. */
  readonly sourceId: SportaId;
  /** Honest grade — what the source actually is. */
  readonly grade: LiveSourceGrade;
  /** Declared frame content kind (e.g. "application/jsonl"). */
  readonly contentKind: string;
  /** Target inter-frame cadence in ms (a declared bound, not a promise). */
  readonly cadenceMs: number;
  /** Maximum frames the bounded client queue may hold (back-pressure law). */
  readonly queueBound: number;
}

/** One consumed frame, in arrival order. */
export interface LiveFrame {
  /** Zero-based ordinal within the session (no gaps while healthy). */
  readonly index: number;
  /** The frame payload as received. */
  readonly payload: string;
  /** When the client accepted the frame. */
  readonly receivedAt: Iso8601;
}

/** Typed live-ingress refusals. Overflow retains partial evidence. */
export type LiveIngressRefusalKind =
  | "invalid-descriptor"
  | "queue-overflow"
  | "source-unavailable"
  | "aborted";

export interface LiveIngressRefusal {
  readonly kind: LiveIngressRefusalKind;
  readonly detail: string;
  /** Partial evidence: frames consumed before the refusal. */
  readonly framesConsumed: number;
}

/** Why a live session closed (or that it is still in flight). */
export type LiveCloseReason = "completed" | "aborted" | "refused" | "in-flight";

/** Pinned live-session evidence carried into the run manifest. */
export interface LiveSessionEvidence {
  readonly descriptor: LiveSourceDescriptor;
  readonly framesConsumed: number;
  readonly openedAt: Iso8601;
  readonly closedAt: Iso8601 | null;
  readonly closeReason: LiveCloseReason;
  readonly refusal: LiveIngressRefusal | null;
}

/** The live source port. Adapters own ALL IO; the domain stays pure. */
export interface LiveSourcePort {
  /** Opens a session. Invalid descriptors refuse typed before any IO. */
  open(
    descriptor: LiveSourceDescriptor
  ): Promise<{ handle: LiveSessionHandle } | { refusal: LiveIngressRefusal }>;
}

/** A bounded live session. next() never blocks unboundedly (ADR rule 16). */
export interface LiveSessionHandle {
  /** Next frame, or a typed refusal with done. */
  next(): Promise<
    | { frame: LiveFrame }
    | { refusal: LiveIngressRefusal; done: true }
  >;
  /** Closes and returns the pinned evidence with the close reason. */
  close(reason: "completed" | "aborted"): Promise<LiveSessionEvidence>;
  /** Current evidence snapshot. */
  evidence(): LiveSessionEvidence;
}

/** Fail-closed descriptor validation (runs before any adapter IO). */
export function validateLiveSourceDescriptor(
  descriptor: LiveSourceDescriptor
): { ok: true } | { ok: false; refusal: LiveIngressRefusal } {
  const refuse = (detail: string): { ok: false; refusal: LiveIngressRefusal } => ({
    ok: false,
    refusal: { kind: "invalid-descriptor", detail, framesConsumed: 0 },
  });
  if (typeof descriptor.sourceId !== "string" || descriptor.sourceId.length === 0) {
    return refuse("sourceId must be a non-empty string");
  }
  if (descriptor.grade !== "real-local-live" && descriptor.grade !== "fixture") {
    return refuse(`grade must be "real-local-live" or "fixture" (closed vocabulary)`);
  }
  if (typeof descriptor.contentKind !== "string" || descriptor.contentKind.length === 0) {
    return refuse("contentKind must be a non-empty string");
  }
  if (!Number.isFinite(descriptor.cadenceMs) || descriptor.cadenceMs <= 0) {
    return refuse("cadenceMs must be a positive finite number");
  }
  if (!Number.isInteger(descriptor.queueBound) || descriptor.queueBound <= 0) {
    return refuse("queueBound must be a positive integer (back-pressure law)");
  }
  return { ok: true };
}
