/**
 * W10B-2/W10B-3/W10B-4 — the REAL sandbox model adapter tests
 * (packages/web, node:test + tsx — the project law; no new framework).
 *
 * EVIDENCE CLASS (labeled per test in its name):
 *   - REAL: the "REAL network invocation" test (one real chat-completion
 *     through the REAL z-ai-web-dev-sdk default path — measured latency,
 *     honest cost) and the port-injection test's model step (a REAL
 *     TransformRunService run whose model node makes a REAL network call).
 *   - FIXTURE (recording clients, labeled): the port-conformance,
 *     honest-label, and every refusal-lane test — the CLIENT seam is a
 *     recording stand-in while the ADAPTER under test is the real one;
 *     no fixture output is ever reported as real evidence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FixtureTransformModelAdapter,
  TransformRunService,
  Sha256TransformHash,
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
} from "@sporta/transforms/contract";
import type {
  TransformModelInvokeInput,
  TransformModelInvokeOutput,
  TransformModelRefusalKind,
} from "@sporta/transforms/contract";
import { ArtifactGraphService, SystemClock as ArtifactSystemClock } from "@sporta/artifacts/contract";
import {
  SandboxModelAdapter,
  SANDBOX_MODEL_PROVIDER_ID,
  SANDBOX_MODEL_PROVIDER_LABEL,
} from "../src/sporta/providers/sandboxModelAdapter.js";
import type {
  SandboxChatCompletionClient,
  SandboxChatCompletionRequest,
} from "../src/sporta/providers/sandboxModelAdapter.js";
import { SPORTA_HOST_POLICY } from "../src/sporta/hostSeeds.js";

const MODEL_REF = { name: "glm-sandbox-summarizer", digest: `sha256:${"7".repeat(64)}` };
const REFUSAL_KINDS: readonly string[] = [
  "provider-unavailable", "quota-exhausted", "credentials-missing", "policy-denied", "unsupported-operation",
];
const FIXED_NOW = "2026-10-14T12:00:00.000Z";

/** A tiny valid NDJSON event-stream prompt (the fixture lane's input law). */
const NDJSON_PROMPT = [
  JSON.stringify({ eventId: "evt-1", entityId: "team-A", atMs: 1000, confidence: 0.5 }),
  JSON.stringify({ eventId: "evt-2", entityId: "team-B", atMs: 2000, confidence: 0.7 }),
].join("\n");

function invokeInput(prompt: string, parameters: Readonly<Record<string, unknown>> = {}): TransformModelInvokeInput {
  return { modelRef: MODEL_REF, prompt, parameters };
}

/** The frozen port's behavioral law — BOTH adapters must satisfy this (P10-06). */
function assertPortLaw(result: TransformModelInvokeOutput, expectedGrade: "real" | "fixture"): void {
  assert.equal(result.evidenceGrade, expectedGrade, "the grade is the adapter's honesty contract");
  assert.equal(typeof result.providerId, "string", "providerId is a string");
  assert.ok(result.providerId.length > 0, "providerId is non-empty");
  assert.equal(typeof result.timingMs, "number", "timingMs is a number");
  assert.ok(Number.isFinite(result.timingMs) && result.timingMs >= 0, "timingMs is a measured finite value");
  assert.equal(typeof result.detail, "string", "detail is a string");
  assert.ok(result.detail.length > 0, "detail is non-empty");
  if (result.output !== null) {
    assert.equal(typeof result.output, "string", "output is a string exactly when not refused");
    assert.ok(result.output.length > 0, "output is non-empty");
    assert.equal(result.refusal, null, "no refusal when output exists (XOR law)");
  } else {
    assert.ok(result.refusal !== null, "refusal exists when output is null (XOR law)");
    assert.ok(REFUSAL_KINDS.includes(result.refusal.kind), `refusal kind is in the frozen set (got ${result.refusal.kind})`);
    assert.ok(result.refusal.detail.length > 0, "refusal detail is non-empty");
    assert.equal(result.cost, null, "no cost is reported on a refused invocation");
  }
}

/** A recording client: captures requests, plays the configured behavior (labeled FIXTURE stand-in for refusal lanes). */
class RecordingClient implements SandboxChatCompletionClient {
  readonly calls: SandboxChatCompletionRequest[] = [];
  readonly #behavior: (request: SandboxChatCompletionRequest) => Promise<unknown>;
  constructor(behavior: (request: SandboxChatCompletionRequest) => Promise<unknown>) {
    this.#behavior = behavior;
  }
  async createChatCompletion(request: SandboxChatCompletionRequest): Promise<unknown> {
    this.calls.push({
      messages: [...request.messages],
      ...(request.model !== undefined ? { model: request.model } : {}),
      ...(request.thinking !== undefined ? { thinking: request.thinking } : {}),
    });
    return this.#behavior(request);
  }
}

