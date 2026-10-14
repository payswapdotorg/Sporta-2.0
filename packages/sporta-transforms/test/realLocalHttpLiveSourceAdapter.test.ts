/**
 * W10A-2 / P10-02..P10-04 — the REAL local HTTP live-source adapter.
 *
 * EVIDENCE CLASS: REAL — every test drives a REAL `node:http` server
 * socket (ephemeral localhost port) and a REAL client socket
 * in-process; frame CONTENT is deterministic test data while every
 * PROCESS observation (cadence, ordering, counters, connection
 * refusals, close reasons) is real and measured. Clean teardown law:
 * `adapter.dispose()` in `finally` for every adapter created.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import {
  RealLocalHttpLiveSourceAdapter,
  type LiveSourceDescriptor,
} from "../src/contract.js";

const BASE_DESCRIPTOR: LiveSourceDescriptor = {
  sourceId: "live:match-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 40,
  queueBound: 8,
};

function ndjsonEventFrames(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      eventId: `evt-${index + 1}`,
      entityId: index % 2 === 0 ? "team-A" : "team-B",
      atMs: 1000 + index * 1000,
      confidence: 0.3 + index / 10,
    }),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** REAL observation: a connection attempt against a stopped port must be refused. */
function assertConnectionRefused(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = httpRequest({ host: "127.0.0.1", port, path: "/", method: "GET", timeout: 1000 });
    probe.on("error", (error: NodeJS.ErrnoException) => {
      probe.destroy();
      if (error.code === "ECONNREFUSED") {
        resolve();
      } else {
        reject(new Error(`expected ECONNREFUSED after the server stopped, got ${error.code ?? error.message}`));
      }
    });
    probe.on("response", () => {
      probe.destroy();
      reject(new Error("connection unexpectedly accepted — the server did not stop"));
    });
    probe.end();
  });
}

test("REAL frame flow: a real node:http server streams frames at the declared cadence to a real client (P10-02)", async () => {
  const frames = ndjsonEventFrames(5);
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames });
  try {
    const opened = await adapter.open(BASE_DESCRIPTOR);
    assert.ok("handle" in opened, "a valid descriptor opens a session");
    const handle = opened.handle;
    assert.equal(adapter.activeBindings().length, 1, "one real server is bound while the session is open");
    const port = adapter.activeBindings()[0]?.port;
    assert.ok(port !== undefined && port > 0, "the binding carries a real ephemeral port");

    const received: { payload: string; index: number; receivedAt: string }[] = [];
    let terminalSeen = false;
    const startedAt = Date.now();
    for (;;) {
      const next = await handle.next();
      if ("frame" in next) {
        received.push(next.frame);
        continue;
      }
      terminalSeen = true;
      // Clean end: the terminal says the source ended, evidence stays in-flight with no refusal.
      assert.equal(next.done, true);
      assert.equal(next.refusal.kind, "source-unavailable");
      assert.match(next.refusal.detail, /ended cleanly/);
      const snapshot = handle.evidence();
      assert.equal(snapshot.refusal, null);
      assert.equal(snapshot.closeReason, "in-flight");
      break;
    }
    const elapsedMs = Date.now() - startedAt;
    assert.ok(terminalSeen, "the finite frame list ends the stream with a terminal");

    // Ordered, gapless frames with the exact server payloads.
    assert.deepEqual(
      received.map((frame) => frame.payload),
      frames,
      "frames arrive in server order with exact payloads",
    );
    assert.deepEqual(received.map((frame) => frame.index), [0, 1, 2, 3, 4], "indices are gapless arrival ordinals");
    for (const frame of received) {
      assert.ok(!Number.isNaN(Date.parse(frame.receivedAt)), "receivedAt is a parseable Iso8601 timestamp");
    }
    for (let index = 1; index < received.length; index += 1) {
      const gap = Date.parse(received[index]!.receivedAt) - Date.parse(received[index - 1]!.receivedAt);
      assert.ok(
        gap >= BASE_DESCRIPTOR.cadenceMs - 12,
        `inter-arrival gap ${gap}ms respects the declared cadence ${BASE_DESCRIPTOR.cadenceMs}ms (small scheduling slack allowed)`,
      );
    }
    assert.ok(
      elapsedMs >= (frames.length - 1) * (BASE_DESCRIPTOR.cadenceMs - 12),
      `the drain took ${elapsedMs}ms — the cadence is real, not instantaneous`,
    );
    assert.ok(elapsedMs < 5000, "the finite stream drains promptly (no hang)");

    // Honest close: the session finalizes completed with honest counters.
    const evidence = await handle.close("completed");
    assert.equal(evidence.closeReason, "completed");
    assert.equal(evidence.framesConsumed, 5);
    assert.equal(evidence.refusal, null);
    assert.ok(evidence.closedAt !== null);
    assert.deepEqual(evidence.descriptor, BASE_DESCRIPTOR, "the evidence pins the descriptor verbatim");

    // The server is stopped for real after close.
    assert.equal(adapter.activeBindings().length, 0, "the binding is released when the session closes");
    await assertConnectionRefused(port);
  } finally {
    await adapter.dispose();
  }
});

