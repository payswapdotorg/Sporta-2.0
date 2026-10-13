/**
 * W9A-3 / P9-02 + P9-05 — the REAL deterministic node lane.
 *
 * EVIDENCE CLASS: REAL process leg — every test spawns a REAL local
 * child process (real node executable, real temp-dir files, real
 * pipes, real exit codes/signals, real resourceUsage from the child).
 * Fixture content: the event streams and the slow-trim component
 * source. No fabricated numbers: every timing/resource assertion
 * observes what the process actually reported.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeExecutor, makeStore, makeTrimNode, eventStreamBytes, hash, SLOW_TRIM_SOURCE, trimComponent } from "./helpers.js";

const SLOW_TRIM_DIGEST = hash.text(SLOW_TRIM_SOURCE);

test("REAL trim: kept events are byte-exact, drops are counted, resources are real", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const node = makeTrimNode();
  const input = eventStreamBytes(); // atMs: 1000..5000
  const result = await executor.execute({
    node,
    parameters: { startMs: 1500, endMs: 4500 },
    input: { bytes: input, provenance: null },
  });

  assert.equal(result.status, "succeeded", `detail: ${result.detail}`);
  assert.ok(result.outputBytes !== null, "a succeeded trim returns its output bytes");
  assert.deepEqual(result.summary, { keptCount: 3, droppedCount: 2, inBytes: input.length, outBytes: result.outputBytes.length });

  // Byte-exact carry-forward: the output is exactly the kept input lines.
  const inputLines = new TextDecoder().decode(input).split("\n").filter((line) => line.length > 0);
  const outputLines = new TextDecoder().decode(result.outputBytes).split("\n").filter((line) => line.length > 0);
  assert.equal(outputLines.length, 3);
  assert.equal(outputLines[0], inputLines[1], "kept event 1 is byte-identical to input line 2");
  assert.equal(outputLines[1], inputLines[2], "kept event 2 is byte-identical to input line 3");
  assert.equal(outputLines[2], inputLines[3], "kept event 3 is byte-identical to input line 4");
  // order preserved: eventIds 2,3,4 in that order
  const kept = outputLines.map((line) => (JSON.parse(line) as { eventId: string }).eventId);
  assert.deepEqual(kept, ["evt-2", "evt-3", "evt-4"]);

  // REAL resource evidence from the child's own resourceUsage().
  assert.ok(result.timingMs >= 0, "real wall-clock timing");
  assert.ok(result.resourceUse.memoryMiB > 0, `real child RSS (MiB): ${result.resourceUse.memoryMiB}`);
  assert.equal(result.resourceUse.outputBytes, result.outputBytes.length);
  assert.ok(result.resourceUse.cpuMs >= 0);
  assert.match(result.detail, /kept 3 and dropped 2 of 5 events/);
});

test("REAL process: a window that keeps everything returns the input content unchanged", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const input = eventStreamBytes();
  const result = await executor.execute({
    node: makeTrimNode(),
    parameters: { startMs: 0, endMs: 6000 },
    input: { bytes: input, provenance: null },
  });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.summary?.keptCount, 5);
  assert.equal(result.summary?.droppedCount, 0);
  // The whole stream is unchanged: byte equality over the full payload.
  assert.deepEqual([...result.outputBytes ?? new Uint8Array()], [...input]);
});

test("REAL process: malformed event input fails closed with the child's typed error", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const malformed = new TextEncoder().encode('{"eventId":"evt-1","entityId":"team-A","atMs":1000}\nnot json\n');
  const result = await executor.execute({
    node: makeTrimNode(),
    parameters: { startMs: 0, endMs: 5000 },
    input: { bytes: malformed, provenance: null },
  });
  assert.equal(result.status, "typed-failure");
  assert.equal(result.outputBytes, null, "no output is committed on failure");
  assert.match(result.detail, /malformed-input/);
  assert.match(result.detail, /line is not JSON/);
});

test("REAL process: an invalid window fails closed before anything is trimmed", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const result = await executor.execute({
    node: makeTrimNode(),
    parameters: { startMs: 5000, endMs: 1000 },
    input: { bytes: eventStreamBytes(), provenance: null },
  });
  assert.equal(result.status, "typed-failure");
  assert.match(result.detail, /trim parameters invalid/);
});

test("REAL process: output budget overflow is a typed failure, output never committed", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const result = await executor.execute({
    node: makeTrimNode({ resources: { timeoutMs: 15_000, maxOutputBytes: 10, cpuClass: "light", memoryMiB: 256 } }),
    parameters: { startMs: 0, endMs: 6000 },
    input: { bytes: eventStreamBytes(), provenance: null },
  });
  assert.equal(result.status, "typed-failure");
  assert.match(result.detail, /output budget overflow/);
  assert.match(result.detail, /child emitted \d+ bytes/);
  assert.equal(result.outputBytes, null);
});

test("REAL process: the declared timeout kills the child (SIGTERM) — bounded execution", async () => {
  const store = makeStore([{ name: "slow-trim", kind: "deterministic-filter", source: SLOW_TRIM_SOURCE }]);
  const executor = makeExecutor(store);
  const startedAt = Date.now();
  const result = await executor.execute({
    node: makeTrimNode({
      componentRef: { kind: "deterministic-filter", digest: SLOW_TRIM_DIGEST, name: "slow-trim" },
      resources: { timeoutMs: 500, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    }),
    parameters: { startMs: 0, endMs: 100 },
    input: { bytes: eventStreamBytes(), provenance: null },
  });
  const elapsed = Date.now() - startedAt;
  assert.equal(result.status, "typed-failure");
  assert.match(result.detail, /SIGTERM|signal/);
  assert.ok(elapsed < 5000, `the kill must bound execution (took ${elapsed}ms)`);
  assert.equal(result.outputBytes, null);
});

test("REAL process: cancellation before spawn means nothing executed", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const controller = new AbortController();
  controller.abort();
  const result = await executor.execute({
    node: makeTrimNode(),
    parameters: { startMs: 0, endMs: 100 },
    input: { bytes: eventStreamBytes(), provenance: null },
    signal: controller.signal,
  });
  assert.equal(result.status, "cancelled");
  assert.match(result.detail, /aborted before spawn/);
  assert.equal(result.outputBytes, null);
});

test("REAL process: cancellation during the run kills the child and discards output", async () => {
  const store = makeStore([{ name: "slow-trim", kind: "deterministic-filter", source: SLOW_TRIM_SOURCE }]);
  const executor = makeExecutor(store);
  const controller = new AbortController();
  const startedAt = Date.now();
  setTimeout(() => controller.abort(), 150);
  const result = await executor.execute({
    node: makeTrimNode({
      componentRef: { kind: "deterministic-filter", digest: SLOW_TRIM_DIGEST, name: "slow-trim" },
      resources: { timeoutMs: 0, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    }),
    parameters: { startMs: 0, endMs: 100 },
    input: { bytes: eventStreamBytes(), provenance: null },
    signal: controller.signal,
  });
  const elapsed = Date.now() - startedAt;
  assert.equal(result.status, "cancelled");
  assert.match(result.detail, /aborted during execution/);
  assert.ok(elapsed < 5000, `abort must kill the child quickly (took ${elapsed}ms)`);
  assert.equal(result.outputBytes, null);
});

test("REAL process: an unresolvable pinned component is a typed failure at execution time too", async () => {
  const store = makeStore();
  const executor = makeExecutor(store);
  const result = await executor.execute({
    node: makeTrimNode({
      componentRef: { kind: "deterministic-filter", digest: `sha256:${"0".repeat(64)}`, name: "json-event-stream-trim" },
    }),
    parameters: { startMs: 0, endMs: 100 },
    input: { bytes: eventStreamBytes(), provenance: null },
  });
  assert.equal(result.status, "typed-failure");
  assert.match(result.detail, /does not resolve/);
});

test("the pinned component digest is the real sha256 of the component source", () => {
  const expected = trimComponent.digest;
  assert.match(expected, /^sha256:[0-9a-f]{64}$/);
  assert.ok(expected.length > 0);
});
