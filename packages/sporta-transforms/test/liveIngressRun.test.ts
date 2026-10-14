/**
 * W10A-3 / P10-05 — live-run composition over the REAL adapter and
 * the EXISTING run service.
 *
 * EVIDENCE CLASS: MIXED — the live leg is REAL (a real node:http
 * server socket + real client per session, real cadence), the
 * deterministic lane is REAL (a real child process per step), and the
 * artifact fabric / blob store are the existing in-memory
 * fixture-grade adapters from @sporta/artifacts (real ports,
 * fixture persistence). No model lane is exercised. Every live-run
 * failure lane observes the typed error plus the partial evidence —
 * a disconnected/failed source is never reported successful.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "@sporta/artifacts/contract";
import {
  FixedClock,
  FixtureTransformModelAdapter,
  LiveIngressError,
  LiveTransformRunService,
  RealLocalHttpLiveSourceAdapter,
  Sha256TransformHash,
  TransformRunService,
} from "../src/contract.js";
import type {
  LiveSessionHandle,
  LiveSourceDescriptor,
  LiveSourcePort,
  LiveTransformRunManifest,
  StartTransformRunInput,
  TransformRunManifest,
} from "../src/contract.js";
import {
  eventStreamBytes,
  feedProvenance,
  hash,
  makeExecutor,
  makeManifest,
  makeStore,
  makeTrimNode,
} from "./helpers.js";

const FIXED_TIME = "2026-10-13T12:00:00.000Z";

const LIVE_DESCRIPTOR: LiveSourceDescriptor = {
  sourceId: "live:match-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};

/** Deterministic NDJSON event frames (the first-slice event shape). */
function ndjsonEventFrames(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      eventId: `evt-${index + 1}`,
      entityId: index % 2 === 0 ? "team-A" : "team-B",
      atMs: 1000 + index * 1000,
      confidence: 0.3 + index / 10,
      provenance: {
        sourceKind: "observation",
        sourceRef: `source:${index + 1}`,
        capturedAt: "2026-10-13T00:00:00.000Z",
      },
    }),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * A slow-consumer port wrapper (P10-03 lane): the REAL adapter runs
 * behind it; `next()` is paced by the declared delay — the downstream
 * consumer's real pace. The adapter's bounded queue then fills exactly
 * as it would behind any slow consumer, and the typed refusal fires
 * through the frozen port surface.
 */
class SlowConsumerPort implements LiveSourcePort {
  private readonly inner: LiveSourcePort;
  private readonly paceMs: number;

  constructor(inner: LiveSourcePort, paceMs: number) {
    this.inner = inner;
    this.paceMs = paceMs;
  }

  async open(descriptor: LiveSourceDescriptor): Promise<ReturnType<LiveSourcePort["open"]>> {
    const opened = await this.inner.open(descriptor);
    if ("refusal" in opened) return opened;
    const handle = opened.handle;
    const pacedHandle: LiveSessionHandle = {
      next: async () => {
        await delay(this.paceMs);
        return handle.next();
      },
      close: (reason: "completed" | "aborted") => handle.close(reason),
      evidence: () => handle.evidence(),
    };
    return { handle: pacedHandle };
  }
}

/** A REAL recording wrapper over the real run service (execution counter only). */
class RecordingRunService extends TransformRunService {
  executions = 0;

  override async runPipeline(input: StartTransformRunInput): Promise<TransformRunManifest> {
    this.executions += 1;
    return super.runPipeline(input);
  }
}