/** A well-formed completion response (the shape the real service returns). */
function completion(content: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], ...extra };
}

test("W10B-1 port conformance: the REAL sandbox adapter and the fixture adapter satisfy the same TransformModelPort behavioral law", async () => {
  const recording = new RecordingClient(async () => completion("recorded summary content"));
  const sandbox = new SandboxModelAdapter({ client: recording });
  const fixture = new FixtureTransformModelAdapter();
  const sandboxResult = await sandbox.invokeModel(invokeInput(NDJSON_PROMPT));
  const fixtureResult = await fixture.invokeModel(invokeInput(NDJSON_PROMPT));
  assertPortLaw(sandboxResult, "real");
  assertPortLaw(fixtureResult, "fixture");
  // Same input shape, both succeed through the port; grades differ honestly.
  assert.equal(sandboxResult.output, "recorded summary content");
  assert.ok(fixtureResult.output !== null);
  // The request the adapter actually sent: the declared lane system message + the port's prompt, thinking disabled.
  assert.equal(recording.calls.length, 1, "one chat-completion call per invocation");
  const sent = recording.calls[0];
  assert.ok(sent !== undefined);
  assert.deepEqual(
    sent.messages.map((message) => message.role),
    ["system", "user"],
  );
  assert.equal(sent.messages[1]?.content, NDJSON_PROMPT, "the port's prompt is the user payload, verbatim");
  assert.deepEqual(sent.thinking, { type: "disabled" });
  assert.equal(sent.model, undefined, "no model parameter was fabricated (none was provided)");
});

test("W10B-1 honest labels + cost law: exact providerId/grade/label; cost null unless the service reports one", async () => {
  assert.equal(SANDBOX_MODEL_PROVIDER_ID, "zai:glm-sandbox");
  assert.equal(SANDBOX_MODEL_PROVIDER_LABEL, "real sandbox model service");
  // Unreported cost (plus a service-reported usage surfaced as DETAIL evidence, never cost).
  const plain = new SandboxModelAdapter({
    client: new RecordingClient(async () => completion("summary", { usage: { total_tokens: 52 } })),
  });
  const plainResult = await plain.invokeModel(invokeInput(NDJSON_PROMPT));
  assertPortLaw(plainResult, "real");
  assert.equal(plainResult.providerId, "zai:glm-sandbox");
  assert.equal(plainResult.cost, null, "no cost reported by the service ⇒ cost is honestly null");
  assert.match(plainResult.detail, /^real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/);
  assert.match(plainResult.detail, /service-reported usage total_tokens: 52/);
  // Service-reported cost is surfaced VERBATIM.
  const charged = new SandboxModelAdapter({
    client: new RecordingClient(async () => completion("summary", { cost: { amount: 0.001, currency: "USD" } })),
  });
  const chargedResult = await charged.invokeModel(invokeInput(NDJSON_PROMPT));
  assert.deepEqual(chargedResult.cost, { amount: 0.001, currency: "USD" }, "a machine-readable service cost is reported verbatim");
  // A non-machine-readable cost field is NOT fabricated into a number.
  const malformedCost = new SandboxModelAdapter({
    client: new RecordingClient(async () => completion("summary", { cost: { amount: "cheap" } })),
  });
  assert.equal((await malformedCost.invokeModel(invokeInput(NDJSON_PROMPT))).cost, null);
});

test("W10B-2 refusal lane (unreachable): a thrown network error is a typed provider-unavailable refusal — never fabricated output, never a fixture downgrade", async () => {
  const adapter = new SandboxModelAdapter({
    client: new RecordingClient(async () => {
      throw new Error("fetch failed: getaddrinfo ENOTFOUND internal-api.z.ai");
    }),
  });
  const result = await adapter.invokeModel(invokeInput(NDJSON_PROMPT));
  assertPortLaw(result, "real"); // the outage law: grade stays real, port law intact
  assert.equal(result.output, null, "an outage NEVER fabricates output");
  assert.equal(result.refusal?.kind, "provider-unavailable");
  assert.match(result.refusal?.detail ?? "", /sandbox model service unreachable: .*ENOTFOUND/);
  assert.equal(result.evidenceGrade, "real", "an outage NEVER silently becomes a fixture (ADR rule 14)");
  assert.equal(result.cost, null);
});

