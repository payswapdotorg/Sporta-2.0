import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidAdvanceError,
  InvalidRateError,
  InvalidStepError,
  OutOfRangeSeekError,
  OutOfRangeStepError,
  PlaybackController,
  PlaybackPausedError,
  type RenderTimelinePort,
} from "../src/contract.js";

// FIXTURE-GRADE timelines: synthetic football events (labeled per the evidence law).
const carry = {
  source: { swmId: "swm:football-fixture", snapshotHash: "ab".repeat(32), domain: "football" },
  provenance: {
    sourceKind: "authorized-source",
    sourceRef: "camera:fixture-1",
    capturedAt: "2026-10-10T12:00:00.000Z",
  },
  rightsScope: { holders: ["holder:b"], usages: ["render"], prohibitions: [] },
};

function timelines(): readonly RenderTimelinePort[] {
  return [
    {
      kind: "tactical",
      ...carry,
      events: [
        { eventId: "event:kickoff", atMs: 0, payloadRefs: ["entity:ball"] },
        { eventId: "event:pass-3", atMs: 1500, durationMs: 2000, payloadRefs: ["entity:p7"] },
        { eventId: "event:shot-4", atMs: 5000, payloadRefs: ["entity:p10"] },
      ],
    },
    {
      kind: "play-by-play",
      ...carry,
      events: [
        { eventId: "event:kickoff", atMs: 0 },
        { eventId: "event:pass-3", atMs: 1500, durationMs: 2000 },
        { eventId: "event:shot-4", atMs: 5000 },
      ],
    },
  ];
}

// duration = max end = 5000 + default duration 1000 = 6000 -> 6 ticks (0..5)
function controller(options?: {
  tickMs?: number;
  frameBufferCapacity?: number;
}): PlaybackController {
  return new PlaybackController(timelines(), {
    tickMs: options?.tickMs ?? 1000,
    frameBufferCapacity: options?.frameBufferCapacity,
  });
}

test("construction: playhead 0, opening frame (tick 0) buffered, paused, not at end", () => {
  const playback = controller();
  const state = playback.state;
  assert.equal(state.playheadMs, 0);
  assert.equal(state.cursorTick, 0);
  assert.equal(state.playing, false);
  assert.equal(state.atEnd, false);
  assert.equal(state.totalTicks, 6);
  assert.equal(state.durationMs, 6000);
  assert.deepEqual([...state.kinds], ["tactical", "play-by-play"]);
  const recent = playback.recentFrames();
  assert.equal(recent.length, 1);
  assert.equal(recent[0]?.tick, 0);
  assert.ok(Object.isFrozen(recent));
});

test("seek moves the playhead, emits + returns the destination frame", () => {
  const playback = controller();
  const frame = playback.seek(1500);
  assert.equal(frame.tick, 1);
  assert.equal(playback.state.playheadMs, 1500);
  assert.equal(playback.state.cursorTick, 1);
  assert.equal(playback.recentFrames().length, 2);
  assert.ok(playback.recentFrames().every((emitted) => Object.isFrozen(emitted)));
});

test("out-of-range seek is a typed refusal and leaves no trace (validation precedes mutation)", () => {
  const playback = controller();
  playback.seek(1500);
  const before = playback.state;
  for (const bad of [-1, 6000.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => playback.seek(bad),
      (error: unknown) => {
        assert.ok(error instanceof OutOfRangeSeekError);
        assert.match(error.detail, /operation:seek:/);
        return true;
      },
    );
  }
  const after = playback.state;
  assert.equal(after.playheadMs, before.playheadMs);
  assert.equal(after.cursorTick, before.cursorTick);
  assert.equal(playback.recentFrames().length, 2);
});

test("seek(durationMs) lands on the last tick and reports atEnd", () => {
  const playback = controller();
  const frame = playback.seek(6000);
  assert.equal(frame.tick, 5);
  assert.ok(playback.state.atEnd);
});

test("frameAt is pure: idempotent per t, never moves the playhead, never writes the buffer", () => {
  const playback = controller();
  playback.seek(1500);
  const first = playback.frameAt(2000);
  const second = playback.frameAt(2000);
  assert.deepEqual(first, second);
  assert.equal(playback.state.playheadMs, 1500);
  assert.equal(playback.recentFrames().length, 2);
  assert.throws(
    () => playback.frameAt(6001),
    (error: unknown) => {
      assert.ok(error instanceof OutOfRangeSeekError);
      assert.match(error.detail, /operation:frameAt:/);
      return true;
    },
  );
});

test("step moves by whole ticks (tick-quantized), forward and backward; step(0) is a no-op", () => {
  const playback = controller();
  playback.seek(1500);
  const forward = playback.step(1);
  assert.equal(forward.tick, 2);
  assert.equal(playback.state.playheadMs, 2000);
  const back = playback.step(-2);
  assert.equal(back.tick, 0);
  assert.equal(playback.state.playheadMs, 0);
  const stay = playback.step(0);
  assert.equal(stay.tick, 0);
});

