import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PlaybackController,
  frameAtTick,
  resolvePlaybackOptions,
  buildPlaybackTimelineIndex,
  type PlaybackFrame,
  type PlaybackProvenanceSummary,
  type PlaybackRightsScopeSummary,
  type PlaybackSourceSummary,
  type RenderTimelinePort,
} from "../src/contract.js";

// FIXTURE-GRADE timelines: synthetic football events (labeled per the evidence law).
const source: PlaybackSourceSummary = {
  swmId: "swm:football-fixture",
  snapshotHash: "ab".repeat(32),
  domain: "football",
};
const provenance: PlaybackProvenanceSummary = {
  sourceKind: "authorized-source",
  sourceRef: "camera:fixture-1",
  capturedAt: "2026-10-10T12:00:00.000Z",
  confidence: 0.9,
};
const rightsScope: PlaybackRightsScopeSummary = {
  holders: ["holder:b"],
  usages: ["render", "replay"],
  prohibitions: ["ml-training"],
};

const tactical: RenderTimelinePort = {
  kind: "tactical",
  source,
  provenance,
  rightsScope,
  events: [
    { eventId: "event:kickoff", atMs: 0, payloadRefs: ["entity:ball", "entity:p1"] },
    {
      eventId: "event:pass-3",
      atMs: 1500,
      durationMs: 2000,
      payloadRefs: ["entity:p7", "entity:p10", "entity:p7"],
    },
    { eventId: "event:shot-4", atMs: 5000, payloadRefs: ["entity:p10"] },
  ],
};
const playByPlay: RenderTimelinePort = {
  kind: "play-by-play",
  source,
  provenance,
  rightsScope,
  events: [
    { eventId: "event:kickoff", atMs: 0, payloadRefs: ["event:kickoff"] },
    { eventId: "event:pass-3", atMs: 1500, durationMs: 2000 },
    { eventId: "event:shot-4", atMs: 5000 },
  ],
};

function controller(): PlaybackController {
  return new PlaybackController([tactical, playByPlay], { tickMs: 1000 });
}

test("a frame carries one record per declared reality kind, in declaration order", () => {
  const frame = controller().frameAt(1500);
  assert.deepEqual(
    frame.realities.map((reality) => reality.kind),
    ["tactical", "play-by-play"],
  );
});

test("the tactical frame is a board delta: sorted-unique event ids + affected entities, no geometry", () => {
  const frame = controller().frameAt(1500);
  const tacticalFrame = frame.realities[0];
  assert.ok(tacticalFrame && tacticalFrame.kind === "tactical");
  assert.deepEqual([...tacticalFrame.delta.eventIds], ["event:pass-3"]);
  // payload refs projected sorted-unique (duplicates in the declaration collapse)
  assert.deepEqual([...tacticalFrame.delta.affectedEntities], ["entity:p10", "entity:p7"]);
  // zero geometry invention: the delta has exactly the two declared fields
  assert.deepEqual(Object.keys(tacticalFrame.delta).sort(), ["affectedEntities", "eventIds"]);
});

test("the play-by-play frame is narrative SEGMENTS: event anchors with declared sequence, zero phrasing", () => {
  const frame = controller().frameAt(1500);
  const narrative = frame.realities[1];
  assert.ok(narrative && narrative.kind === "play-by-play");
  assert.deepEqual(
    narrative.segments.map((segment) => ({ id: segment.eventId, sequence: segment.sequence })),
    [{ id: "event:pass-3", sequence: 1 }],
  );
  // segments carry ONLY anchors (id + sequence + refs) — phrasing is the render model's concern
  for (const segment of narrative.segments) {
    assert.deepEqual(Object.keys(segment).sort(), ["eventId", "payloadRefs", "sequence"]);
  }
});

test("an empty tick projects honest empties (never invented events)", () => {
  const frame = controller().frameAt(4000);
  assert.deepEqual([...frame.activeEvents], []);
  const tacticalFrame = frame.realities[0];
  assert.ok(tacticalFrame && tacticalFrame.kind === "tactical");
  assert.deepEqual([...tacticalFrame.delta.eventIds], []);
  assert.deepEqual([...tacticalFrame.delta.affectedEntities], []);
  const narrative = frame.realities[1];
  assert.ok(narrative && narrative.kind === "play-by-play");
  assert.deepEqual([...narrative.segments], []);
});

