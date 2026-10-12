import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  AllProvidersExhaustedError,
  DEFAULT_MAX_ATTEMPTS_PER_PROVIDER,
  DEFAULT_RETRY_SAME_PROVIDER_ON_RETRYABLE_FAILURE,
  FallbackClassificationError,
  FallbackComputeService,
  FixedClock,
  InvalidFallbackChainPolicyError,
  RefusingComputeProvider,
  TRANSIENT_FAILURE_MARKERS,
  UnknownComputeJobError,
  classifyProviderOutcome,
  defaultFallbackChainPolicy,
  validateFallbackChainPolicy,
} from "../src/contract.js";
import type {
  ComputeProviderPort,
  FallbackComputeDeps,
  FallbackChainPolicy,
  ProviderExecutionResult,
  TypedRefusal,
} from "../src/contract.js";
import type { PolicySet } from "@sporta/contracts/contract";

/**
 * FallbackComputeService + the fallback-chain domain — the B6
 * "provider fallback / visible provider failure" proof.
 *
 * FIXTURE lanes: deterministic scripted providers (typed refusal,
 * retryable failure, terminal failure, success) prove the chain
 * mechanics — order, advance, trail visibility, aggregate refusal,
 * idempotency, classification totality, policy laws.
 *
 * REAL lane: providers doing REAL work through real child processes
 * (`node -e`): the primary fails with a real non-zero exit, the real
 * secondary computes a real sha256 checksum; the trail shows both.
 * Runtime law: this file runs under `tsx --test` (Node runner).
 */

const execFileAsync = promisify(execFile);