test("out-of-range and non-integer steps are typed refusals leaving no trace", () => {
  const playback = controller();
  playback.seek(5000);
  for (const bad of [-6, 2]) {
    assert.throws(
      () => playback.step(bad),
      (error: unknown) => {
        assert.ok(error instanceof OutOfRangeStepError, `expected out-of-range-step for ${bad}`);
        assert.match(error.detail, /out-of-range-step:delta:/);
        return true;
      },
    );
  }
  for (const bad of [1.5, Number.NaN]) {
    assert.throws(
      () => playback.step(bad),
      (error: unknown) => {
        assert.ok(error instanceof InvalidStepError, `expected invalid-step for ${bad}`);
        return true;
      },
    );
  }
  assert.equal(playback.state.playheadMs, 5000);
  assert.equal(playback.state.cursorTick, 5);
});

test("play validates the rate; pause clears it; rates persist across seeks", () => {
  const playback = controller();
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => playback.play(bad),
      (error: unknown) => {
        assert.ok(error instanceof InvalidRateError);
        assert.match(error.detail, new RegExp(`rate:${String(bad)}`));
        return true;
      },
    );
  }
  playback.play(2);
  assert.equal(playback.state.playing, true);
  assert.equal(playback.state.rate, 2);
  playback.seek(0);
  assert.equal(playback.state.rate, 2);
  playback.pause();
  assert.equal(playback.state.playing, false);
  assert.equal(playback.state.rate, 0);
});

test("advance while paused is a typed PlaybackPausedError; invalid dt is a typed InvalidAdvanceError", () => {
  const playback = controller();
  assert.throws(
    () => playback.advance(1000),
    (error: unknown) => {
      assert.ok(error instanceof PlaybackPausedError);
      return true;
    },
  );
  playback.play(1);
  for (const bad of [-1, Number.NaN]) {
    assert.throws(
      () => playback.advance(bad),
      (error: unknown) => {
        assert.ok(error instanceof InvalidAdvanceError);
        return true;
      },
    );
  }
  assert.equal(playback.state.playheadMs, 0);
});

test("advance emits one frame per crossed tick (starting tick not re-emitted) and returns them", () => {
  const playback = controller();
  playback.seek(1000);
  playback.play(1);
  const emitted = playback.advance(2500);
  assert.deepEqual(
    emitted.map((frame) => frame.tick),
    [2, 3],
  );
  assert.equal(playback.state.playheadMs, 3500);
  assert.equal(playback.recentFrames().length, 4); // tick 0 (construction), 1 (seek), 2, 3
});

test("slow motion accumulates sub-tick playhead time (rate 0.5 x two 1000ms advances cross one tick)", () => {
  const playback = controller();
  playback.play(0.5);
  const first = playback.advance(1000);
  assert.equal(first.length, 0);
  assert.equal(playback.state.playheadMs, 500);
  const second = playback.advance(1000);
  assert.deepEqual(
    second.map((frame) => frame.tick),
    [1],
  );
  assert.equal(playback.state.playheadMs, 1000);
});

test("advance clamps at the timeline end: normal stop (paused, atEnd), never an error", () => {
  const playback = controller();
  playback.play(10);
  const emitted = playback.advance(10_000);
  assert.deepEqual(
    emitted.map((frame) => frame.tick),
    [1, 2, 3, 4, 5],
  );
  assert.equal(playback.state.playheadMs, 6000);
  assert.ok(playback.state.atEnd);
  assert.equal(playback.state.playing, false);
  assert.throws(
    () => playback.advance(1000),
    (error: unknown) => {
      assert.ok(error instanceof PlaybackPausedError);
      return true;
    },
  );
});

test("determinism: identical constructor args + call sequences yield deep-equal outputs", () => {
  const drive = (playback: PlaybackController) => ({
    frames: [playback.seek(1500), (playback.play(2), playback.advance(2000)), playback.step(-1)],
    state: playback.state,
    recent: playback.recentFrames(),
    pure: playback.frameAt(2500),
  });
  const runOne = drive(controller());
  const runTwo = drive(controller());
  assert.deepEqual(runOne, runTwo);
});

test("state snapshots and recentFrames copies are frozen and detached from later mutation", () => {
  const playback = controller();
  const state = playback.state;
  const recent = playback.recentFrames();
  playback.seek(1500);
  playback.play(1);
  playback.advance(2500); // target 4000 -> ticks 2, 3, 4 crossed
  assert.equal(state.playheadMs, 0);
  assert.equal(recent.length, 1);
  assert.equal(playback.recentFrames().length, 5);
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(recent));
});
