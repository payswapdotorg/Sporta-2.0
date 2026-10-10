import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_FRAME_BUFFER_CAPACITY,
  DEFAULT_TICK_MS,
  DuplicateRealityKindError,
  EmptyTimelineError,
  InvalidPlaybackOptionsError,
  MalformedCarryForwardError,
  MalformedTimelineEventError,
  PlaybackError,
  TimelineCarryMismatchError,
  UnknownRealityKindError,
  activeEventsAtTick,
  buildPlaybackTimelineIndex,
  destinationTickOf,
  resolvePlaybackOptions,
  structurallyEqual,
  type RenderTimelinePort,
} from "../src/contract.js";

// FIXTURE-GRADE timelines: synthetic football events (labeled per the evidence law).
const carry = {
  source: { swmId: "swm:football-fixture", snapshotHash: "ab".repeat(32), domain: "football" },
  provenance: {
    sourceKind: "authorized-source",
    sourceRef: "camera:fixture-1",
    capturedAt: "2026-10-10T12:00:00.000Z",
    confidence: 0.9,
  },
  rightsScope: { holders: ["holder:b"], usages: ["render"], prohibitions: [] },
};

function tacticalTimeline(overrides: {
  events?: RenderTimelinePort["events"];
  carryOverrides?: Record<string, unknown>;
  kind?: string;
}): RenderTimelinePort {
  const merged = { ...carry, ...((overrides.carryOverrides ?? {}) as object) };
  return {
    kind: (overrides.kind ?? "tactical") as RenderTimelinePort["kind"],
    ...(merged as object),
    events: overrides.events ?? [{ eventId: "event:kickoff", atMs: 0 }],
  } as RenderTimelinePort;
}

function index(timelines: readonly RenderTimelinePort[], options?: { tickMs?: number }) {
  return buildPlaybackTimelineIndex(timelines, resolvePlaybackOptions({ tickMs: options?.tickMs }));
}

test("no timelines at all is a typed EmptyTimelineError", () => {
  assert.throws(
    () => index([]),
    (error: unknown) => {
      assert.ok(error instanceof EmptyTimelineError);
      assert.ok(error instanceof PlaybackError);
      assert.match(error.detail, /^empty-timeline:no-timelines$/);
      return true;
    },
  );
});

test("a timeline with zero events is a typed EmptyTimelineError naming the kind", () => {
  assert.throws(
    () => index([tacticalTimeline({ events: [] })]),
    (error: unknown) => {
      assert.ok(error instanceof EmptyTimelineError);
      assert.match(error.detail, /kind:tactical/);
      return true;
    },
  );
});

