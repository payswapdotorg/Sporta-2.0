import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EmptyTimelineError,
  MalformedTimelineEventError,
  OutOfRangeSeekError,
  PlaybackController,
  type PlaybackFrame,
  type RenderTimelinePort,
} from "../src/contract.js";
import {
  examplePlaybackSession,
  exampleTacticalTimeline,
  examplePlayByPlayTimeline,
} from "../src/contract.example.js";

/**
 * The headless composition root (work-order W5C-3, the repo law:
 * node:test + tsx). FIXTURE-GRADE timelines drive the playback
 * controller end-to-end — labeled fixtures; the pure functions run
 * FOR REAL (real wall-time measured by the runner, deterministic
 * outputs on real inputs). The packages/web host wiring is TL
 * integration work and is deliberately absent here.
 */

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(full));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

test("ADAPTER BOUNDARY LAW (machine-checked): playback src consumes zero @sporta/* surfaces and never mentions the SWM record", () => {
  const root = join(import.meta.dirname, "../src");
  const files = collectSourceFiles(root);
  assert.ok(files.length >= 7, `expected the playback surface sources, found ${files.length}`);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.ok(
      !source.includes("@sporta/"),
      `${file} must not import any @sporta/* surface (the adapter invariant holds at playback)`,
    );
    assert.ok(
      !source.includes("SportsWorldModelRecord"),
      `${file} must not consume the SWM record type (renderers consume render models)`,
    );
  }
  const packageJson = JSON.parse(
    readFileSync(join(import.meta.dirname, "../package.json"), "utf8"),
  );
  assert.ok(
    packageJson.dependencies === undefined || Object.keys(packageJson.dependencies).length === 0,
  );
  assert.equal(packageJson.name, "@sporta/render");
});

test("END-TO-END (fixture-grade): both realities replayed through one session — every declared event appears, none invented", () => {
  const controller = new PlaybackController([exampleTacticalTimeline, examplePlayByPlayTimeline], {
    tickMs: 1000,
  });
  const frames: PlaybackFrame[] = [];
  frames.push(controller.seek(0));
  controller.play(2);
  while (controller.state.playing) {
    frames.push(...controller.advance(1000));
  }
  // ticks 1..5 crossed at 2x over 1000ms caller advances; frame(0) from the seek
  assert.deepEqual(
    frames.map((frame) => frame.tick),
    [0, 1, 2, 3, 4, 5],
  );
  assert.ok(controller.state.atEnd);
  assert.equal(controller.state.playing, false);
  // zero invention + zero loss: the union of active events over all ticks IS the declared set
  const seen = new Set<string>();
  for (const frame of frames) {
    for (const active of frame.activeEvents) seen.add(active.eventId);
  }
  const declared = new Set(
    [...exampleTacticalTimeline.events, ...examplePlayByPlayTimeline.events].map(
      (event) => event.eventId,
    ),
  );
  assert.deepEqual([...seen].sort(), [...declared].sort());
  // every frame projects BOTH reality kinds
  for (const frame of frames) {
    assert.deepEqual(
      frame.realities.map((reality) => reality.kind),
      ["tactical", "play-by-play"],
    );
  }
});

test("DOMAIN EXTENSION LAW: a second synthetic domain replays with identical semantics (domain carried verbatim)", () => {
  const esports: RenderTimelinePort = {
    kind: "tactical",
    source: { swmId: "swm:esports-fixture", snapshotHash: "cd".repeat(32), domain: "esports-sc2" },
    provenance: {
      sourceKind: "authorized-source",
      sourceRef: "observer:fixture",
      capturedAt: "2026-10-11T09:00:00.000Z",
    },
    rightsScope: { holders: ["holder:esports"], usages: ["replay"], prohibitions: [] },
    events: [
      { eventId: "event:engagement", atMs: 0, payloadRefs: ["unit:army-a"] },
      { eventId: "event:flank", atMs: 2000, durationMs: 3000, payloadRefs: ["unit:army-b"] },
      { eventId: "event:gg", atMs: 9000 },
    ],
  };
  const controller = new PlaybackController([esports], { tickMs: 2000 });
  const frame = controller.frameAt(2000);
  assert.equal(frame.source.domain, "esports-sc2");
  const tacticalFrame = frame.realities[0];
  assert.ok(tacticalFrame && tacticalFrame.kind === "tactical");
  assert.deepEqual([...tacticalFrame.delta.affectedEntities], ["unit:army-b"]);
  controller.play(1);
  const emitted = controller.advance(20_000);
  assert.deepEqual(
    emitted.map((each) => each.tick),
    [1, 2, 3, 4, 5],
  );
  assert.ok(controller.state.atEnd);
});

