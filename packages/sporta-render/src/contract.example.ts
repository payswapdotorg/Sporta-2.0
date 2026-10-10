import {
  PlaybackController,
  type PlaybackFrame,
  type PlaybackState,
  type RenderTimelinePort,
} from "./contract.js";

/**
 * FIXTURE-GRADE example timelines (labeled per the evidence law):
 * synthetic football events with synthetic ids/hashes — honest about
 * being fixtures, not production evidence. The shape they satisfy is
 * the render-model timeline port (the integration-time composition
 * wires the REAL render models into it).
 */
const fixtureCarry = {
  source: {
    swmId: "swm:football-fixture",
    snapshotHash: "ab" + "00".repeat(30),
    domain: "football",
  },
  provenance: {
    sourceKind: "authorized-source",
    sourceRef: "camera:fixture-1",
    capturedAt: "2026-10-10T12:00:00.000Z",
    confidence: 0.9,
  },
  rightsScope: {
    holders: ["holder:fixture-broadcaster"],
    usages: ["render"],
    prohibitions: ["ml-training"],
  },
} as const;

/** The tactical reality's fixture timeline (fixture-grade). */
export const exampleTacticalTimeline: RenderTimelinePort = {
  kind: "tactical",
  ...fixtureCarry,
  events: [
    { eventId: "event:kickoff", atMs: 0, payloadRefs: ["entity:ball"] },
    {
      eventId: "event:pass-3",
      atMs: 1500,
      durationMs: 2000,
      payloadRefs: ["entity:player-7", "entity:player-10"],
    },
    { eventId: "event:shot-4", atMs: 5000, payloadRefs: ["entity:player-10"] },
  ],
};

/** The play-by-play reality's fixture timeline (same events, same carry — one snapshot). */
export const examplePlayByPlayTimeline: RenderTimelinePort = {
  kind: "play-by-play",
  ...fixtureCarry,
  events: [
    { eventId: "event:kickoff", atMs: 0 },
    { eventId: "event:pass-3", atMs: 1500, durationMs: 2000 },
    { eventId: "event:shot-4", atMs: 5000 },
  ],
};

/** Example controller options (1 s ticks; a small retained history). */
export const examplePlaybackOptions = {
  tickMs: 1000,
  frameBufferCapacity: 8,
} as const;

/**
 * A headless composition-root example (runs for real — pure functions,
 * no host): both realities' fixture timelines driven through one
 * controller — seek into the pass, play at 2x, advance, step back.
 */
export function examplePlaybackSession(): {
  seekFrame: PlaybackFrame;
  playedFrames: readonly PlaybackFrame[];
  steppedBackFrame: PlaybackFrame;
  state: PlaybackState;
  recentFrames: readonly PlaybackFrame[];
} {
  const controller = new PlaybackController(
    [exampleTacticalTimeline, examplePlayByPlayTimeline],
    examplePlaybackOptions,
  );
  const seekFrame = controller.seek(1500);
  controller.play(2);
  const playedFrames = controller.advance(2000);
  const steppedBackFrame = controller.step(-1);
  return {
    seekFrame,
    playedFrames,
    steppedBackFrame,
    state: controller.state,
    recentFrames: controller.recentFrames(),
  };
}
