import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ComputeLedgerError,
  ComputeJobStatus,
  FsComputeJobLedger,
  FsComputeBrokerService,
  FixedClock,
  LocalEchoComputeProvider,
  RefusingComputeProvider,
  UnknownComputeJobError,
  sha256ComputeLedgerHash,
} from "../src/contract.js";
import type { FsComputeBrokerDeps, ProviderExecutionResult } from "../src/contract.js";
import type { PolicySet } from "@sporta/contracts/contract";

/**
 * FsComputeJobLedger + FsComputeBrokerService — REAL durable-storage
 * tests (the W6 FsSharedSessionStore evidence pattern). Every test
 * runs against a real temp directory on the real filesystem: ledger
 * records are written as real JSON files, read back, corrupted by
 * overwriting real bytes, and broker restarts are simulated by FRESH
 * broker instances over the same ledger directory. Providers are the
 * fixture adapters (plus one deterministic test-local failing
 * provider) — the persistence lane under test is real.
 */
const policy: PolicySet = {
  rights: { holders: ["holder:fs-ledger"], usages: ["render", "compute:echo"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const noComputePolicy: PolicySet = {
  rights: { holders: ["holder:fs-ledger"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** Deterministic test-local provider that FAILS executions (fixture content). */
class FailingProvider extends LocalEchoComputeProvider {
  readonly providerId = "failing-fixture";

  async execute(): Promise<ProviderExecutionResult> {
    this.executionCount += 1;
    return { state: "failed", detail: "fixture failure: disk simulated offline" };
  }
}

async function realRoot(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), "sporta-compute-ledger-"));
}

function broker(ledger: FsComputeJobLedger, providers: readonly unknown[] = []): FsComputeBrokerService {
  const deps = {
    providers: providers.length > 0 ? providers : [new LocalEchoComputeProvider()],
    clock: new FixedClock("2026-06-01T00:00:00.000Z"),
    ledger,
  } as FsComputeBrokerDeps;
  return new FsComputeBrokerService(deps);
}

const succeededStatus: ComputeJobStatus = {
  jobId: "job:ledger-1",
  state: "succeeded",
  providerId: "local-in-memory",
  outputArtifactId: "out:echo:art:one",
};

test("REAL: save + read back — the ledger record survives byte-identically; fresh instances read it too", async () => {
  const root = await realRoot();
  const ledger = new FsComputeJobLedger(root);
  try {
    const record = {
      jobId: "job:ledger-1",
      status: succeededStatus,
      history: ["queued", "running", "succeeded"] as const,
      submittedAt: "2026-06-01T00:00:00.000Z",
    };
    await ledger.saveJob(record);
    assert.equal(await ledger.hasJob("job:ledger-1"), true);
    assert.equal(await ledger.hasJob("job:never"), false);
    assert.equal(await ledger.readJob("job:never"), null);

    const read = await ledger.readJob("job:ledger-1");
    assert.deepEqual(read, record, "byte-identical round-trip");

    // Restart simulation: a FRESH ledger instance over the same dir.
    const fresh = await new FsComputeJobLedger(root).readJob("job:ledger-1");
    assert.deepEqual(fresh, record, "a fresh instance reads everything back");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: public layout — one .json file per job at rootDir/<sha256(jobId)[0:2]>/<sha256(jobId)>.json", async () => {
  const root = await realRoot();
  const ledger = new FsComputeJobLedger(root);
  try {
    await ledger.saveJob({
      jobId: "job:layout",
      status: { jobId: "job:layout", state: "succeeded", providerId: "local-in-memory" },
      history: ["succeeded"],
      submittedAt: "2026-06-01T00:00:00.000Z",
    });
    const idHash = sha256ComputeLedgerHash("job:layout");
    const expected = join(root, idHash.substring(0, 2), `${idHash}.json`);
    const stat = await fs.stat(expected);
    assert.ok(stat.isFile(), "the ledger file exists at the documented address");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: integrity — corrupt bytes, id-address mismatch, history-tip mismatch and refusal-presence mismatch are typed errors", async () => {
  const root = await realRoot();
  const ledger = new FsComputeJobLedger(root);
  const idHash = sha256ComputeLedgerHash("job:corrupt");
  const path = join(root, idHash.substring(0, 2), `${idHash}.json`);
  const expectLedgerError = async (write: string, reason: RegExp): Promise<void> => {
    await fs.mkdir(join(root, idHash.substring(0, 2)), { recursive: true });
    await fs.writeFile(path, write, "utf8");
    await assert.rejects(
      () => ledger.readJob("job:corrupt"),
      (error: unknown) => {
        assert.ok(error instanceof ComputeLedgerError, "typed ledger error");
        assert.match(error.reason, reason);
        return true;
      },
    );
  };
  try {
    await expectLedgerError("{not json", /not-json/);
    await expectLedgerError(JSON.stringify("just a string"), /not-an-object/);
    // Valid JSON, wrong facts: history tip disagrees with the status state.
    await expectLedgerError(
      JSON.stringify({
        jobId: "job:corrupt",
        status: { jobId: "job:corrupt", state: "failed", providerId: "p" },
        history: ["queued", "succeeded"],
        submittedAt: "2026-06-01T00:00:00.000Z",
      }),
      /history-tip-mismatch/,
    );
    // Refusal presence must match the state law (refused iff refusal).
    await expectLedgerError(
      JSON.stringify({
        jobId: "job:corrupt",
        status: { jobId: "job:corrupt", state: "succeeded", providerId: "p", refusal: {
          kind: "provider-unavailable", providerId: "p", detail: "impossible",
        } },
        history: ["queued", "running", "succeeded"],
        submittedAt: "2026-06-01T00:00:00.000Z",
      }),
      /refusal-presence-mismatch/,
    );
    // A foreign job's ledger hand-placed at this address fails the id-address law.
    const foreignHash = sha256ComputeLedgerHash("job:someone-else");
    const foreignPath = join(root, foreignHash.substring(0, 2), `${foreignHash}.json`);
    await fs.mkdir(join(root, foreignHash.substring(0, 2)), { recursive: true });
    await fs.writeFile(
      foreignPath,
      JSON.stringify({
        jobId: "job:corrupt",
        status: { jobId: "job:corrupt", state: "succeeded", providerId: "p" },
        history: ["succeeded"],
        submittedAt: "2026-06-01T00:00:00.000Z",
      }),
      "utf8",
    );
    await assert.rejects(
      () => ledger.readJob("job:someone-else"),
      (error: unknown) => {
        assert.ok(error instanceof ComputeLedgerError);
        assert.match(error.reason, /id-address-mismatch/);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: broker restart — poll/history/submittedAt answer from the persisted ledger, byte-identically", async () => {
  const root = await realRoot();
  try {
    const echoSpec = { kind: "echo", inputs: ["art:one"], requirements: [], timeoutMs: 1_000 };
    // One broker per selection lane (provider selection is
    // first-non-refusing by registration order), all sharing the SAME
    // ledger directory — the restart reads every lane back from disk.
    const live = broker(new FsComputeJobLedger(root), [new LocalEchoComputeProvider()]);
    const succeeded = await live.submit({ jobId: "job:succeeded", spec: echoSpec, policy });
    const refusedPolicy = await live.submit({
      jobId: "job:refused-policy",
      spec: { ...echoSpec, kind: "render" },
      policy: noComputePolicy,
    });
    const allRefusing = broker(new FsComputeJobLedger(root), [new RefusingComputeProvider()]);
    const refusedProvider = await allRefusing.submit({
      jobId: "job:refused-provider",
      spec: echoSpec,
      policy,
    });
    const failing = broker(new FsComputeJobLedger(root), [new FailingProvider()]);
    const failed = await failing.submit({
      jobId: "job:failed",
      spec: echoSpec, // the FailingProvider fails every kind it is given
      policy,
    });
    assert.equal(succeeded.state, "succeeded");
    assert.equal(refusedPolicy.state, "refused");
    assert.equal(refusedPolicy.refusal?.kind, "policy-denied");
    assert.equal(refusedProvider.state, "refused");
    assert.equal(refusedProvider.refusal?.kind, "provider-unavailable");
    assert.equal(failed.state, "failed");

    // KILL the broker (drop the instance) — a FRESH broker over the
    // same ledger dir answers from disk, byte-identically.
    const restarted = broker(new FsComputeJobLedger(root));
    for (const original of [succeeded, refusedPolicy, refusedProvider, failed]) {
      const persisted = await restarted.poll(original.jobId);
      assert.deepEqual(persisted, original, `status survives byte-identically (${original.jobId})`);
    }
    assert.deepEqual(await restarted.history("job:succeeded"), ["queued", "running", "succeeded"]);
    assert.deepEqual(await restarted.history("job:refused-policy"), ["refused"]);
    assert.deepEqual(await restarted.history("job:refused-provider"), ["queued", "refused"]);
    assert.deepEqual(await restarted.history("job:failed"), ["queued", "running", "failed"]);
    assert.equal(await restarted.submittedAt("job:succeeded"), "2026-06-01T00:00:00.000Z");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: idempotent submit across restarts — a persisted jobId never re-executes", async () => {
  const root = await realRoot();
  try {
    const echoSpec = { kind: "echo", inputs: ["art:one"], requirements: [], timeoutMs: 1_000 };
    const original = await broker(new FsComputeJobLedger(root)).submit({
      jobId: "job:once-only",
      spec: echoSpec,
      policy,
    });
    assert.equal(original.state, "succeeded");

    // FRESH broker + FRESH provider: the retry must answer from the
    // ledger without executing (executionCount stays 0).
    const virginProvider = new LocalEchoComputeProvider();
    const restarted = broker(new FsComputeJobLedger(root), [virginProvider]);
    const retried = await restarted.submit({ jobId: "job:once-only", spec: echoSpec, policy });
    assert.deepEqual(retried, original, "the retry is the persisted status, byte-identical");
    assert.equal(virginProvider.executionCount, 0, "the provider never re-executed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: minted ids skip persisted ids — a fresh broker over an old ledger never reuses a job id", async () => {
  const root = await realRoot();
  try {
    const echoSpec = { kind: "echo", inputs: ["art:one"], requirements: [], timeoutMs: 1_000 };
    const first = broker(new FsComputeJobLedger(root));
    const one = await first.submit({ spec: echoSpec, policy });
    const two = await first.submit({ spec: echoSpec, policy });
    assert.equal(one.jobId, "job:1");
    assert.equal(two.jobId, "job:2");

    // Restart: the fresh broker's mint must skip job:1/job:2.
    const restarted = broker(new FsComputeJobLedger(root));
    const three = await restarted.submit({ spec: echoSpec, policy });
    assert.equal(three.jobId, "job:3", "the mint skipped the persisted job:1 and job:2");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("REAL: unknown jobs stay typed — a job never submitted (nor persisted) is UnknownComputeJobError", async () => {
  const root = await realRoot();
  try {
    const restarted = broker(new FsComputeJobLedger(root));
    await assert.rejects(
      () => restarted.poll("job:never-submitted"),
      (error: unknown) => {
        assert.ok(error instanceof UnknownComputeJobError, "the typed error stands");
        return true;
      },
    );
    await assert.rejects(
      () => restarted.history("job:never-submitted"),
      (error: unknown) => {
        assert.ok(error instanceof UnknownComputeJobError);
        return true;
      },
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
