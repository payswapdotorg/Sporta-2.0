/**
 * W10C-1 / P10-16 — the composed vertical slice: ONE lineage from a
 * REAL marketplace admission through a REAL local live source into a
 * REAL transform run whose model node calls the REAL sandbox model
 * service (packages/web, node:test + tsx — the project law; the ONLY
 * package whose tests may import the real SDK adapter, P10-18).
 *
 * EVIDENCE CLASS (the project vocabulary, per leg):
 *   - Marketplace admission legs (submission -> automated gates ->
 *     3-role review -> publish -> entitlement -> disclosure ->
 *     selectForLaunch): REAL services and REAL laws (sha256 digest
 *     freezing, the w9a graph validator, the fail-closed admission
 *     ladder, digest byte-equality listing -> disclosure -> admission)
 *     over the package's own honestly-labeled in-memory stores and
 *     FIXTURE reviewer identities (the sporta-marketplace makeWorld
 *     precedent, reconstructed from the public contract entrypoint).
 *   - Live source leg: REAL (real-local-live) — a REAL node:http
 *     streaming server on a real ephemeral port at the declared
 *     cadence + the real client consumption leg (the
 *     liveIngressRun.test.ts pattern).
 *   - Model leg: REAL-or-typed-refusal — the REAL `SandboxModelAdapter`
 *     default client (a REAL network chat-completion through
 *     z-ai-web-dev-sdk). The QUOTA-DEGRADATION LAW (P10-16, binding):
 *     the test detects the regime from the ACTUAL invocation result
 *     (never an env flag) — happy regime asserts BOTH real grades
 *     pinned; refused regime asserts the run degraded to the
 *     deterministic-node variant THROUGH the declared-fallback seam
 *     with the typed refusal recorded — never silently, and NO
 *     real-model output is ever claimed on a refusal. Because the
 *     refused arm of the main test fires only when the live service
 *     actually refuses, TWO deterministic proofs pin the degradation
 *     law's arms regardless of the station's quota state (both replay
 *     the real service's own HTTP 429 error class at the adapter's
 *     documented client-injection seam — FIXTURE at the client seam
 *     only, the W10B-2 precedent; no live refusal is claimed): the
 *     refused-arm proof (declared-fallback graph ⇒ fallback-used +
 *     typed refusal + the deterministic-node variant output) and the
 *     no-fallback guard (fail-closed graph ⇒ typed failure, never a
 *     silent swap — P9-05 at the composition seam).
 *   - Deterministic lane: REAL (a real child process per step).
 *   - Artifact persistence: fixture-grade IN-MEMORY blob store — the
 *     exact adapters the liveIngressRun.test.ts precedent uses for
 *     run-composition proofs (real artifact fabric, in-memory blobs).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArtifactGraphService, InMemoryArtifactBlobStore } from "@sporta/artifacts/contract";
import {
  DeterministicFilterNodeAdapter,
  LiveTransformRunService,
  RealLocalHttpLiveSourceAdapter,
  Sha256TransformHash,
  TransformRunService,
} from "@sporta/transforms/contract";
import type {
  LiveSourceDescriptor,
  LiveTransformRunManifest,
  TransformStepResult,
} from "@sporta/transforms/contract";
import { SPORTA_HOST_POLICY } from "../src/sporta/hostSeeds.js";
import {
  SANDBOX_MODEL_PROVIDER_ID,
  SANDBOX_MODEL_PROVIDER_LABEL,
  SandboxModelAdapter,
} from "../src/sporta/providers/sandboxModelAdapter.js";
import type {
  SandboxChatCompletionClient,
  SandboxChatCompletionRequest,
} from "../src/sporta/providers/sandboxModelAdapter.js";
import {
  COMPOSED_PIPELINE_ID,
  COMPOSED_VERSION,
  LIVE_FEED_PROVENANCE,
  MARKET_FIXED_NOW,
  MODEL_NODE_ID,
  TRIM_NODE_ID,
  admitComposedPipeline,
  makeComposedManifest,
  makeComponentStore,
  makeMarketplaceWorld,
} from "./support/composedSliceWorld.js";

/** The frozen typed-refusal kind set (asserted in the refused regime). */
const MODEL_REFUSAL_KINDS: readonly string[] = [
  "provider-unavailable",
  "quota-exhausted",
  "credentials-missing",
  "policy-denied",
  "unsupported-operation",
];