function makeLiveRunService(): { live: LiveTransformRunService; runs: RecordingRunService } {
  const runs = new RecordingRunService({
    clock: new FixedClock(FIXED_TIME),
    hash: new Sha256TransformHash(),
    artifacts: new ArtifactGraphService({ now: () => FIXED_TIME }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models: new FixtureTransformModelAdapter(),
    deterministic: makeExecutor(makeStore()),
    components: makeStore(),
  });
  return { live: new LiveTransformRunService({ runs }), runs };
}

const baseRunInput = {
  manifest: makeManifest([makeTrimNode()]),
  workGraph: { workGraphId: "wg:test-live", runRef: "run:live-1" },
  parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
  releaseDigest: `sha256:${"f".repeat(64)}`,
};

const baseFeed = {
  artifactRef: "art:live-feed-1",
  rightsSnapshot: "rights:snapshot-1",
  provenance: feedProvenance,
};

test("REAL live run: a transform run over a live source pins LiveSessionEvidence graded real-local-live (P10-05)", async () => {
  const frames = ndjsonEventFrames(5);
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames });
  try {
    const { live } = makeLiveRunService();
    const run = await live.runLivePipeline({
      run: baseRunInput,
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
      feed: baseFeed,
    });

    // The deterministic lane REALLY ran over the drained live frames
    // (same content as the fixture feed: 3 kept, 2 dropped).
    assert.equal(run.steps.length, 1);
    assert.equal(run.steps[0]?.status, "succeeded");
    assert.ok(run.steps[0]!.timingMs > 0, "real child-process timing");
    assert.match(run.outputs[0]?.semanticEvidence ?? "", /3 kept byte-exact, 2 dropped/);
    assert.equal(run.semanticFidelity.grade, "measured", "the live grade never leaks into semanticFidelity");

    // The live evidence is pinned with the exact honest grade — never "production".
    assert.equal(run.liveSessions.length, 1);
    const evidence = run.liveSessions[0]!;
    assert.equal(evidence.descriptor.grade, "real-local-live", "the exact grade string is pinned");
    assert.equal(evidence.descriptor.sourceId, "live:match-1", "the session identity is pinned");
    assert.equal(evidence.framesConsumed, 5, "frame statistics are pinned");
    assert.equal(evidence.closeReason, "completed");
    assert.ok(evidence.closedAt !== null);
    assert.equal(evidence.refusal, null);
    assert.ok(!Number.isNaN(Date.parse(evidence.openedAt)), "openedAt is a real timestamp");

    // The record still satisfies the frozen TransformRunManifest shape
    // (structural assignability — the subtype IS the frozen manifest).
    const asFrozen: TransformRunManifest = run;
    assert.equal(asFrozen.runManifestId, run.runManifestId);
    assert.deepEqual(
      run.inputs,
      [{ artifactRef: "art:live-feed-1", rightsSnapshot: "rights:snapshot-1" }],
      "the live feed entered exactly like a fixture feed: pinned on inputs",
    );

    // Grade-label law: the word "production" appears nowhere in the pinned record.
    assert.ok(!JSON.stringify(run).includes("production"));
    // The live-source content really fed the pipeline: same digest as the
    // equivalent fixture feed bytes (eventStreamBytes is the same 5 events).
    const liveFeedEquivalence = new TextDecoder().decode(eventStreamBytes());
    assert.equal(
      frames.map((frame) => `${frame}\n`).join(""),
      liveFeedEquivalence,
      "the drained live frames are byte-identical to the canonical fixture feed",
    );
  } finally {
    await adapter.dispose();
  }
});

test("live-run failure lane: a queue-overflow mid-drain throws typed LiveIngressError with partial evidence and executes NO run", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(12) });
  try {
    const { live, runs } = makeLiveRunService();
    // A slow consumer (50ms pace) behind the real adapter with a 5ms cadence
    // and queueBound 1: the bounded queue overflows while the consumer waits.
    const slowConsumer = new SlowConsumerPort(adapter, 50);
    await assert.rejects(
      live.runLivePipeline({
        run: baseRunInput,
        liveSource: { port: slowConsumer, descriptor: { ...LIVE_DESCRIPTOR, cadenceMs: 5, queueBound: 1 } },
        feed: baseFeed,
      }),
      (error: unknown) => {
        assert.ok(error instanceof LiveIngressError, "the failure is the typed live-ingress error");
        assert.equal(error.refusal?.kind, "queue-overflow");
        assert.ok(error.evidence !== null, "the partial evidence is retained on the error");
        assert.equal(error.evidence!.closeReason, "refused");
        assert.equal(error.evidence!.refusal?.kind, "queue-overflow");
        assert.ok(error.evidence!.framesConsumed >= 0, "honest partial frame count");
        assert.match(error.message, /queue-overflow/);
        return true;
      },
    );
    assert.equal(runs.executions, 0, "NO run executed on a failed live source");
  } finally {
    await adapter.dispose();
  }
});