const policy: PolicySet = {
  rights: { holders: ["holder:fallback"], usages: ["render", "compute:echo"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const noComputePolicy: PolicySet = {
  rights: { holders: ["holder:fallback"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const echoSpec = {
  kind: "echo",
  inputs: ["art:fallback"],
  requirements: [],
  timeoutMs: 1_000,
};

/** Deterministic scripted fixture provider (test-local, FIXTURE-grade). */
class FxProvider implements ComputeProviderPort {
  executionCount = 0;
  constructor(
    readonly providerId: string,
    private readonly result: ProviderExecutionResult,
  ) {}
  async quote() {
    return { providerId: this.providerId, estimatedLatencyMs: 1 };
  }
  async execute() {
    this.executionCount += 1;
    return this.result;
  }
}

const refusal = (providerId: string, kind: TypedRefusal["kind"], detail: string): ProviderExecutionResult => ({
  state: "refused",
  refusal: { kind, providerId, detail },
});
const failure = (detail: string): ProviderExecutionResult => ({ state: "failed", detail });
const success = (outputArtifactId: string): ProviderExecutionResult => ({ state: "succeeded", outputArtifactId });

function fxChainService(providers: readonly ComputeProviderPort[], chainPolicy?: FallbackChainPolicy): FallbackComputeService {
  const deps: FallbackComputeDeps = {
    providers,
    clock: new FixedClock("2026-06-01T00:00:00.000Z"),
    ...(chainPolicy === undefined ? {} : { policy: chainPolicy }),
  };
  return new FallbackComputeService(deps);
}

test("FIXTURE: classification law — the four classes come from the explicit record", () => {
  assert.equal(classifyProviderOutcome(success("out:x")), "succeeded");
  assert.equal(classifyProviderOutcome(failure("upstream timeout while rendering")), "retryable-failure");
  assert.equal(classifyProviderOutcome(failure("disk unreadable, data lost")), "terminal-failure");
  // EVERY TypedRefusal kind is terminal for that provider — an honest no.
  const kinds: readonly TypedRefusal["kind"][] = [
    "provider-unavailable",
    "quota-exhausted",
    "credentials-missing",
    "policy-denied",
    "unsupported-operation",
  ];
  for (const kind of kinds) {
    assert.equal(classifyProviderOutcome(refusal("fx", kind, "no")), "terminal-refusal");
  }
  // the markers are an explicit record: every marker classifies a failure as retryable
  for (const { marker } of TRANSIENT_FAILURE_MARKERS) {
    assert.equal(classifyProviderOutcome(failure(`boom ${marker} boom`)), "retryable-failure");
  }
});

test("FIXTURE: classification totality — ill-shaped results are typed errors, never silent defaults", () => {
  const ill = (value: unknown) =>
    assert.throws(
      () => classifyProviderOutcome(value as ProviderExecutionResult),
      (error: unknown) => error instanceof FallbackClassificationError,
    );
  ill(null);
  ill("succeeded");
  ill({ state: "exploded" });
  ill({ state: "refused" });
  ill({ state: "refused", refusal: { kind: "made-up-kind", providerId: "p", detail: "x" } });
  ill({ state: "refused", refusal: { kind: "quota-exhausted", providerId: "", detail: "x" } });
  ill({ state: "succeeded", refusal: refusal("p", "quota-exhausted", "x").refusal });
  ill({ state: "failed", refusal: refusal("p", "quota-exhausted", "x").refusal });
});

test("FIXTURE: the chain advances in deterministic order and succeeds on the fourth provider — full trail visible", async () => {
  const refusing = new FxProvider("fx-refusing", refusal("fx-refusing", "quota-exhausted", "no budget left"));
  const retryable = new FxProvider("fx-retryable", failure("upstream timeout"));
  const terminal = new FxProvider("fx-terminal", failure("fixture failure: disk detached"));
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:chain"));
  const service = fxChainService([refusing, retryable, terminal, succeeding]);

  const status = await service.submit({ jobId: "job:fb1", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(status.providerId, "fx-succeeding");
  assert.equal(status.outputArtifactId, "out:fixture:chain");
  // every provider executed exactly once, in registration order
  assert.equal(refusing.executionCount, 1);
  assert.equal(retryable.executionCount, 1);
  assert.equal(terminal.executionCount, 1);
  assert.equal(succeeding.executionCount, 1);
  // the trail carries every attempt with its class, refusal and clock-stamped time
  const trail = service.trail("job:fb1");
  assert.deepEqual(
    trail.attempts.map((a) => [a.providerId, a.outcomeClass]),
    [
      ["fx-refusing", "terminal-refusal"],
      ["fx-retryable", "retryable-failure"],
      ["fx-terminal", "terminal-failure"],
      ["fx-succeeding", "succeeded"],
    ],
  );
  assert.equal(trail.attempts[0]?.refusal?.kind, "quota-exhausted");
  assert.equal(trail.attempts[1]?.failureDetail, "upstream timeout");
  assert.equal(trail.attempts[0]?.attemptedAt, "2026-06-01T00:00:00.000Z");
  assert.equal(trail.jobState, "succeeded");
  // the success NEVER hides the earlier failures (B6 visibility)
  assert.match(status.detail ?? "", /fx-refusing terminal-refusal\(quota-exhausted\)/);
  assert.match(status.detail ?? "", /fx-retryable retryable-failure\(upstream timeout\)/);
  assert.match(status.detail ?? "", /fx-terminal terminal-failure\(fixture failure: disk detached\)/);
  assert.deepEqual(service.history("job:fb1"), ["queued", "running", "succeeded"]);
});

test("FIXTURE: retryable failures ADVANCE by default — the same provider is never re-entered", async () => {
  const retryable = new FxProvider("fx-retryable", failure("upstream timeout"));
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:advance"));
  const service = fxChainService([retryable, succeeding]);
  const status = await service.submit({ jobId: "job:fb2", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(retryable.executionCount, 1);
  assert.deepEqual(service.trail("job:fb2").attempts.map((a) => a.attemptNumber), [1, 1]);
});

test("FIXTURE: policy record — same-provider retry only when explicitly enabled, within the attempt budget", async () => {
  const retryable = new FxProvider("fx-retryable", failure("upstream timeout"));
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:budget"));
  const chainPolicy: FallbackChainPolicy = {
    providerOrder: ["fx-retryable", "fx-succeeding"],
    maxAttemptsPerProvider: 2,
    retrySameProviderOnRetryableFailure: true,
  };
  const service = fxChainService([retryable, succeeding], chainPolicy);
  const status = await service.submit({ jobId: "job:fb3", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(retryable.executionCount, 2); // the budget allowed one same-provider retry
  assert.deepEqual(service.trail("job:fb3").attempts.map((a) => a.attemptNumber), [1, 2, 1]);
});

test("FIXTURE: a refusal is NEVER retried — even with same-provider retry enabled", async () => {
  const refusing = new FxProvider("fx-refusing", refusal("fx-refusing", "provider-unavailable", "gone"));
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:noretry"));
  const chainPolicy: FallbackChainPolicy = {
    providerOrder: ["fx-refusing", "fx-succeeding"],
    maxAttemptsPerProvider: 3,
    retrySameProviderOnRetryableFailure: true,
  };
  const service = fxChainService([refusing, succeeding], chainPolicy);
  const status = await service.submit({ jobId: "job:fb4", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(refusing.executionCount, 1); // an honest no is never a retry trigger
  assert.equal(service.trail("job:fb4").attempts[0]?.outcomeClass, "terminal-refusal");
});

test("FIXTURE: aggregate refusal when every provider refuses — refused, never failed or succeeded", async () => {
  const first = new FxProvider("fx-refuse-a", refusal("fx-refuse-a", "quota-exhausted", "a has no budget"));
  const second = new FxProvider("fx-refuse-b", refusal("fx-refuse-b", "credentials-missing", "b has no keys"));
  const service = fxChainService([first, second]);
  const status = await service.submit({ jobId: "job:fb5", spec: echoSpec, policy });
  assert.equal(status.state, "refused");
  // first-refuser law: kind and providerId follow the FIRST refusing provider
  assert.equal(status.refusal?.kind, "quota-exhausted");
  assert.equal(status.providerId, "fx-refuse-a");
  // the aggregate detail names EVERY refusing provider — nothing hidden
  assert.match(status.refusal?.detail ?? "", /fx-refuse-a:quota-exhausted/);
  assert.match(status.refusal?.detail ?? "", /fx-refuse-b:credentials-missing/);
  assert.equal(service.trail("job:fb5").attempts.length, 2);
  assert.deepEqual(service.history("job:fb5"), ["queued", "running", "refused"]);
});

test("FIXTURE: exhaustion with failures throws AllProvidersExhaustedError carrying the full trail; the failed status stays pollable", async () => {
  const retryable = new FxProvider("fx-retryable", failure("upstream timeout"));
  const terminal = new FxProvider("fx-terminal", failure("fixture failure: node offline permanently"));
  const service = fxChainService([retryable, terminal]);
  await assert.rejects(
    () => service.submit({ jobId: "job:fb6", spec: echoSpec, policy }),
    (error: unknown) => {
      assert.ok(error instanceof AllProvidersExhaustedError);
      assert.equal(error.jobId, "job:fb6");
      assert.deepEqual(
        error.attempts.map((a) => [a.providerId, a.outcomeClass]),
        [
          ["fx-retryable", "retryable-failure"],
          ["fx-terminal", "terminal-failure"],
        ],
      );
      return true;
    },
  );
  // the job is recorded terminal failed (last failing provider) and poll answers it
  const polled = await service.poll("job:fb6");
  assert.equal(polled.state, "failed");
  assert.equal(polled.providerId, "fx-terminal");
  assert.match(polled.detail ?? "", /fx-retryable retryable-failure/);
});

test("FIXTURE: mixed refusal-then-failure exhaustion ends failed — a failure is never converted into a refusal", async () => {
  const refusing = new FxProvider("fx-refusing", refusal("fx-refusing", "quota-exhausted", "no budget"));
  const failing = new FxProvider("fx-terminal", failure("fixture failure: disk detached"));
  const service = fxChainService([refusing, failing]);
  await assert.rejects(
    () => service.submit({ jobId: "job:fb7", spec: echoSpec, policy }),
    (error: unknown) => error instanceof AllProvidersExhaustedError,
  );
  const polled = await service.poll("job:fb7");
  assert.equal(polled.state, "failed"); // one real failure -> failed, not refused
  assert.equal(polled.providerId, "fx-terminal");
});

test("FIXTURE: idempotent retry — the terminal outcome replays and providers never re-execute", async () => {
  // succeeded: byte-identical status, no re-execution
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:idem"));
  const serviceA = fxChainService([succeeding]);
  const first = await serviceA.submit({ jobId: "job:fb8", spec: echoSpec, policy });
  const retry = await serviceA.submit({ jobId: "job:fb8", spec: echoSpec, policy });
  assert.deepEqual(retry, first);
  assert.equal(succeeding.executionCount, 1);
  // all-refused: the same refusal replays, refusers never re-asked
  const refuser = new FxProvider("fx-refusing", refusal("fx-refusing", "quota-exhausted", "no budget"));
  const serviceB = fxChainService([refuser]);
  const refusedFirst = await serviceB.submit({ jobId: "job:fb9", spec: echoSpec, policy });
  const refusedRetry = await serviceB.submit({ jobId: "job:fb9", spec: echoSpec, policy });
  assert.deepEqual(refusedRetry, refusedFirst);
  assert.equal(refuser.executionCount, 1);
  // exhausted: the SAME typed terminal error replays, the trail is identical, no re-execution
  const failing = new FxProvider("fx-terminal", failure("fixture failure: disk detached"));
  const serviceC = fxChainService([failing]);
  const attemptsOf = (error: unknown): true => {
    assert.ok(error instanceof AllProvidersExhaustedError);
    return true;
  };
  await assert.rejects(() => serviceC.submit({ jobId: "job:fb10", spec: echoSpec, policy }), attemptsOf);
  await assert.rejects(() => serviceC.submit({ jobId: "job:fb10", spec: echoSpec, policy }), attemptsOf);
  assert.equal(failing.executionCount, 1);
  assert.equal(serviceC.trail("job:fb10").attempts.length, 1);
});

test("FIXTURE: policy check happens BEFORE the chain — no usage, no provider touched", async () => {
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:never"));
  const service = fxChainService([succeeding]);
  const status = await service.submit({ jobId: "job:fb11", spec: echoSpec, policy: noComputePolicy });
  assert.equal(status.state, "refused");
  assert.equal(status.refusal?.kind, "policy-denied");
  assert.equal(status.providerId, "sporta-compute-fallback");
  assert.deepEqual(service.history("job:fb11"), ["refused"]); // never queued
  assert.equal(succeeding.executionCount, 0); // never reached a provider
  assert.deepEqual(service.trail("job:fb11").attempts, []); // empty trail, honestly
});

test("FIXTURE: quote surfaces every chain provider in order — refusals visible; the chain still EXECUTES a quote-refuser (execution-time fallback)", async () => {
  const refusing = new RefusingComputeProvider();
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:quote"));
  const service = fxChainService([refusing, succeeding]);
  const quotes = await service.quote(echoSpec);
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0]?.providerId, "refusing-fixture");
  assert.equal(quotes[0]?.refusal?.kind, "provider-unavailable"); // visible, never filtered
  assert.equal(quotes[1]?.providerId, "fx-succeeding");
  assert.equal(quotes[1]?.refusal, undefined);
  // the deliberate divergence from the frozen broker: quotes do NOT select —
  // the refusing provider is EXECUTED, its refusal lands in the trail, the chain advances
  const status = await service.submit({ jobId: "job:fb-quote", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(status.providerId, "fx-succeeding");
  assert.equal(refusing.quoteCount, 1);
  assert.deepEqual(
    service.trail("job:fb-quote").attempts.map((a) => [a.providerId, a.outcomeClass]),
    [
      ["refusing-fixture", "terminal-refusal"],
      ["fx-succeeding", "succeeded"],
    ],
  );
});

test("FIXTURE: invalid chain policies fail closed at construction — typed, every reason", () => {
  const ok = new FxProvider("fx-ok", success("out:x"));
  const bad = (chainPolicy: FallbackChainPolicy) =>
    assert.throws(
      () => fxChainService([ok], chainPolicy),
      (error: unknown) => error instanceof InvalidFallbackChainPolicyError,
    );
  bad({ providerOrder: [], maxAttemptsPerProvider: 1, retrySameProviderOnRetryableFailure: false });
  bad({
    providerOrder: ["fx-ok", "fx-ok"],
    maxAttemptsPerProvider: 1,
    retrySameProviderOnRetryableFailure: false,
  });
  bad({
    providerOrder: ["fx-unknown"],
    maxAttemptsPerProvider: 1,
    retrySameProviderOnRetryableFailure: false,
  });
  bad({
    providerOrder: ["fx-ok"],
    maxAttemptsPerProvider: 0,
    retrySameProviderOnRetryableFailure: false,
  });
  // duplicate registered ids are rejected too
  assert.throws(
    () => fxChainService([ok, new FxProvider("fx-ok", success("out:y"))]),
    (error: unknown) => error instanceof InvalidFallbackChainPolicyError,
  );
  // the pure validator reports every reason at once
  assert.throws(
    () =>
      validateFallbackChainPolicy({
        providerOrder: ["a", "a"],
        maxAttemptsPerProvider: 0.5,
        retrySameProviderOnRetryableFailure: false,
      }),
    (error: unknown) => {
      assert.ok(error instanceof InvalidFallbackChainPolicyError);
      assert.equal(error.reasons.length, 2);
      return true;
    },
  );
});

test("FIXTURE: the default policy is registration order — no ambient config", async () => {
  const a = new FxProvider("fx-a", success("out:fixture:a"));
  const b = new FxProvider("fx-b", success("out:fixture:b"));
  const defaults = defaultFallbackChainPolicy(["fx-a", "fx-b"]);
  assert.equal(defaults.maxAttemptsPerProvider, DEFAULT_MAX_ATTEMPTS_PER_PROVIDER);
  assert.equal(defaults.retrySameProviderOnRetryableFailure, DEFAULT_RETRY_SAME_PROVIDER_ON_RETRYABLE_FAILURE);
  const service = fxChainService([a, b]);
  const status = await service.submit({ jobId: "job:fb12", spec: echoSpec, policy });
  assert.equal(status.providerId, "fx-a"); // registration order wins — no guessing
  assert.deepEqual(service.trail("job:fb12").attempts.map((x) => x.providerId), ["fx-a"]);
  // an explicit order may omit a registered provider (explicit exclusion, deterministic)
  const excluded = fxChainService([a, b], {
    providerOrder: ["fx-b"],
    maxAttemptsPerProvider: 1,
    retrySameProviderOnRetryableFailure: false,
  });
  const excludedStatus = await excluded.submit({ jobId: "job:fb13", spec: echoSpec, policy });
  assert.equal(excludedStatus.providerId, "fx-b");
  assert.equal(a.executionCount, 1); // only the first service's run — the excluded chain never re-executed fx-a
});

test("FIXTURE: poll/trail of an unknown job is a typed error (never a fabricated status)", async () => {
  const service = fxChainService([new FxProvider("fx-ok", success("out:x"))]);
  assert.throws(() => service.trail("job:never"), (error: unknown) => error instanceof UnknownComputeJobError);
  await assert.rejects(
    () => service.poll("job:never"),
    (error: unknown) => error instanceof UnknownComputeJobError,
  );
});

test("FIXTURE: an ill-shaped provider result fails closed — typed error, coherent ledger, partial trail visible", async () => {
  const ill: ComputeProviderPort = {
    providerId: "fx-ill",
    quote: async () => ({ providerId: "fx-ill", estimatedLatencyMs: 1 }),
    execute: async () => ({ state: "succeeded", refusal: { kind: "quota-exhausted", providerId: "fx-ill", detail: "a refusal smuggled onto a success" } }) as unknown as ProviderExecutionResult,
  };
  const succeeding = new FxProvider("fx-succeeding", success("out:fixture:after-ill"));
  const service = fxChainService([ill, succeeding]);
  await assert.rejects(
    () => service.submit({ jobId: "job:fb14", spec: echoSpec, policy }),
    (error: unknown) => error instanceof FallbackClassificationError,
  );
  const polled = await service.poll("job:fb14");
  assert.equal(polled.state, "failed");
  assert.match(polled.detail ?? "", /ill-shaped/);
  // the idempotent retry replays the SAME typed terminal error
  await assert.rejects(
    () => service.submit({ jobId: "job:fb14", spec: echoSpec, policy }),
    (error: unknown) => error instanceof FallbackClassificationError,
  );
  assert.equal(succeeding.executionCount, 0); // the chain stopped at the ill-shaped result
});

const REAL_CHECKSUM_INPUT = "sporta-b6-real-fallback-lane";

/** REAL provider: spawns a real `node -e` child that exits non-zero (honest failure). */
class RealFailingNodeComputeProvider implements ComputeProviderPort {
  readonly providerId = "real-node-failing";
  spawnCount = 0;

  async quote() {
    return { providerId: this.providerId, estimatedLatencyMs: 50 };
  }

  async execute(): Promise<ProviderExecutionResult> {
    this.spawnCount += 1;
    try {
      await execFileAsync(process.execPath, [
        "-e",
        "process.stderr.write('real compute node: allocator offline after patch'); process.exit(3);",
      ]);
      return { state: "succeeded", outputArtifactId: "out:real:unreachable" };
    } catch (error) {
      const err = error as { code?: number | string; stderr?: string };
      return {
        state: "failed",
        detail: `real provider exited with code ${String(err.code ?? "?")}: ${(err.stderr ?? "").trim()}`,
      };
    }
  }
}

/** REAL provider: spawns a real `node -e` child computing a real sha256 checksum. */
class RealChecksumNodeComputeProvider implements ComputeProviderPort {
  readonly providerId = "real-node-checksum";
  spawnCount = 0;

  async quote() {
    return { providerId: this.providerId, estimatedLatencyMs: 20 };
  }

  async execute(): Promise<ProviderExecutionResult> {
    this.spawnCount += 1;
    const { stdout } = await execFileAsync(process.execPath, [
      "-e",
      `const { createHash } = require("node:crypto"); process.stdout.write(createHash("sha256").update(${JSON.stringify(
        REAL_CHECKSUM_INPUT,
      )}).digest("hex"));`,
    ]);
    return { state: "succeeded", outputArtifactId: `out:sha256:${stdout.trim()}` };
  }
}

test("REAL: primary fails with a real non-zero exit, the real secondary succeeds — the trail shows both; idempotent retry spawns nothing", async () => {
  const failing = new RealFailingNodeComputeProvider();
  const checksum = new RealChecksumNodeComputeProvider();
  const service = fxChainService([failing, checksum]);

  const status = await service.submit({ jobId: "job:real1", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(status.providerId, "real-node-checksum");
  // the output artifact is the REAL sha256 of the real input, computed by the real child process
  const expected = createHash("sha256").update(REAL_CHECKSUM_INPUT).digest("hex");
  assert.equal(status.outputArtifactId, `out:sha256:${expected}`);
  // the trail shows BOTH real attempts: the honest failure then the success
  const trail = service.trail("job:real1");
  assert.deepEqual(
    trail.attempts.map((a) => [a.providerId, a.outcomeClass]),
    [
      ["real-node-failing", "terminal-failure"],
      ["real-node-checksum", "succeeded"],
    ],
  );
  assert.match(trail.attempts[0]?.failureDetail ?? "", /exited with code 3: real compute node: allocator offline/);
  assert.equal(trail.attempts[0]?.attemptedAt, "2026-06-01T00:00:00.000Z"); // the injected clock stamps attempts
  // the real failure stays visible on the succeeded status (B6)
  assert.match(status.detail ?? "", /real-node-failing terminal-failure\(real provider exited with code 3/);
  assert.equal(failing.spawnCount, 1);
  assert.equal(checksum.spawnCount, 1);
  // idempotency with REAL providers: the retry replays, nothing re-spawns
  const retry = await service.submit({ jobId: "job:real1", spec: echoSpec, policy });
  assert.deepEqual(retry, status);
  assert.equal(failing.spawnCount, 1);
  assert.equal(checksum.spawnCount, 1);
});