const LIVE_DESCRIPTOR: LiveSourceDescriptor = {
  sourceId: "live:match-w10c",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};

/** Deterministic NDJSON event frames (the liveIngressRun.test.ts shape). */
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
        capturedAt: "2026-10-15T00:00:00.000Z",
      },
    }),
  );
}

/**
 * The run leg construction: the EXISTING `TransformRunService` with the
 * model port injected (the W10B-4 seam) and the REAL deterministic
 * child-process lane; the live composition rides ON TOP of it.
 */
function makeRunService(models: SandboxModelAdapter): TransformRunService {
  const hash = new Sha256TransformHash();
  const store = makeComponentStore();
  return new TransformRunService({
    clock: { now: () => MARKET_FIXED_NOW },
    hash,
    artifacts: new ArtifactGraphService({ now: () => MARKET_FIXED_NOW }),
    blobs: new InMemoryArtifactBlobStore((bytes) => hash.bytes(bytes)),
    models, // the frozen TransformModelPort seam — the ONLY way the run sees the provider
    deterministic: new DeterministicFilterNodeAdapter({ store }),
    components: store,
  });
}

/** The pinned live-session evidence assertions (both regimes, both tests). */
function assertLiveEvidencePinned(run: LiveTransformRunManifest): void {
  assert.equal(run.liveSessions.length, 1, "exactly one live session pinned");
  const evidence = run.liveSessions[0]!;
  assert.equal(evidence.descriptor.grade, "real-local-live", "the EXACT live grade string is pinned");
  assert.equal(evidence.descriptor.sourceId, "live:match-w10c", "the session identity is pinned");
  assert.equal(evidence.framesConsumed, 5, "the frame statistics are pinned");
  assert.equal(evidence.closeReason, "completed");
  assert.equal(evidence.refusal, null);
  assert.ok(!Number.isNaN(Date.parse(evidence.openedAt)), "openedAt is a real timestamp");
  // Real cadence bound: 5 frames at the declared 25ms cadence span a real
  // wall-clock window on the client (>= 80% of 4 inter-frame gaps).
  const openedMs = Date.parse(evidence.openedAt);
  const closedMs = Date.parse(evidence.closedAt ?? "");
  assert.ok(
    Number.isFinite(closedMs) && closedMs - openedMs >= 0.8 * 4 * LIVE_DESCRIPTOR.cadenceMs,
    `REAL declared cadence observed (session span ${(closedMs - openedMs).valueOf()}ms for 5 frames @ ${LIVE_DESCRIPTOR.cadenceMs}ms)`,
  );
}

/** The deterministic-lane assertions (REAL child process, both regimes). */
function assertDeterministicLaneReal(run: LiveTransformRunManifest): TransformStepResult {
  const trimStep = run.steps.find((step) => step.nodeId === TRIM_NODE_ID);
  assert.ok(trimStep !== undefined, "the deterministic step ran");
  assert.equal(trimStep.status, "succeeded");
  assert.ok(trimStep.timingMs > 0, `the child-process timing is MEASURED (got ${trimStep.timingMs}ms)`);
  const trimRevision = run.outputs.find((output) =>
    output.semanticEvidence.includes("3 kept byte-exact, 2 dropped"),
  );
  assert.ok(
    trimRevision !== undefined,
    "the deterministic lane REALLY ran over the drained live frames (3 kept, 2 dropped)",
  );
  assert.match(trimRevision.artifactRevisionId, /^rev:/);
  return trimStep;
}

