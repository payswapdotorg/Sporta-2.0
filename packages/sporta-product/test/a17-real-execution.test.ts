/**
 * A17 seeded loop with the REAL ZCode AgentRuntime adapter at the
 * execution seam (Wave 2).
 *
 * EVIDENCE CLASS (honest labeling):
 *   - REAL: the execution leg. The REAL adapter spawns a REAL child
 *     process through the declared seam (zcode-cli headless interface:
 *     `--prompt <task> --output-format stream-json`). Every execution
 *     assertion below is a real process observation: real spawn, real
 *     wall time, real stream-json events on real pipes, real exit code.
 *   - FIXTURE: everything else — the stores (InMemoryWorkGraphStore), the
 *     organization record, and the EXECUTABLE itself. The vendored
 *     apps/zcode-cli workspace is missing internal packages required by
 *     its own dependency graph (@zcode/model-option-map, @zcode/provider,
 *     @zcode/provider-node, @zcode/zcode-cua, @zcode/shared), so the real
 *     zcode-cli bundle cannot be built in this sandbox;
 *     test/fixtures/zcode-cli-standin.mjs is a REAL process-level
 *     stand-in speaking the same headless interface (see BLOCKERS in the
 *     work report: real zcode-cli execution is unmeasured here).
 *
 * W4A-1 STABILIZED OBSERVATION (the W3-C flake fix): the adapter now
 * guarantees exactly ONE terminal-type event per run, synthesized only
 *     from the real process lifecycle (the exit code / spawn error) and
 *     always recorded LAST — stream-json lines that look terminal are
 *     progress evidence, never verdicts. The polling loop below
 *     therefore breaks exactly when the run has truly terminated; the
 *     exit-code assertion is deterministic (previously the poll could
 *     sample the stand-in's stream "completed" line before the adapter
 *     synthesized the exit-code terminal — the recorded intermittent
 *     failure "the terminal event carries the real exit code: stand-in
 *     session completed"). No assertion was weakened; the observation
 *     was made deterministic (see zcodeAgentRuntime.ts W4A-1 laws +
 *     sporta-work/test/zcodeAgentRuntime.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { IntentSpec, OrganizationVersionRecord } from "@sporta/contracts/contract";
import type { AgentRunEvent } from "@sporta/work/contract";
import {
  InMemoryWorkGraphStore,
  WorkGraphService,
  ZCodeAgentRuntimeAdapter,
  systemClockNow,
} from "@sporta/work/contract";

const STANDIN_PATH = fileURLToPath(new URL("./fixtures/zcode-cli-standin.mjs", import.meta.url));

const policy: IntentSpec["policy"] = {
  rights: { holders: ["holder:operator"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const intent: IntentSpec = {
  goal: "produce a sports performance analysis report",
  constraints: ["authorized sources only"],
  artifactRequirements: ["analysis-report"],
  learningPolicy: { scopes: ["workflow"], requireConsent: true },
  policy,
};

const organization: OrganizationVersionRecord = {
  organizationId: "org:a17-real",
  version: 1,
  intentProfile: "sports-analysis",
  roleGraph: [],
  agentBodies: [],
  cognitiveSubstrates: [],
  toolGraph: [],
  workflowGraph: [],
  environmentProfile: "local",
  fallbacks: [],
  budgets: {},
  learnedPreferences: [],
  evidence: [],
  policy,
};

const TASK = "Create a simple analysis report about sports performance metrics";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

test("A17 real execution: the REAL adapter runs a real process and the seeded loop preserves the WorkGraph lineage", async () => {
  const workService = new WorkGraphService({
    store: new InMemoryWorkGraphStore(),
    now: systemClockNow,
  });
  const runtime = new ZCodeAgentRuntimeAdapter({
    now: systemClockNow,
    zcodeCliPath: STANDIN_PATH,
  });

  // --- stage 1: intent -> open WorkGraph (fixture store) ---
  const graph = await workService.openIntent({ workGraphId: "wg:a17-real", intent });
  assert.strictEqual(graph.status, "open", "a fresh WorkGraph opens");
  const nodesBefore = graph.nodes.length;

  // --- stage 2: organization resolution input (fixture record) ---
  assert.strictEqual(organization.organizationId, "org:a17-real");

  // --- stage 3: REAL execution through the declared AgentRuntime seam ---
  const startedWall = Date.now();
  const handle = await runtime.startRun({ workGraphId: "wg:a17-real", organization, task: TASK });
  assert.strictEqual(handle.runId, "run:wg:a17-real:org:a17-real:1", "deterministic runId");
  assert.strictEqual(handle.workGraphId, "wg:a17-real");
  assert.ok(ISO_8601.test(handle.startedAt), "startedAt is a real ISO-8601 timestamp");

  // Seam law: idempotent per deterministic runId — a retry never re-spawns.
  const retry = await runtime.startRun({ workGraphId: "wg:a17-real", organization, task: TASK });
  assert.strictEqual(retry.runId, handle.runId);
  assert.strictEqual(retry.startedAt, handle.startedAt);

  // Seam law: the seam never fabricates history for unknown runs.
  assert.deepEqual(await runtime.observeRun("run:wg:a17-real:org:unknown:9"), []);

  // REAL wall-clock wait: poll the real process until its real terminal event.
  const isTerminal = (event: AgentRunEvent | undefined): boolean =>
    event !== undefined && (event.type === "completed" || event.type === "failed");
  let events: readonly AgentRunEvent[] = [];
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    events = await runtime.observeRun(handle.runId);
    if (isTerminal(events[events.length - 1])) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const wallMs = Date.now() - startedWall;

  // Real evidence: the run really happened in real time.
  assert.ok(events.length > 0, "the real process produced observable events");
  assert.ok(wallMs > 0, "real wall time elapsed");
  const terminal = events[events.length - 1];
  assert.ok(isTerminal(terminal), `the run reached a terminal event within 10s (events: ${events.length})`);
  assert.strictEqual(terminal.type, "completed", "the real process exited successfully");
  assert.ok(
    terminal.detail.includes("exited with code 0"),
    `the terminal event carries the real exit code: ${terminal.detail}`,
  );
  assert.ok(
    !events.some((event) => event.type === "failed"),
    "a run that exits 0 has no failed events (verdict comes from the exit code, not stderr)",
  );

  // W4A-1 stabilized observation — STRENGTHENED, never weakened: exactly
  // one terminal-type event exists (the adapter's exit-code synthesis is
  // the only terminal source; the stream's own "completed" line is
  // progress evidence, so no observer can sample a pseudo-terminal).
  assert.strictEqual(
    events.filter((event) => event.type === "completed" || event.type === "failed").length,
    1,
    "exactly one terminal-type event exists (the exit-code synthesis)",
  );
  // W4A-1: the terminal event is FINAL — after it is observed, no further
  // events can ever arrive (the process closed and the stdio drained),
  // so a settle-and-re-observe must return the byte-identical history.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(
    await runtime.observeRun(handle.runId),
    events,
    "the event list is final once the terminal event is observed",
  );

  // Adapter-owned monotonic seq: 1..N in observation order.
  assert.deepEqual(
    events.map((event) => event.seq),
    events.map((_, index) => index + 1),
    "seq is strictly monotonic from 1",
  );
  assert.strictEqual(events[0]?.type, "started", "the adapter records the real spawn first (seq 1)");
  assert.ok(
    events.some((event) => event.type === "progress"),
    "real stdout stream-json lines were parsed into progress events",
  );
  for (const event of events) {
    assert.ok(ISO_8601.test(event.at), `event ${event.seq} carries a real ISO-8601 timestamp`);
  }

  // Honest metrics in the test output (real measurements, not assertions).
  console.log("A17 REAL EXECUTION EVIDENCE:");
  console.log(`- wall time (spawn -> terminal observation): ${wallMs}ms`);
  console.log(`- observed events: ${events.length}`);
  console.log(`- terminal: ${terminal.type} (${terminal.detail})`);

  // --- stage 4: the run is first-class WorkGraph lineage (fixture store) ---
  const runNode = await workService.appendNode({
    workGraphId: "wg:a17-real",
    kind: "run",
    actor: { actorKind: "agent-run", actorRef: handle.runId },
  });
  assert.strictEqual(runNode.kind, "run");

  // Append-driven trigger: agent-activity moved the open graph to executing.
  const executing = await workService.readWorkGraph("wg:a17-real");
  assert.strictEqual(executing?.status, "executing", "the agent run drives open -> executing");

  // --- stage 5: the run's real exit is durable evidence in the graph ---
  const evidenceNode = await workService.appendNode({
    workGraphId: "wg:a17-real",
    kind: "evidence",
    parent: runNode.nodeId,
    actor: { actorKind: "agent-run", actorRef: handle.runId },
  });
  assert.strictEqual(evidenceNode.kind, "evidence");

  // --- stage 6: outcome closes the loop (append-driven, no skips) ---
  const outcomeNode = await workService.appendNode({
    workGraphId: "wg:a17-real",
    kind: "outcome",
    parent: runNode.nodeId,
    actor: { actorKind: "agent-run", actorRef: handle.runId },
  });
  assert.strictEqual(outcomeNode.kind, "outcome");
  const closed = await workService.readWorkGraph("wg:a17-real");
  assert.strictEqual(closed?.status, "closed", "work-completed drives executing -> closed");

  // --- invariants: the canonical WorkGraph only ever APPENDED ---
  const finalGraph = await workService.readWorkGraph("wg:a17-real");
  assert.ok(finalGraph !== null);
  assert.ok(finalGraph.nodes.length > nodesBefore, "the loop appended nodes");
  assert.deepEqual(
    finalGraph.nodes.slice(0, nodesBefore),
    graph.nodes,
    "pre-existing WorkGraph nodes are never rewritten",
  );
  assert.ok(
    finalGraph.nodes.every((node, index) => index === 0 || finalGraph.nodes[index - 1].seq < node.seq),
    "seq stays strictly monotonic",
  );

  // --- invariants: the append ledger carries the run's actor provenance ---
  const appends = await workService.readAppends("wg:a17-real");
  assert.ok(appends.length >= 3, "run + evidence + outcome are all in the ledger");
  for (const append of appends) {
    assert.strictEqual(append.actor.actorKind, "agent-run");
    assert.strictEqual(append.actor.actorRef, handle.runId, "ledger entries trace back to the real run");
  }

  // --- process hygiene: dispose after terminal completion is a safe no-op kill ---
  runtime.dispose();
});