test("zero invention: every frame event id is a declared timeline event id", () => {
  const playback = controller();
  const declared = new Set(
    [...tactical.events, ...playByPlay.events].map((event) => `${event.eventId}`),
  );
  for (let tick = 0; tick < 6; tick += 1) {
    const frame = playback.frameAt(tick * 1000);
    for (const active of frame.activeEvents) {
      assert.ok(declared.has(active.eventId), `tick ${tick}: ${active.eventId} is not declared`);
    }
  }
});

test("the same underlying event appears in BOTH realities at the same tick (one snapshot, two realities)", () => {
  const frame = controller().frameAt(1500);
  const tacticalFrame = frame.realities[0];
  const narrative = frame.realities[1];
  assert.ok(tacticalFrame && tacticalFrame.kind === "tactical");
  assert.ok(narrative && narrative.kind === "play-by-play");
  assert.ok(tacticalFrame.delta.eventIds.includes("event:pass-3"));
  assert.ok(narrative.segments.some((segment) => segment.eventId === "event:pass-3"));
});

test("activeEvents are kind-tagged, in canonical order, with declared times and durations", () => {
  const frame = controller().frameAt(0);
  assert.deepEqual(
    frame.activeEvents.map((event) => `${event.kind}:${event.eventId}`),
    ["tactical:event:kickoff", "play-by-play:event:kickoff"],
  );
  assert.equal(frame.activeEvents[0]?.atMs, 0);
  assert.equal(frame.activeEvents[0]?.durationMs, 1000);
});

test("every frame carries the carry-forward header verbatim (source, provenance, rights — read-only)", () => {
  const playback = controller();
  for (let tick = 0; tick < 6; tick += 1) {
    const frame: PlaybackFrame = playback.frameAt(tick * 1000);
    assert.deepEqual(frame.source, source);
    assert.deepEqual(frame.provenance, provenance);
    assert.deepEqual(frame.rightsScope, rightsScope);
  }
});

test("frames are deeply frozen (the read-only law is machine-checked)", () => {
  const frame = controller().frameAt(1500);
  assert.ok(Object.isFrozen(frame));
  assert.ok(Object.isFrozen(frame.activeEvents));
  assert.ok(Object.isFrozen(frame.activeEvents[0]?.payloadRefs));
  assert.ok(Object.isFrozen(frame.realities));
  assert.ok(Object.isFrozen(frame.realities[0]));
  const tacticalFrame = frame.realities[0];
  if (tacticalFrame && tacticalFrame.kind === "tactical") {
    assert.ok(Object.isFrozen(tacticalFrame.delta));
    assert.ok(Object.isFrozen(tacticalFrame.delta.affectedEntities));
  }
  assert.ok(Object.isFrozen(frame.rightsScope.holders));
  assert.throws(() => {
    (frame as { tick: number }).tick = 99;
  }, TypeError);
});

test("frameAtTick (pure pipeline) is deterministic + idempotent per tick", () => {
  const index = buildPlaybackTimelineIndex(
    [tactical, playByPlay],
    resolvePlaybackOptions({ tickMs: 1000 }),
  );
  assert.deepEqual(frameAtTick(index, 2), frameAtTick(index, 2));
  assert.deepEqual(
    frameAtTick(index, 2),
    frameAtTick(
      buildPlaybackTimelineIndex([tactical, playByPlay], resolvePlaybackOptions({ tickMs: 1000 })),
      2,
    ),
  );
});

test("segments are ordered by the timeline's declared sequence, not by merged time order", () => {
  const outOfOrder: RenderTimelinePort = {
    kind: "play-by-play",
    source,
    provenance,
    rightsScope,
    events: [
      { eventId: "event:late", atMs: 2500, durationMs: 1000 }, // sequence 0
      { eventId: "event:early", atMs: 2000, durationMs: 2000 }, // sequence 1
    ],
  };
  const playback = new PlaybackController([outOfOrder], { tickMs: 1000 });
  const frame = playback.frameAt(2500);
  const narrative = frame.realities[0];
  assert.ok(narrative && narrative.kind === "play-by-play");
  assert.deepEqual(
    narrative.segments.map((segment) => segment.eventId),
    ["event:late", "event:early"],
  );
});