test("W10C-1 P10-16 composed slice: live source through REAL admission into a REAL model-node run — both grades pinned, quota degradation honest", async () => {
  // Honest labels spot-check (P10-09/P10-15 — the shared vocabulary).
  assert.equal(SANDBOX_MODEL_PROVIDER_ID, "zai:glm-sandbox");
  assert.equal(SANDBOX_MODEL_PROVIDER_LABEL, "real sandbox model service");
  assert.equal(SPORTA_HOST_POLICY.rights.usages.includes("derive"), true, "the host policy is the real seed");

  // ---- 1. Marketplace admission (REAL lifecycle; fixture stores/reviewers) ----
  const manifest = makeComposedManifest("declared-fallback");
  const world = makeMarketplaceWorld();
  const admitted = await admitComposedPipeline(world, manifest);

  const graphCheck = admitted.lane.results.find((result) => result.checkId === "graph-validation");
  assert.equal(graphCheck?.outcome, "pass", "the REAL w9a validator passed the composed graph");
  assert.match(graphCheck?.detail ?? "", /2 nodes, 1 edges/);
  assert.equal(
    admitted.lane.results.every((result) => result.outcome !== "fail"),
    true,
    "zero failed gate checks (the zero-failed-gates law)",
  );
  assert.equal(admitted.decision.outcome, "approved");
  assert.deepEqual(
    admitted.decision.humanReview.map((entry) => entry.role),
    ["product", "rights", "security"],
    "the 3-role review signed off",
  );
  assert.equal(admitted.listing.status, "PUBLISHED");

  // THE digest byte-equality chain: decision -> listing -> disclosure ->
  // admission (the audit anchor the run will pin).
  assert.equal(admitted.listing.currentRelease.releaseDigest, admitted.decision.candidateDigest);
  assert.equal(admitted.disclosure.releaseDigest, admitted.listing.currentRelease.releaseDigest);
  assert.deepEqual(
    admitted.disclosure.dependencies.map((dependency) => dependency.name),
    ["json-event-stream-trim", "glm-sandbox-summarizer"],
    "the disclosure never hides dependencies (P9-12)",
  );
  assert.match(admitted.disclosure.legalNotice, /never implies legal clearance/);
  assert.equal(admitted.selection.admitted, true, "selectForLaunch admits the entitled principal");
  const admittedDigest = admitted.selection.admitted ? admitted.selection.releaseDigest : null;
  assert.ok(admittedDigest !== null);
  assert.equal(admittedDigest, admitted.disclosure.releaseDigest, "digest byte-equality disclosure -> admission");
  console.log("W10C-1 ADMISSION REAL EVIDENCE:");
  console.log(`- admitted digest (byte-equal decision -> listing -> disclosure -> admission): ${admittedDigest!.slice(0, 19)}…`);

  // The run executes the manifest resolved through the SAME read port the
  // marketplace certified — never a second, divergent copy.
  const runManifest = world.manifests.read(manifest.pipelineId, manifest.version, manifest.manifestDigest);
  assert.ok(runManifest !== null, "the manifest resolves through the marketplace read port by digest");
  assert.deepEqual(runManifest, manifest);

  // ---- 2 + 3. The REAL run: live source -> existing run service -> REAL model port ----
  const runs = makeRunService(new SandboxModelAdapter()); // DEFAULT path: the REAL SDK client
  const live = new LiveTransformRunService({ runs });
  const frames = ndjsonEventFrames(5);
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames });
  try {
    const run = await live.runLivePipeline({
      run: {
        manifest: runManifest,
        workGraph: { workGraphId: "wg:w10c-composed", runRef: "run:w10c-composed-1" },
        parameters: { [TRIM_NODE_ID]: { startMs: 1500, endMs: 4500 }, [MODEL_NODE_ID]: {} },
        releaseDigest: admittedDigest!, // the audit anchor: the admitted release
      },
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
      feed: {
        artifactRef: "art:w10c-live-feed-1",
        rightsSnapshot: "rights:w10c-snapshot-1",
        provenance: LIVE_FEED_PROVENANCE,
      },
    });

    // ---- 4. The manifest pins BOTH legs' evidence ----
    assertLiveEvidencePinned(run);
    const trimStep = assertDeterministicLaneReal(run);
    assert.deepEqual(
      run.inputs,
      [{ artifactRef: "art:w10c-live-feed-1", rightsSnapshot: "rights:w10c-snapshot-1" }],
      "the live feed entered exactly like a fixture feed: pinned on inputs",
    );
    assert.equal(run.release.releaseDigest, admittedDigest, "the run manifest pins the ADMITTED digest");
    assert.equal(run.release.pipelineId, COMPOSED_PIPELINE_ID);
    assert.equal(run.release.version, COMPOSED_VERSION);
    assert.equal(run.semanticFidelity.grade, "measured", "the deterministic lane re-verified carry-forward in-process");
    assert.ok(!JSON.stringify(run).includes("production"), "grade-label law: 'production' is unutterable");
    const ledgerRun = runs.readRun(run.runManifestId);
    assert.ok(ledgerRun !== null, "the run service's own ledger holds the record (single authority)");
    assert.deepEqual(ledgerRun.steps, run.steps);
    assert.deepEqual(ledgerRun.outputs, run.outputs);
    assert.equal(ledgerRun.release.releaseDigest, run.release.releaseDigest);

    // ---- 5. THE QUOTA-DEGRADATION LAW: the regime comes from the ACTUAL result ----
    const modelStep = run.steps.find((step) => step.nodeId === MODEL_NODE_ID);
    assert.ok(modelStep !== undefined, "the model step ran");
    if (modelStep.status === "succeeded") {
      // HAPPY regime (quota available): the model step's REAL evidence is
      // pinned — BOTH real grades in ONE manifest.
      assert.ok(modelStep.timingMs > 0, `the REAL network latency is MEASURED (got ${modelStep.timingMs}ms)`);
      assert.equal(modelStep.cost, null, "honest cost: the service reports none");
      assert.match(
        modelStep.detail,
        /^real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/,
      );
      const modelRevision = run.outputs.find((output) =>
        output.semanticEvidence.startsWith("real model lane: real sandbox model service"),
      );
      assert.ok(modelRevision !== undefined, "one REAL-model output revision through the artifact fabric");
      assert.match(modelRevision.artifactRevisionId, /^rev:/);
      assert.ok(
        run.outputs.every((output) => !output.semanticEvidence.startsWith("fallback lane:")),
        "no fallback output exists in the happy regime",
      );
      console.log("W10C-1 composed slice — HAPPY regime measured on this pod:");
      console.log(`- model step: REAL network call, latency=${modelStep.timingMs}ms, grade real, cost null`);
      console.log(`- deterministic step: REAL child process, latency=${trimStep.timingMs}ms`);
      console.log(`- live session: real-local-live, 5 frames @ ${LIVE_DESCRIPTOR.cadenceMs}ms cadence`);
    } else if (modelStep.status === "fallback-used") {
      // REFUSED regime (the typed quota-exhausted / provider-unavailable
      // refusal): the run degraded to the deterministic-node variant
      // THROUGH the declared-fallback seam — recorded, never silent.
      const refusalKind = /^fallback used after model refusal \(([a-z-]+): /.exec(modelStep.detail)?.[1];
      assert.ok(
        refusalKind !== undefined && MODEL_REFUSAL_KINDS.includes(refusalKind),
        `the TYPED model refusal is recorded in the manifest (got kind: ${refusalKind})`,
      );
      assert.match(modelStep.detail, /; declared contract: /, "the declared fallback contract is cited");
      assert.equal(modelStep.cost, null);
      const fallbackRevision = run.outputs.find((output) =>
        output.semanticEvidence.startsWith("fallback lane: identity pass-through"),
      );
      assert.ok(
        fallbackRevision !== undefined,
        "the degradation output is the deterministic-node variant (identity pass-through)",
      );
      assert.match(fallbackRevision.semanticEvidence, new RegExp(`^fallback lane: identity pass-through after ${refusalKind}: `));
      assert.ok(
        run.outputs.every((output) => !output.semanticEvidence.startsWith("real model lane:")),
        "NO real-model output is claimed on a refusal",
      );
      assert.ok(modelStep.timingMs >= 0, "the refused invocation's latency is still measured honestly");
      console.log("W10C-1 composed slice — REFUSED regime measured on this pod:");
      console.log(`- typed model refusal recorded: ${refusalKind} (latency ${modelStep.timingMs}ms)`);
      console.log(`- degraded to the deterministic-node variant via fallback-used; live grade stays real-local-live`);
    } else {
      assert.fail(
        `the model step must be "succeeded" (happy) or "fallback-used" (refused) — never a silent third state (got "${modelStep.status}": ${modelStep.detail})`,
      );
    }

    // Teardown law: the session's real server stopped with the run.
    assert.equal(adapter.activeBindings().length, 0, "the live server stopped — the ephemeral port is released");
  } finally {
    await adapter.dispose();
  }
});

