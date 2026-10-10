import assert from "node:assert/strict";
import { test } from "node:test";
import { PlaybackController, type RenderTimelinePort } from "../src/contract.js";

// FIXTURE-GRADE timeline: a synthetic 12-tick football sequence (labeled per the evidence law).
const carry = {
  source: { swmId: "swm:football-fixture", snapshotHash: "ab".repeat(32), domain: "football" },
  provenance: {
    sourceKind: "authorized-source",
    sourceRef: "camera:fixture-1",
    capturedAt: "2026-10-10T12:00:00.000Z",
  },
  rightsScope: { holders: ["holder:b"], usages: ["render"], prohibitions: [] },
};

const longTimeline: RenderTimelinePort = {
  kind: "tactical",
  ...carry,
  events: Array.from({ length: 12 }, (_, index) => ({
    eventId: `event:e${index}`,
    atMs: index * 1000,
    payloadRefs: [`entity:p${index % 3}`],
  })),
};

function controller(capacity: number): PlaybackController {
  return new PlaybackController([longTimeline], {
    tickMs: 1000,
    frameBufferCapacity: capacity,
  });
}

test("the retained frame history is capacity-bounded with FIFO eviction (buffer law 1)", () => {
  const playback = controller(3);
  playback.play(1);
  const emitted = playback.advance(10_000);
  assert.equal(emitted.length, 10);
  const recent = playback.recentFrames();
  assert.equal(recent.length, 3);
  assert.deepEqual(
    recent.map((frame) => frame.tick),
    [8, 9, 10],
  );
});

test("recentFrames returns a frozen copy detached from the internal buffer", () => {
  const playback = controller(3);
  const snapshotOne = playback.recentFrames();
  playback.play(1);
  playback.advance(5000);
  const snapshotTwo = playback.recentFrames();
  assert.equal(snapshotOne.length, 1);
  assert.equal(snapshotTwo.length, 3);
  assert.ok(Object.isFrozen(snapshotTwo));
  assert.throws(() => {
    (snapshotTwo as unknown as unknown[]).push(snapshotTwo[0] as never);
  }, TypeError);
});

test("advance returns caller-owned transients even when the controller evicts (buffer law 2)", () => {
  const playback = controller(2);
  playback.play(1);
  const emitted = playback.advance(10_000);
  assert.equal(emitted.length, 10); // the batch is the caller's — never truncated by the buffer law
  assert.equal(playback.recentFrames().length, 2);
});

test("construction emits exactly the opening frame", () => {
  const playback = controller(64);
  const recent = playback.recentFrames();
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.tick, 0);
});

test("no unbounded accumulation: many seeks/steps never exceed the capacity (buffer law 3)", () => {
  const playback = controller(4);
  for (let round = 0; round < 50; round += 1) {
    playback.seek((round % 11) * 1000);
    playback.step(1);
    playback.step(-1);
  }
  assert.ok(playback.recentFrames().length <= 4);
  // the controller's entire retained state is the bounded buffer + playhead + rate
  const state = playback.state;
  assert.deepEqual(Object.keys(state).sort(), [
    "atEnd",
    "cursorTick",
    "defaultEventDurationMs",
    "durationMs",
    "frameBufferCapacity",
    "kinds",
    "playheadMs",
    "playing",
    "rate",
    "tickMs",
    "totalTicks",
  ]);
});

test("determinism holds after eviction: the same ops on a fresh controller retain the same tail", () => {
  const drive = (playback: PlaybackController) => {
    playback.play(1);
    playback.advance(9000);
    return playback.recentFrames().map((frame) => frame.tick);
  };
  assert.deepEqual(drive(controller(3)), drive(controller(3)));
});

test("a large single advance batch is the caller's choice; controller memory stays bounded", () => {
  const playback = controller(8);
  playback.play(4);
  const emitted = playback.advance(100_000);
  assert.equal(emitted.length, 11);
  assert.equal(playback.recentFrames().length, 8);
  assert.ok(playback.state.atEnd);
});