test("W10B-2 refusal lane (timeout): a hung service yields a typed provider-unavailable refusal after the real wall-clock deadline", async () => {
  const adapter = new SandboxModelAdapter({
    timeoutMs: 60,
    client: new RecordingClient(() => new Promise<never>(() => {})), // never settles
  });
  const result = await adapter.invokeModel(invokeInput(NDJSON_PROMPT));
  assertPortLaw(result, "real");
  assert.equal(result.output, null);
  assert.equal(result.refusal?.kind, "provider-unavailable");
  assert.match(result.refusal?.detail ?? "", /sandbox model service timed out after 60ms/);
  assert.ok(result.timingMs >= 55, `latency is MEASURED (waited the real deadline; got ${result.timingMs}ms)`);
  assert.ok(result.timingMs < 5_000, "the deadline is bounded (no unbounded wait)");
});

test("W10B-2 refusal lane (malformed): an unusable completion shape is a typed unsupported-operation refusal", async () => {
  const cases: readonly [string, unknown][] = [
    ["response is a string", "not-an-object"],
    ["response has no choices", {}],
    ["first choice has no message", { choices: [{}] }],
    ["first choice has no usable content", { choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }] }],
  ];
  for (const [label, response] of cases) {
    const adapter = new SandboxModelAdapter({ client: new RecordingClient(async () => response) });
    const result = await adapter.invokeModel(invokeInput(NDJSON_PROMPT));
    assertPortLaw(result, "real");
    assert.equal(result.output, null, `${label}: no output is fabricated`);
    assert.equal(result.refusal?.kind, "unsupported-operation", `${label}: typed malformed refusal`);
    assert.match(result.refusal?.detail ?? "", /malformed response from the sandbox model service/);
  }
});

test("W10B-2 refusal lane (content refusal): a service-declared content filter is a typed policy-denied refusal", async () => {
  const filtered = new SandboxModelAdapter({
    client: new RecordingClient(async () => ({
      choices: [{ message: { role: "assistant", refusal: "content violates usage policy" }, finish_reason: "content_filter" }],
    })),
  });
  const result = await filtered.invokeModel(invokeInput(NDJSON_PROMPT));
  assertPortLaw(result, "real");
  assert.equal(result.output, null);
  assert.equal(result.refusal?.kind, "policy-denied");
  assert.match(result.refusal?.detail ?? "", /content refused by the sandbox model service \(finish_reason=content_filter\)/);
  // Signal-based detection: a missing/empty content WITHOUT a declared filter signal is malformed, not policy-denied.
  const noSignal = new SandboxModelAdapter({
    client: new RecordingClient(async () => ({ choices: [{ message: {}, finish_reason: "stop" }] })),
  });
  const noSignalResult = await noSignal.invokeModel(invokeInput(NDJSON_PROMPT));
  assert.equal(noSignalResult.refusal?.kind, "unsupported-operation", "content refusal is never GUESSED from absent text");
});

test("W10B-2 refusal classification: SDK config-missing and HTTP statuses map onto the frozen kinds", async () => {
  const cases: readonly [string, string, TransformModelRefusalKind][] = [
    ["SDK configuration not found", "Configuration file not found or invalid. Please create .z-ai-config in your project, home directory, or /etc.", "credentials-missing"],
    ["HTTP 401", "API request failed with status 401: {\"error\":\"invalid api key\"}", "credentials-missing"],
    ["HTTP 429", "API request failed with status 429: rate limited", "quota-exhausted"],
    ["HTTP 400", "API request failed with status 400: bad request", "unsupported-operation"],
    ["HTTP 503", "API request failed with status 503: service unavailable", "provider-unavailable"],
  ];
  for (const [label, message, expectedKind] of cases) {
    const adapter = new SandboxModelAdapter({
      client: new RecordingClient(async () => {
        throw new Error(message);
      }),
    });
    const result = await adapter.invokeModel(invokeInput(NDJSON_PROMPT));
    assertPortLaw(result, "real");
    assert.equal(result.refusal?.kind, expectedKind, `${label} ⇒ ${expectedKind}`);
    assert.ok((result.refusal?.detail ?? "").includes(message.slice(0, 24)), `${label}: the original error text is retained`);
  }
});