/** A recording client that refuses with the SDK-shaped HTTP 429 lane (FIXTURE-labeled stand-in for the guard test). */
class RateLimitedRecordingClient implements SandboxChatCompletionClient {
  readonly calls: SandboxChatCompletionRequest[] = [];
  async createChatCompletion(request: SandboxChatCompletionRequest): Promise<never> {
    this.calls.push({
      messages: [...request.messages],
      ...(request.model !== undefined ? { model: request.model } : {}),
      ...(request.thinking !== undefined ? { thinking: request.thinking } : {}),
    });
    throw new Error("API request failed with status 429: rate limited (w10c guard-lane recording stand-in)");
  }
}

test("W10C-1 P10-16 degradation guard: a NO-fallback composed graph records the typed model failure — never a silent swap (P9-05 at the composition seam)", async () => {
  // The same composed slice, but the model node declares fail-closed (no
  // fallback) and the client seam is a recording stand-in refusing with
  // the SDK-shaped HTTP 429 lane — DETERMINISTIC regardless of quota, so
  // the no-fallback law is pinned by named test. The marketplace
  // lifecycle, live source, and deterministic lane remain REAL.
  const manifest = makeComposedManifest("fail-closed");
  const world = makeMarketplaceWorld();
  const admitted = await admitComposedPipeline(world, manifest);
  assert.equal(admitted.selection.admitted, true, "admission is error-mode-independent");
  const admittedDigest = admitted.selection.admitted ? admitted.selection.releaseDigest : null;
  assert.ok(admittedDigest !== null);

  const refusingClient = new RateLimitedRecordingClient();
  const runs = makeRunService(new SandboxModelAdapter({ client: refusingClient }));
  const live = new LiveTransformRunService({ runs });
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(5) });
  try {
    const run = await live.runLivePipeline({
      run: {
        manifest,
        workGraph: { workGraphId: "wg:w10c-guard", runRef: "run:w10c-guard-1" },
        parameters: { [TRIM_NODE_ID]: { startMs: 1500, endMs: 4500 }, [MODEL_NODE_ID]: {} },
        releaseDigest: admittedDigest!,
      },
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
      feed: {
        artifactRef: "art:w10c-guard-live-feed-1",
        rightsSnapshot: "rights:w10c-snapshot-1",
        provenance: LIVE_FEED_PROVENANCE,
      },
    });

    // The live leg is STILL real and pinned; the deterministic lane ran.
    assertLiveEvidencePinned(run);
    assertDeterministicLaneReal(run);
    assert.equal(run.release.releaseDigest, admittedDigest);

    // The model step is the TYPED FAILURE — a no-fallback graph never
    // silently swaps in a substitute output.
    const modelStep = run.steps.find((step) => step.nodeId === MODEL_NODE_ID);
    assert.ok(modelStep !== undefined);
    assert.equal(modelStep.status, "typed-failure", "no fallback declared ⇒ the refusal is a typed failure");
    assert.match(
      modelStep.detail,
      /^model refusal — quota-exhausted: sandbox model service quota exhausted \(HTTP 429\)/,
    );
    assert.equal(run.outputs.length, 1, "only the deterministic revision was committed — no substitute output");
    assert.ok(
      run.outputs.every((output) => !output.semanticEvidence.startsWith("real model lane:")),
      "a refused invocation NEVER claims real-model output",
    );
    assert.ok(
      !JSON.stringify(run.steps).includes("fallback-used"),
      "no fallback is recorded anywhere in the steps",
    );

    // The composition really chained: the model prompt IS the deterministic
    // lane's output over the drained live frames (the recording client's
    // captured request — one attempt, no retries).
    assert.equal(refusingClient.calls.length, 1, "exactly one chat-completion attempt");
    const sent = refusingClient.calls[0];
    assert.ok(sent !== undefined);
    assert.deepEqual(sent.messages.map((message) => message.role), ["system", "user"]);
    const prompt = sent.messages[1]?.content ?? "";
    assert.ok(
      prompt.includes('"evt-2"') && prompt.includes('"evt-3"') && prompt.includes('"evt-4"'),
      "the in-window live events reached the model lane through the deterministic output",
    );
    assert.ok(
      !prompt.includes('"evt-1"') && !prompt.includes('"evt-5"'),
      "out-of-window live events never reach the model lane",
    );
    assert.deepEqual(sent.thinking, { type: "disabled" });

    assert.equal(adapter.activeBindings().length, 0, "the live server stopped — the ephemeral port is released");
  } finally {
    await adapter.dispose();
  }
});