test("ERROR PATHS in one session flow: refusals are typed and leave the session intact", () => {
  const controller = new PlaybackController([exampleTacticalTimeline, examplePlayByPlayTimeline]);
  controller.play(1);
  controller.advance(1000);
  const before = controller.state;
  assert.throws(
    () => controller.seek(100_000),
    (error: unknown) => {
      assert.ok(error instanceof OutOfRangeSeekError);
      return true;
    },
  );
  assert.throws(
    () =>
      new PlaybackController([
        {
          ...exampleTacticalTimeline,
          events: [{ eventId: "", atMs: 0 }],
        },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof MalformedTimelineEventError);
      return true;
    },
  );
  assert.throws(
    () => new PlaybackController([]),
    (error: unknown) => {
      assert.ok(error instanceof EmptyTimelineError);
      return true;
    },
  );
  const after = controller.state;
  assert.equal(after.playheadMs, before.playheadMs);
  assert.equal(after.playing, true);
});

test("BOUNDED BUFFER under composition: a full-timeline batch is returned while retention stays capacity-bounded", () => {
  const controller = new PlaybackController([exampleTacticalTimeline, examplePlayByPlayTimeline], {
    tickMs: 1000,
    frameBufferCapacity: 3,
  });
  controller.play(3);
  const emitted = controller.advance(10_000);
  assert.equal(emitted.length, 5);
  assert.deepEqual(
    controller.recentFrames().map((frame) => frame.tick),
    [3, 4, 5],
  );
});

test("DETERMINISM across independent sessions: identical drivers yield deep-equal frame streams", () => {
  const drive = () => {
    const controller = new PlaybackController(
      [exampleTacticalTimeline, examplePlayByPlayTimeline],
      {
        tickMs: 1000,
        frameBufferCapacity: 64,
      },
    );
    const frames: PlaybackFrame[] = [controller.seek(1500)];
    controller.play(2);
    frames.push(...controller.advance(2500));
    frames.push(controller.step(-2));
    return { frames, state: controller.state, recent: controller.recentFrames() };
  };
  assert.deepEqual(drive(), drive());
});

test("HONEST EXAMPLE: examplePlaybackSession runs for real and reports a coherent session", () => {
  const session = examplePlaybackSession();
  assert.equal(session.seekFrame.tick, 1);
  // playhead 1500 + 2000ms x rate 2 = 5500 -> ticks 2..5 crossed
  assert.deepEqual(
    session.playedFrames.map((frame) => frame.tick),
    [2, 3, 4, 5],
  );
  assert.equal(session.steppedBackFrame.tick, 4);
  assert.equal(session.state.playheadMs, 4000);
  assert.ok(session.recentFrames.length > 0 && session.recentFrames.length <= 8);
});

test("REAL EXECUTION (real wall-time, deterministic outputs on real inputs): 3200 frame projections over a 40-event fixture timeline", () => {
  const events = Array.from({ length: 40 }, (_, index) => ({
    eventId: `event:bulk-${index}`,
    atMs: (index % 20) * 500,
    durationMs: 1500,
    payloadRefs: [`entity:bulk-${index % 7}`],
  }));
  const timeline: RenderTimelinePort = {
    kind: "tactical",
    source: { swmId: "swm:bulk-fixture", snapshotHash: "ef".repeat(32), domain: "football" },
    provenance: {
      sourceKind: "authorized-source",
      sourceRef: "camera:bulk",
      capturedAt: "2026-10-10T00:00:00.000Z",
    },
    rightsScope: { holders: ["holder:bulk"], usages: ["render"], prohibitions: [] },
    events,
  };
  const controller = new PlaybackController([timeline], { tickMs: 250, frameBufferCapacity: 16 });
  const results: number[] = [];
  for (let round = 0; round < 40; round += 1) {
    for (let tick = 0; tick < 40; tick += 1) {
      const frame = controller.frameAt(tick * 250);
      results.push(frame.activeEvents.length);
    }
    controller.seek((round % 40) * 250);
  }
  const totalActive = results.reduce((sum, count) => sum + count, 0);
  assert.ok(totalActive > 0);
  // determinism on real inputs: a second run yields the identical projection stream
  const replay: number[] = [];
  const mirror = new PlaybackController([timeline], { tickMs: 250, frameBufferCapacity: 16 });
  for (let round = 0; round < 40; round += 1) {
    for (let tick = 0; tick < 40; tick += 1) {
      replay.push(mirror.frameAt(tick * 250).activeEvents.length);
    }
    mirror.seek((round % 40) * 250);
  }
  assert.deepEqual(results, replay);
  assert.ok(controller.recentFrames().length <= 16);
});