test("W10B-3 REAL network invocation through the real z-ai-web-dev-sdk client (labeled REAL; measured latency, honest cost, grade real)", async () => {
  const adapter = new SandboxModelAdapter(); // default path: the REAL SDK client, lazily constructed via ZAI.create()
  const result = await adapter.invokeModel(invokeInput("Reply with exactly: SPORTA_W10B_REAL_PROBE"));
  assertPortLaw(result, "real");
  assert.equal(result.providerId, "zai:glm-sandbox");
  assert.equal(result.evidenceGrade, "real", "a real network completion is graded real");
  assert.equal(result.refusal, null, `the real sandbox service answered (refusal was: ${result.refusal?.kind ?? "none"})`);
  assert.ok(result.output !== null && result.output.trim().length > 0, "the real completion carries content");
  assert.ok(result.timingMs > 0, `latency is MEASURED, never estimated (got ${result.timingMs}ms)`);
  assert.equal(result.cost, null, "the service reports no monetary cost ⇒ cost is honestly null");
  assert.match(result.detail, /real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/);
  console.log(`W10B-3 REAL invocation: latency=${result.timingMs}ms output=${JSON.stringify((result.output ?? "").slice(0, 80))}`);
});

test("W10B-4 port injection: the REAL TransformRunService executes a model node through the injected sandbox adapter (frozen port, real manifest evidence)", async () => {
  const transformHash = new Sha256TransformHash();
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const adapter = new SandboxModelAdapter(); // REAL default client — the model step makes a REAL network call
  const runService = new TransformRunService({
    clock: { now: () => FIXED_NOW },
    hash: transformHash,
    artifacts,
    models: adapter, // the frozen port seam — the ONLY way the run service sees the provider
    deterministic: new DeterministicFilterNodeAdapter({ store: new DeterministicComponentStore([], transformHash) }),
    components: new DeterministicComponentStore([], transformHash),
  });
  const streamPort = { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" as const };
  const summaryPort = { name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" as const };
  const modelNode = {
    nodeId: "node:model", kind: "model" as const,
    componentRef: { kind: "model" as const, digest: MODEL_REF.digest, name: MODEL_REF.name },
    inputs: [streamPort], outputs: [summaryPort], parameterSchema: {},
    requiredPermissions: [],
    // The studio-envelope precedent: the NODE's sandbox declares no egress
    // ("denied", default-deny law); the model adapter's REAL network call is
    // a HOST-layer leg injected through the port (the arena-HTTP-leg class).
    sandbox: { kind: "process" as const, networkEgress: "denied" as const, hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light" as const, memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed" as const, contract: "model lane failures are typed failures, never silent" },
    provenanceRules: [],
  };
  const manifest = {
    pipelineId: "pipe:w10b-model-lane", version: "1.0.0",
    manifestDigest: transformHash.text("pipe:w10b-model-lane@1.0.0"),
    publisher: "publisher:w10b",
    purpose: "w10b lane proof: one model node over the frozen TransformModelPort",
    limitations: ["lane proof pipeline — never published"],
    inputs: [streamPort], outputs: [summaryPort], nodes: [modelNode], edges: [],
    semantics: { preservationClaims: [], declaredChanges: ["model output replaces the input stream"], measurement: { evidenceKind: "declared", benchmarkIds: [] } },
    expectedOutputs: ["model summary"], pinnedDependencies: [{ kind: "model" as const, name: MODEL_REF.name, digest: MODEL_REF.digest, license: "sandbox", storageRef: "sandbox:zai-glm" }],
    licensing: { license: "UNREVIEWED", provenance: "w10b lane proof" },
    policy: SPORTA_HOST_POLICY,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 1_000, declaredThroughput: "single prompt", evidenceGrade: "declared" as const },
  };
  const run = await runService.runPipeline({
    manifest,
    workGraph: { workGraphId: "wg:w10b-model-lane", runRef: "run:w10b-model-lane" },
    parameters: { "node:model": {} },
    inputs: [{
      artifactRef: "art:w10b-model-feed", rightsSnapshot: "rights:w10b-test",
      bytes: new TextEncoder().encode("Reply with exactly: SPORTA_W10B_RUN_OK"), provenance: null,
    }],
  });
  const step = run.steps[0];
  assert.ok(step !== undefined, "the model step ran");
  assert.equal(step.status, "succeeded", `the REAL model step succeeded (detail: ${step.detail})`);
  assert.ok(step.timingMs > 0, `the step latency is real and measured (got ${step.timingMs}ms)`);
  assert.equal(step.cost, null, "the run record carries the adapter's honest null cost");
  assert.match(step.detail, /^real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/);
  assert.equal(run.outputs.length, 1, "one output revision was committed through the artifact fabric");
  assert.match(run.outputs[0]?.semanticEvidence ?? "", /^real model lane: real sandbox model service/);
  assert.ok((run.outputs[0]?.artifactRevisionId ?? "").startsWith("rev:"));
  assert.equal(run.semanticFidelity.grade, "declared", "honest: a real model lane makes no preservation measurement claim");
  assert.deepEqual(runService.readRun(run.runManifestId), run, "the run manifest reads back identically");
});