test("REAL back-pressure: bounded-queue overflow refuses typed with partial evidence retained (P10-03)", async () => {
  const frames = ndjsonEventFrames(12);
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames });
  try {
    const opened = await adapter.open({ ...BASE_DESCRIPTOR, cadenceMs: 5, queueBound: 2 });
    assert.ok("handle" in opened);
    const handle = opened.handle;
    const port = adapter.activeBindings()[0]?.port;

    // Consume ONE frame, then let the fast stream fill the bounded queue.
    const first = await handle.next();
    assert.ok("frame" in first, "the first frame is delivered");
    assert.equal(first.frame.index, 0);
    await delay(80); // cadence 5ms vs bound 2: the next arrival must overflow

    const terminal = await handle.next();
    assert.ok(!("frame" in terminal), "no frame is delivered after the queue overflowed");
    assert.equal(terminal.done, true);
    assert.equal(terminal.refusal.kind, "queue-overflow");
    assert.equal(terminal.refusal.framesConsumed, 1, "the refusal retains the honestly-consumed count");

    // Partial evidence retained at the refusal instant — close state and refusal pinned.
    const evidence = handle.evidence();
    assert.equal(evidence.closeReason, "refused");
    assert.ok(evidence.closedAt !== null, "closedAt is stamped at the refusal");
    assert.deepEqual(evidence.refusal, terminal.refusal, "the refusal is pinned into the evidence");
    assert.equal(evidence.framesConsumed, 1);

    // Arithmetic honesty: received = consumed + queued + the refused arrival itself.
    const parsed = /arrival (\d+): received (\d+) frames, (\d+) consumed, (\d+) queued, (\d+) refused/.exec(
      terminal.refusal.detail,
    );
    assert.ok(parsed !== null, `the detail carries the honest arithmetic: ${terminal.refusal.detail}`);
    if (parsed !== null) {
      const [arrival, receivedCount, consumedCount, queuedCount, refusedCount] = parsed.slice(1).map(Number);
      assert.equal(arrival, 4, "the overflow fires at the first arrival that cannot be queued");
      assert.equal(receivedCount, 4);
      assert.equal(consumedCount, 1);
      assert.equal(queuedCount, 2);
      assert.equal(refusedCount, 1);
      assert.equal(consumedCount + queuedCount + refusedCount, receivedCount, "no frame is dropped unaccounted");
    }

    // The server actually stopped — and a refused session is never re-labeled successful.
    const finalized = await handle.close("completed");
    assert.equal(finalized.closeReason, "refused", "close('completed') cannot re-label a refused session");
    assert.deepEqual(await handle.close("aborted"), finalized, "close is idempotent");
    assert.equal(adapter.activeBindings().length, 0);
    if (port !== undefined) await assertConnectionRefused(port);

    // next() after the refusal keeps returning the latched terminal.
    const again = await handle.next();
    assert.ok(!("frame" in again));
    assert.equal(again.refusal.kind, "queue-overflow");
    assert.equal(again.done, true);
  } finally {
    await adapter.dispose();
  }
});

test("REAL cancellation: close mid-stream stops the server and finalizes the session with the close reason (P10-04)", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(50) });
  try {
    const opened = await adapter.open({ ...BASE_DESCRIPTOR, cadenceMs: 25 });
    assert.ok("handle" in opened);
    const handle = opened.handle;
    const first = await handle.next();
    assert.ok("frame" in first);
    const second = await handle.next();
    assert.ok("frame" in second);
    const port = adapter.activeBindings()[0]?.port;
    assert.ok(port !== undefined);

    const evidence = await handle.close("aborted");
    assert.equal(evidence.closeReason, "aborted");
    assert.equal(evidence.framesConsumed, 2, "honest counters: exactly the frames delivered before the close");
    assert.equal(evidence.refusal, null);
    assert.ok(evidence.closedAt !== null);

    // The server is stopped for real: the port refuses new connections.
    assert.equal(adapter.activeBindings().length, 0);
    await assertConnectionRefused(port);

    // next() after close is terminal aborted — never more frames; close is idempotent.
    const terminal = await handle.next();
    assert.ok(!("frame" in terminal));
    assert.equal(terminal.refusal.kind, "aborted");
    assert.equal(terminal.done, true);
    assert.equal(terminal.refusal.framesConsumed, 2);
    assert.deepEqual(await handle.close("aborted"), evidence);
  } finally {
    await adapter.dispose();
  }
});

