import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ComputeBrokerService,
  FixedClock,
  IllegalJobTransitionError,
  LocalEchoComputeProvider,
  RefusingComputeProvider,
  UnknownComputeJobError,
  policyPermitsJob,
  requiredUsageForJobKind,
  transitionJob,
} from "../src/contract.js";
import type { ComputeBrokerDeps } from "../src/contract.js";
import type { PolicySet } from "@sporta/contracts/contract";

const policy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render", "compute:echo"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const noComputePolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const prohibitedPolicy: PolicySet = {
  rights: {
    holders: ["holder:test"],
    usages: ["render", "compute:echo"],
    prohibitions: ["compute:echo"],
  },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const echoSpec = {
  kind: "echo",
  inputs: ["art:compute"],
  requirements: [],
  timeoutMs: 1_000,
};

function fixtureBroker(
  providers: readonly (LocalEchoComputeProvider | RefusingComputeProvider)[] = [
    new LocalEchoComputeProvider(),
  ],
): { broker: ComputeBrokerService; local?: LocalEchoComputeProvider } {
  const local = providers.find((provider) => provider instanceof LocalEchoComputeProvider) as
    | LocalEchoComputeProvider
    | undefined;
  const deps: ComputeBrokerDeps = {
    providers,
    clock: new FixedClock("2026-06-01T00:00:00.000Z"),
  };
  return { broker: new ComputeBrokerService(deps), local };
}

test("quote returns a quote from EVERY provider; the refusing provider's refusal is visible", async () => {
  const refusing = new RefusingComputeProvider();
  const local = new LocalEchoComputeProvider();
  const { broker } = fixtureBroker([refusing, local]);
  const quotes = await broker.quote(echoSpec);
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0]?.providerId, "refusing-fixture");
  assert.equal(quotes[0]?.refusal?.kind, "provider-unavailable");
  assert.match(quotes[0]?.refusal?.detail ?? "", /always unavailable/);
  assert.equal(quotes[1]?.providerId, "local-in-memory");
  assert.equal(quotes[1]?.refusal, undefined);
  // the refusing provider was actually asked (nothing hidden)
  assert.equal(refusing.quoteCount, 1);
});

test("submit happy path: queued -> running -> succeeded with a deterministic output", async () => {
  const { broker } = fixtureBroker();
  const status = await broker.submit({ jobId: "job:c1", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(status.providerId, "local-in-memory");
  assert.equal(status.outputArtifactId, "out:echo:art:compute");
  assert.deepEqual(broker.history("job:c1"), ["queued", "running", "succeeded"]);
  assert.equal(broker.submittedAt("job:c1"), "2026-06-01T00:00:00.000Z");
  // poll returns the same current status
  assert.deepEqual(await broker.poll("job:c1"), status);
});

test("submit is idempotent per jobId: same status, provider executes once", async () => {
  const { broker, local } = fixtureBroker();
  const first = await broker.submit({ jobId: "job:c2", spec: echoSpec, policy });
  const retry = await broker.submit({ jobId: "job:c2", spec: echoSpec, policy });
  assert.deepEqual(retry, first);
  assert.equal(local?.executionCount, 1);
});

test("submit mints distinct job ids when none is supplied", async () => {
  const { broker } = fixtureBroker();
  const a = await broker.submit({ spec: echoSpec, policy });
  const b = await broker.submit({ spec: echoSpec, policy });
  assert.notEqual(a.jobId, b.jobId);
});

test("policy check happens BEFORE submission: missing usage -> policy-denied refusal", async () => {
  const { broker, local } = fixtureBroker();
  const status = await broker.submit({ jobId: "job:c3", spec: echoSpec, policy: noComputePolicy });
  assert.equal(status.state, "refused");
  assert.equal(status.refusal?.kind, "policy-denied");
  assert.equal(status.providerId, "sporta-compute-broker");
  assert.match(status.refusal?.detail ?? "", /compute:echo/);
  assert.deepEqual(broker.history("job:c3"), ["refused"]); // never queued
  assert.equal(local?.executionCount, 0); // never reached a provider
});

test("a prohibited usage is also policy-denied before submission", async () => {
  const { broker } = fixtureBroker();
  const status = await broker.submit({ jobId: "job:c4", spec: echoSpec, policy: prohibitedPolicy });
  assert.equal(status.state, "refused");
  assert.equal(status.refusal?.kind, "policy-denied");
});

test("all providers refusing surfaces a visible refusal (never a failure or success)", async () => {
  const { broker } = fixtureBroker([new RefusingComputeProvider()]);
  const status = await broker.submit({ jobId: "job:c5", spec: echoSpec, policy });
  assert.equal(status.state, "refused");
  assert.equal(status.refusal?.kind, "provider-unavailable");
  assert.equal(status.refusal?.providerId, "refusing-fixture");
  assert.deepEqual(broker.history("job:c5"), ["queued", "refused"]);
});

test("a refusing provider is skipped at selection: the local provider still wins", async () => {
  const { broker, local } = fixtureBroker([
    new RefusingComputeProvider(),
    new LocalEchoComputeProvider(),
  ]);
  const status = await broker.submit({ jobId: "job:c6", spec: echoSpec, policy });
  assert.equal(status.state, "succeeded");
  assert.equal(status.providerId, "local-in-memory");
  assert.equal(local?.executionCount, 1);
});

test("an unsupported job kind is a typed refusal at execution (not a failure)", async () => {
  const { broker } = fixtureBroker();
  const transcodePolicy: PolicySet = {
    rights: { holders: ["holder:test"], usages: ["compute:transcode"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
  const status = await broker.submit({
    jobId: "job:c7",
    spec: { ...echoSpec, kind: "transcode" },
    policy: transcodePolicy,
  });
  assert.equal(status.state, "refused");
  assert.equal(status.refusal?.kind, "unsupported-operation");
  assert.equal(status.refusal?.providerId, "local-in-memory");
  assert.deepEqual(broker.history("job:c7"), ["queued", "running", "refused"]);
});

test("poll of an unknown job is a typed error (never a fabricated status)", async () => {
  const { broker } = fixtureBroker();
  await assert.rejects(
    () => broker.poll("job:never-submitted"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownComputeJobError);
      return true;
    },
  );
});

test("the state machine refuses illegal transitions (typed)", () => {
  assert.throws(
    () => transitionJob("succeeded", "running"),
    (error: unknown) => error instanceof IllegalJobTransitionError,
  );
  assert.throws(
    () => transitionJob("queued", "succeeded"),
    (error: unknown) => error instanceof IllegalJobTransitionError,
  );
  assert.throws(
    () => transitionJob("refused", "queued"),
    (error: unknown) => error instanceof IllegalJobTransitionError,
  );
  assert.throws(
    () => transitionJob("failed", "running"),
    (error: unknown) => error instanceof IllegalJobTransitionError,
  );
  assert.equal(transitionJob("queued", "running"), "running");
  assert.equal(transitionJob("running", "succeeded"), "succeeded");
  assert.equal(transitionJob("queued", "cancelled"), "cancelled");
  assert.equal(transitionJob("running", "refused"), "refused");
});

test("requiredUsageForJobKind is the deterministic usage mapping", () => {
  assert.equal(requiredUsageForJobKind("echo"), "compute:echo");
  assert.equal(requiredUsageForJobKind("ffmpeg-encode"), "compute:ffmpeg-encode");
  assert.equal(policyPermitsJob(policy, "echo"), true);
  assert.equal(policyPermitsJob(noComputePolicy, "echo"), false);
  assert.equal(policyPermitsJob(prohibitedPolicy, "echo"), false);
});