test("live-run abort lane: aborting mid-drain finalizes aborted evidence and executes NO run", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(50) });
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 60); // ~2 frames at 25ms cadence
  try {
    const { live, runs } = makeLiveRunService();
    await assert.rejects(
      live.runLivePipeline({
        run: { ...baseRunInput, signal: controller.signal },
        liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
        feed: baseFeed,
      }),
      (error: unknown) => {
        assert.ok(error instanceof LiveIngressError);
        assert.equal(error.refusal?.kind, "aborted");
        assert.ok(error.evidence !== null);
        assert.equal(error.evidence!.closeReason, "aborted", "an aborted session is never successful");
        assert.equal(error.evidence!.refusal, null);
        assert.ok(
          error.evidence!.framesConsumed >= 1 && error.evidence!.framesConsumed < 50,
          "honest partial frame count at the abort instant",
        );
        return true;
      },
    );
    assert.equal(runs.executions, 0, "NO run executed after a mid-drain abort");
    // The live server stopped with the session.
    assert.equal(adapter.activeBindings().length, 0);
  } finally {
    clearTimeout(abortTimer);
    await adapter.dispose();
  }
});

test("live-run validation lane: a malformed descriptor throws typed before any IO (no session, no run)", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(3) });
  try {
    const { live, runs } = makeLiveRunService();
    const malformedLanes: readonly { name: string; descriptor: unknown }[] = [
      { name: "grade production", descriptor: { ...LIVE_DESCRIPTOR, grade: "production" } },
      { name: "empty sourceId", descriptor: { ...LIVE_DESCRIPTOR, sourceId: "" } },
      { name: "zero queueBound", descriptor: { ...LIVE_DESCRIPTOR, queueBound: 0 } },
      { name: "NaN cadenceMs", descriptor: { ...LIVE_DESCRIPTOR, cadenceMs: Number.NaN } },
    ];
    for (const lane of malformedLanes) {
      await assert.rejects(
        live.runLivePipeline({
          run: baseRunInput,
          liveSource: { port: adapter, descriptor: lane.descriptor as LiveSourceDescriptor },
          feed: baseFeed,
        }),
        (error: unknown) => {
          assert.ok(error instanceof LiveIngressError, `lane "${lane.name}" throws the typed error`);
          assert.equal(error.refusal?.kind, "invalid-descriptor");
          assert.equal(error.evidence, null, "nothing opened — no evidence to retain");
          return true;
        },
        `lane "${lane.name}" must reject`,
      );
    }
    assert.equal(runs.executions, 0);
    assert.equal(adapter.activeBindings().length, 0, "no session was ever opened");
  } finally {
    await adapter.dispose();
  }
});

test("live-run composition law: the live leg composes THROUGH the existing run service (no second runtime)", async () => {
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(5) });
  try {
    const { live, runs } = makeLiveRunService();
    const run: LiveTransformRunManifest = await live.runLivePipeline({
      run: baseRunInput,
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
      feed: baseFeed,
    });
    assert.equal(runs.executions, 1, "exactly ONE execution through the existing run service");
    // The run service's own ledger holds the same manifest — the single authority.
    const ledgerRun = runs.readRun(run.runManifestId);
    assert.ok(ledgerRun !== null);
    assert.equal(ledgerRun.runManifestId, run.runManifestId);
    assert.deepEqual(ledgerRun.steps, run.steps);
    assert.deepEqual(ledgerRun.outputs, run.outputs, "identical outputs — no duplicated execution");
  } finally {
    await adapter.dispose();
  }
});