test("REAL adapter open: every malformed descriptor lane refuses typed before any IO (P10-01)", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(2) });
  try {
    const lanes: readonly { name: string; descriptor: unknown }[] = [
      { name: "empty sourceId", descriptor: { ...BASE_DESCRIPTOR, sourceId: "" } },
      { name: "non-string sourceId", descriptor: { ...BASE_DESCRIPTOR, sourceId: 9 } },
      { name: "grade production", descriptor: { ...BASE_DESCRIPTOR, grade: "production" } },
      { name: "arbitrary grade", descriptor: { ...BASE_DESCRIPTOR, grade: "real-cdn" } },
      { name: "empty contentKind", descriptor: { ...BASE_DESCRIPTOR, contentKind: "" } },
      { name: "zero cadenceMs", descriptor: { ...BASE_DESCRIPTOR, cadenceMs: 0 } },
      { name: "NaN cadenceMs", descriptor: { ...BASE_DESCRIPTOR, cadenceMs: Number.NaN } },
      { name: "fractional queueBound", descriptor: { ...BASE_DESCRIPTOR, queueBound: 2.5 } },
      { name: "zero queueBound", descriptor: { ...BASE_DESCRIPTOR, queueBound: 0 } },
    ];
    for (const lane of lanes) {
      const opened = await adapter.open(lane.descriptor as LiveSourceDescriptor);
      assert.ok("refusal" in opened, `lane "${lane.name}" must refuse through open()`);
      if ("refusal" in opened) {
        assert.equal(opened.refusal.kind, "invalid-descriptor");
        assert.equal(opened.refusal.framesConsumed, 0);
        assert.ok(opened.refusal.detail.length > 0);
      }
    }
    // Grade law: the REAL adapter never serves a fixture-labeled descriptor.
    const fixtureGrade = await adapter.open({ ...BASE_DESCRIPTOR, grade: "fixture" });
    assert.ok("refusal" in fixtureGrade, "a fixture-grade descriptor is refused by the real-local adapter");
    if ("refusal" in fixtureGrade) {
      assert.equal(fixtureGrade.refusal.kind, "invalid-descriptor");
      assert.match(fixtureGrade.refusal.detail, /real-local-live/);
    }
    // No session was ever opened by any refused lane.
    assert.equal(adapter.activeBindings().length, 0);
  } finally {
    await adapter.dispose();
  }
});

test("REAL dispose: open sessions finalize (clean ends complete, streams abort) and every server stops", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(50) });
  const opened = await adapter.open({ ...BASE_DESCRIPTOR, cadenceMs: 25 });
  assert.ok("handle" in opened);
  const handle = opened.handle;
  await handle.next(); // one frame consumed mid-stream
  const port = adapter.activeBindings()[0]?.port;
  await adapter.dispose();
  const evidence = handle.evidence();
  assert.equal(evidence.closeReason, "aborted", "a still-streaming session force-finalizes aborted");
  assert.equal(evidence.framesConsumed, 1);
  assert.equal(adapter.activeBindings().length, 0);
  if (port !== undefined) await assertConnectionRefused(port);
});

test("adapter wiring law: impossible frame lists throw at construction (fail-fast, the store precedent)", () => {
  assert.throws(() => new RealLocalHttpLiveSourceAdapter({ frames: [] }), /non-empty frame list/);
  assert.throws(() => new RealLocalHttpLiveSourceAdapter({ frames: ["ok", ""] }), /non-empty string/);
  assert.throws(() => new RealLocalHttpLiveSourceAdapter({ frames: ["has\nnewline"] }), /without newline/);
});

test("REAL sequential sessions: one adapter serves session after session, each on its own real ephemeral port", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(3) });
  try {
    const ports: number[] = [];
    for (let round = 0; round < 2; round += 1) {
      const opened = await adapter.open({ ...BASE_DESCRIPTOR, sourceId: `live:match-${round + 1}`, cadenceMs: 10 });
      assert.ok("handle" in opened, `round ${round + 1} opens a session`);
      const port = adapter.activeBindings()[0]?.port;
      assert.ok(port !== undefined && port > 0);
      ports.push(port);
      let consumed = 0;
      for (;;) {
        const next = await opened.handle.next();
        if ("frame" in next) {
          consumed += 1;
          continue;
        }
        break;
      }
      const evidence = await opened.handle.close("completed");
      assert.equal(evidence.framesConsumed, 3, `round ${round + 1} drains all frames`);
      assert.equal(evidence.closeReason, "completed");
      assert.equal(consumed, 3);
      assert.equal(adapter.activeBindings().length, 0, `round ${round + 1} releases its server`);
    }
    assert.notEqual(ports[0], ports[1], "each session gets its own real ephemeral port");
    // Both stopped servers refuse connections for real.
    for (const port of ports) {
      await assertConnectionRefused(port);
    }
  } finally {
    await adapter.dispose();
  }
});
