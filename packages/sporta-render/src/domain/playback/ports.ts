/**
 * The playback input ports (domain layer — pure, no IO).
 *
 * These declarations are the playback seam against the render-model
 * timeline SHAPE (ADR wave-5, decision 3): the integration-time
 * composition (TL work) wires the real render models into this port.
 * Per the per-package duplication law the shapes are declared HERE,
 * not imported from a sibling surface — the package has ZERO
 * dependencies and playback never consumes the SWM directly (the
 * adapter invariant holds at playback). A source-scan test
 * machine-checks this law.
 */

/** The reality kinds playback projects frames for (v1 closed vocabulary; additive extension law). */
export type PlaybackRealityKind = "tactical" | "play-by-play";

/** Read-only source summary carried forward from the render model (snapshot traceability). */
export interface PlaybackSourceSummary {
  readonly swmId: string;
  readonly snapshotHash: string;
  readonly domain: string;
}

/** Read-only provenance summary carried forward verbatim (never widened). */
export interface PlaybackProvenanceSummary {
  readonly sourceKind: string;
  readonly sourceRef: string;
  readonly capturedAt: string;
  readonly confidence?: number;
}

/** Read-only rights-scope summary carried forward verbatim (never widened). */
export interface PlaybackRightsScopeSummary {
  readonly holders: readonly string[];
  readonly usages: readonly string[];
  readonly prohibitions: readonly string[];
}

/** One event on a render-model timeline (the shape render models expose). */
export interface RenderTimelineEvent {
  /** Stable event id as declared by the render model. */
  readonly eventId: string;
  /** Timestamp in milliseconds since the timeline anchor (finite, >= 0). */
  readonly atMs: number;
  /** Declared duration in milliseconds (finite, > 0); defaults to defaultEventDurationMs. */
  readonly durationMs?: number;
  /** Payload refs the event anchors (carried verbatim; projected sorted-unique in frames). */
  readonly payloadRefs?: readonly string[];
}

/** A kind-tagged render-model timeline: the ONLY input playback consumes. */
export interface RenderTimelinePort {
  /** The reality kind this timeline projects. */
  readonly kind: PlaybackRealityKind;
  /** Snapshot traceability carried read-only from the render model. */
  readonly source: PlaybackSourceSummary;
  /** Provenance carried read-only (verbatim; never widened). */
  readonly provenance: PlaybackProvenanceSummary;
  /** Rights-scope carried read-only (verbatim; never widened). */
  readonly rightsScope: PlaybackRightsScopeSummary;
  /** The timeline's events in the record's own declared order. */
  readonly events: readonly RenderTimelineEvent[];
}

/** Playback controller options (all optional; see SPEC "Controller semantics"). */
export interface PlaybackControllerOptions {
  /** Tick resolution in milliseconds (finite, > 0). Default 1000. */
  readonly tickMs?: number;
  /** Retained frame buffer capacity (integer > 0). Default 64. */
  readonly frameBufferCapacity?: number;
  /** Event duration when an event declares none (finite, > 0). Default = tickMs. */
  readonly defaultEventDurationMs?: number;
}

/** Default tick resolution in milliseconds. */
export const DEFAULT_TICK_MS = 1000;

/** Default retained-frame capacity (the bounded-buffer law). */
export const DEFAULT_FRAME_BUFFER_CAPACITY = 64;