test("W10C-1 P10-16 refused-regime proof (deterministic): the service's 429 class degrades the slice to the deterministic-node variant — typed refusal + fallback-used recorded, live grade intact, no real-model output claimed", async () => {
  // The MAIN test's refused arm fires only when the live service actually
  // refuses (it did NOT on this pod — the happy regime measured). This
  // proof pins that arm DETERMINISTICALLY: the same composed lineage
  // (declared-fallback manifest, full REAL admission, REAL live source,
  // REAL deterministic lane) with the adapter's documented client-injection
  // seam replaying the real service's own HTTP 429 error class — the exact
  // input the W10B-2 classification lane types as quota-exhausted. Labeled
  // FIXTURE at the client seam only; no real network refusal is claimed.
  const manifest = makeComposedManifest("declared-fallback");
  const world = makeMarketplaceWorld();
  const admitted = await admitComposedPipeline(world, manifest);
  assert.equal(admitted.selection.admitted, true);
  const admittedDigest = admitted.selection.admitted ? admitted.selection.releaseDigest : null;
  assert.ok(admittedDigest !== null);

  const refusingClient = new RateLimitedRecordingClient();
  const runs = makeRunService(new SandboxModelAdapter({ client: refusingClient }));
  const live = new LiveTransformRunService({ runs });
  const adapter = new RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(5) });
  try {
    const run = await live.runLivePipeline({
      run: {
        manifest,
        workGraph: { workGraphId: "wg:w10c-refused", runRef: "run:w10c-refused-1" },
        parameters: { [TRIM_NODE_ID]: { startMs: 1500, endMs: 4500 }, [MODEL_NODE_ID]: {} },
        releaseDigest: admittedDigest!,
      },
      liveSource: { port: adapter, descriptor: LIVE_DESCRIPTOR },
      feed: {
        artifactRef: "art:w10c-refused-live-feed-1",
        rightsSnapshot: "rights:w10c-snapshot-1",
        provenance: LIVE_FEED_PROVENANCE,
      },
    });

    // The live grade is STILL real-local-live — the refusal degrades the
    // MODEL lane only, never the live evidence.
    assertLiveEvidencePinned(run);
    assertDeterministicLaneReal(run);
    assert.equal(run.release.releaseDigest, admittedDigest, "the admitted digest is still the run's anchor");

    // The degradation went THROUGH the declared-fallback seam: the step
    // records fallback-used + the TYPED refusal, and the run CONTINUED
    // (two committed revisions: deterministic + degraded pass-through).
    const modelStep = run.steps.find((step) => step.nodeId === MODEL_NODE_ID);
    assert.ok(modelStep !== undefined);
    assert.equal(modelStep.status, "fallback-used", "the declared-fallback seam degraded the run");
    const refusalKind = /^fallback used after model refusal \(([a-z-]+): /.exec(modelStep.detail)?.[1];
    assert.equal(refusalKind, "quota-exhausted", "the typed refusal kind is recorded exactly");
    assert.match(
      modelStep.detail,
      /^fallback used after model refusal \(quota-exhausted: sandbox model service quota exhausted \(HTTP 429\)/,
    );
    assert.match(modelStep.detail, /; declared contract: /, "the declared fallback contract is cited");
    assert.equal(modelStep.cost, null, "no cost on a refused invocation");
    assert.equal(run.outputs.length, 2, "the run continued past the refusal: deterministic + degraded revisions");
    const fallbackRevision = run.outputs.find((output) =>
      output.semanticEvidence.startsWith("fallback lane: identity pass-through"),
    );
    assert.ok(
      fallbackRevision !== undefined,
      "the degradation output IS the deterministic-node variant (identity pass-through)",
    );
    assert.match(fallbackRevision.artifactRevisionId, /^rev:/);
    assert.ok(
      run.outputs.every((output) => !output.semanticEvidence.startsWith("real model lane:")),
      "NO real-model output is claimed on a refusal",
    );
    assert.equal(run.semanticFidelity.grade, "measured", "the deterministic lane's measurement survives the degradation");

    // The refusal was REAL evidence at the port: one chat-completion attempt
    // whose prompt was the deterministic trim of the drained live frames.
    assert.equal(refusingClient.calls.length, 1, "exactly one chat-completion attempt — no retries");
    const prompt = refusingClient.calls[0]?.messages[1]?.content ?? "";
    assert.ok(
      prompt.includes('"evt-2"') && prompt.includes('"evt-3"') && prompt.includes('"evt-4"'),
      "the in-window live events reached the refused model invocation",
    );
    assert.ok(!prompt.includes('"evt-1"') && !prompt.includes('"evt-5"'));

    assert.equal(adapter.activeBindings().length, 0, "the live server stopped — the ephemeral port is released");
    console.log(
      "W10C-1 refused-regime proof (deterministic 429 injection): fallback-used + typed quota-exhausted refusal recorded; degraded output = the deterministic-node variant",
    );
  } finally {
    await adapter.dispose();
  }
});