test("malformed events are refused: empty eventId, bad atMs, bad durationMs, bad payloadRefs", () => {
  const cases: RenderTimelinePort["events"] = [
    [{ eventId: "", atMs: 0 }],
    [{ eventId: "event:x", atMs: -1 }],
    [{ eventId: "event:x", atMs: Number.NaN }],
    [{ eventId: "event:x", atMs: Number.POSITIVE_INFINITY }],
    [{ eventId: "event:x", atMs: 0, durationMs: 0 }],
    [{ eventId: "event:x", atMs: 0, durationMs: -5 }],
    [{ eventId: "event:x", atMs: 0, durationMs: Number.NaN }],
    [{ eventId: "event:x", atMs: 0, payloadRefs: ["ok", ""] }],
    [{ eventId: "event:x", atMs: 0, payloadRefs: ["ok", 7 as unknown as string] }],
    [null as unknown as RenderTimelinePort["events"][number]],
  ];
  for (const events of cases) {
    assert.throws(
      () => index([tacticalTimeline({ events })]),
      (error: unknown) => {
        assert.ok(
          error instanceof MalformedTimelineEventError,
          `expected malformed-event refusal for ${JSON.stringify(events)}`,
        );
        assert.match(error.detail, /^malformed-event:tactical:#0:/);
        return true;
      },
    );
  }
});

test("duplicate eventId WITHIN one timeline is refused; the SAME id across two timelines is legal", () => {
  assert.throws(
    () =>
      index([
        tacticalTimeline({
          events: [
            { eventId: "event:dup", atMs: 0 },
            { eventId: "event:dup", atMs: 1000 },
          ],
        }),
      ]),
    (error: unknown) => {
      assert.ok(error instanceof MalformedTimelineEventError);
      assert.match(error.detail, /duplicate eventId "event:dup" within one timeline/);
      return true;
    },
  );
  // the two realities legitimately project the same underlying events
  const merged = index([
    tacticalTimeline({ events: [{ eventId: "event:shared", atMs: 0 }] }),
    {
      kind: "play-by-play",
      ...carry,
      events: [{ eventId: "event:shared", atMs: 0 }],
    },
  ]);
  assert.equal(merged.events.length, 2);
});

test("an unknown reality kind is a typed UnknownRealityKindError", () => {
  assert.throws(
    () => index([tacticalTimeline({ kind: "vr-cinema" })]),
    (error: unknown) => {
      assert.ok(error instanceof UnknownRealityKindError);
      assert.match(error.detail, /unknown-kind:position:0:vr-cinema/);
      return true;
    },
  );
});

test("the same reality kind declared twice is a typed DuplicateRealityKindError", () => {
  assert.throws(
    () => index([tacticalTimeline({}), tacticalTimeline({})]),
    (error: unknown) => {
      assert.ok(error instanceof DuplicateRealityKindError);
      assert.match(error.detail, /duplicate-kind:kind:tactical/);
      return true;
    },
  );
});

test("disagreeing carry-forward headers are refused (one session = one snapshot)", () => {
  assert.throws(
    () =>
      index([
        tacticalTimeline({}),
        {
          kind: "play-by-play",
          ...carry,
          source: { ...carry.source, snapshotHash: "cd".repeat(32) },
          events: [{ eventId: "event:x", atMs: 0 }],
        },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof TimelineCarryMismatchError);
      assert.match(error.detail, /carry-mismatch:kind:play-by-play/);
      return true;
    },
  );
});

test("malformed carry-forward headers are refused (fail-closed, incl. confidence bounds)", () => {
  const badCarries: Record<string, unknown>[] = [
    { source: { swmId: "", snapshotHash: "ab".repeat(32), domain: "football" } },
    { provenance: { sourceKind: "authorized-source", sourceRef: "", capturedAt: "t" } },
    {
      provenance: {
        sourceKind: "authorized-source",
        sourceRef: "s",
        capturedAt: "t",
        confidence: 1.5,
      },
    },
    { rightsScope: { holders: "not-an-array", usages: ["render"], prohibitions: [] } },
    { rightsScope: { holders: ["ok", ""], usages: ["render"], prohibitions: [] } },
  ];
  for (const carryOverrides of badCarries) {
    assert.throws(
      () => index([tacticalTimeline({ carryOverrides })]),
      (error: unknown) => {
        assert.ok(
          error instanceof MalformedCarryForwardError,
          `expected malformed-carry for ${JSON.stringify(carryOverrides)}`,
        );
        assert.match(error.detail, /^malformed-carry:tactical:/);
        return true;
      },
    );
  }
});

test("invalid options are typed refusals; defaults resolve (tickMs 1000, capacity 64, duration = tickMs)", () => {
  for (const options of [
    { tickMs: 0 },
    { tickMs: -100 },
    { tickMs: Number.NaN },
    { frameBufferCapacity: 0 },
    { frameBufferCapacity: 2.5 },
    { defaultEventDurationMs: 0 },
    { defaultEventDurationMs: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(
      () => resolvePlaybackOptions(options),
      (error: unknown) => {
        assert.ok(error instanceof InvalidPlaybackOptionsError);
        return true;
      },
    );
  }
  const defaults = resolvePlaybackOptions();
  assert.equal(defaults.tickMs, DEFAULT_TICK_MS);
  assert.equal(defaults.frameBufferCapacity, DEFAULT_FRAME_BUFFER_CAPACITY);
  assert.equal(defaults.defaultEventDurationMs, DEFAULT_TICK_MS);
});

test("duration = max event end; totalTicks = ceil(duration / tickMs); destination tick clamps at the end", () => {
  const built = index(
    [
      tacticalTimeline({
        events: [
          { eventId: "event:a", atMs: 0 },
          { eventId: "event:b", atMs: 1500, durationMs: 2500 },
        ],
      }),
    ],
    { tickMs: 1000 },
  );
  assert.equal(built.durationMs, 4000);
  assert.equal(built.totalTicks, 4);
  assert.equal(destinationTickOf(built, 0), 0);
  assert.equal(destinationTickOf(built, 999.9), 0);
  assert.equal(destinationTickOf(built, 4000), 3);
});

test("half-open interval law: an event is active only on ticks its [at, at+duration) window intersects", () => {
  const built = index(
    [tacticalTimeline({ events: [{ eventId: "event:window", atMs: 1000, durationMs: 1000 }] })],
    { tickMs: 1000 },
  );
  const activeTicks = [0, 1, 2, 3].filter((tick) => activeEventsAtTick(built, tick).length > 0);
  assert.deepEqual(activeTicks, [1]);
  const spanning = index(
    [tacticalTimeline({ events: [{ eventId: "event:span", atMs: 1500, durationMs: 2000 }] })],
    { tickMs: 1000 },
  );
  const spanTicks = [0, 1, 2, 3, 4].filter((tick) => activeEventsAtTick(spanning, tick).length > 0);
  assert.deepEqual(spanTicks, [1, 2, 3]);
});

test("canonical merged order: atMs, then kind declaration order, then eventId", () => {
  const built = index([
    tacticalTimeline({
      events: [
        { eventId: "event:b", atMs: 1000 },
        { eventId: "event:a", atMs: 1000 },
      ],
    }),
    {
      kind: "play-by-play",
      ...carry,
      events: [
        { eventId: "event:z", atMs: 500 },
        { eventId: "event:a", atMs: 1000 },
      ],
    },
  ]);
  assert.deepEqual(
    built.events.map((event) => `${event.kind}:${event.eventId}`),
    ["play-by-play:event:z", "tactical:event:a", "tactical:event:b", "play-by-play:event:a"],
  );
  // sequence preserves each timeline's own declared order
  assert.deepEqual(
    built.events.filter((event) => event.kind === "tactical").map((event) => event.sequence),
    [1, 0],
  );
});

test("declared event durations default to the resolved defaultEventDurationMs", () => {
  const built = index([tacticalTimeline({ events: [{ eventId: "event:x", atMs: 2500 }] })], {
    tickMs: 1000,
  });
  assert.equal(built.events[0]?.durationMs, 1000);
  assert.equal(built.defaultEventDurationMs, 1000);
});

test("structurallyEqual: undefined-valued keys equal absent keys; arrays are order-sensitive", () => {
  assert.ok(structurallyEqual({ a: 1, b: undefined }, { a: 1 }));
  assert.ok(!structurallyEqual({ a: 1 }, { a: 1, b: 2 }));
  assert.ok(structurallyEqual(["x", "y"], ["x", "y"]));
  assert.ok(!structurallyEqual(["y", "x"], ["x", "y"]));
  assert.ok(!structurallyEqual(1, "1"));
});
