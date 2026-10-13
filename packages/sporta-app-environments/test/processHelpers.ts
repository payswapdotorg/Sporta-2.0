/**
 * REAL process legs for the Wave 9 Worker C test suites.
 *
 * EVIDENCE CLASS: fixture CONTENT, REAL processes — the demo local
 * application (tagboard) and the zcode-cli headless double (agent
 * wrapper) are REAL programs written to temp dirs (the W4A
 * zcodeAgentRuntime.test.ts / W9A deterministicFilterNode precedent:
 * script content is fixture-labeled; process lifecycle, pipes, exit
 * codes, files and wall-clock are real). The REAL verified-effect
 * sink commits through the REAL Artifact Fabric + WorkGraph refs port.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApplicationEffectSinkPort } from "../src/contract.js";
import { FixedClock, LocalApplicationAdapter, sha256Bytes } from "../src/contract.js";
import { hash, testPolicy } from "./helpers.js";

// ---------------------------------------------------------------------------
// The REAL demo local application (tagboard) — fixture CONTENT, REAL process.
// ---------------------------------------------------------------------------

export const TAGBOARD_APP_SOURCE = `#!/usr/bin/env node
// tagboard — demo local application (fixture CONTENT; the process and its
// state-file effects are REAL). Speaks the local-app CLI protocol:
//   describe | read-status | append-highlight <json>
import { readFileSync, writeFileSync } from "node:fs";

const STATE = "highlights.json";
const [command, payloadArg] = process.argv.slice(2);
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return { highlights: [] };
  }
}

if (command === "describe") {
  emit({
    applicationId: "app:local-tagboard",
    appVersion: "1.2.0",
    stateFile: STATE,
    actions: [
      {
        action: "read-status",
        mutates: false,
        summary: "read the tag board status",
        inputs: [],
        outputs: [{ name: "status", kind: "app/status" }],
        failures: ["app-exit-nonzero"],
      },
      {
        action: "append-highlight",
        mutates: true,
        summary: "append one highlight to the board",
        inputs: [
          { name: "label", kind: "app/highlight-label", required: true },
          { name: "eventId", kind: "app/event-id", required: true },
        ],
        outputs: [{ name: "entry", kind: "app/highlight-entry" }],
        failures: ["app-exit-nonzero"],
      },
    ],
  });
  process.exitCode = 0;
} else if (command === "read-status") {
  const state = readState();
  emit({ ok: true, output: { highlights: state.highlights.length } });
  process.exitCode = 0;
} else if (command === "append-highlight") {
  let payload = {};
  try {
    payload = JSON.parse(payloadArg ?? "{}");
  } catch {
    emit({ ok: false, error: "payload is not JSON" });
    process.exitCode = 1;
  }
  if (process.exitCode !== 1 && typeof payload.label === "string" && payload.label.length > 0) {
    const state = readState();
    const entry = {
      id: state.highlights.length + 1,
      label: payload.label,
      eventId: payload.eventId ?? null,
      atMs: payload.atMs ?? 0,
    };
    state.highlights.push(entry);
    writeFileSync(STATE, JSON.stringify(state, null, 2) + "\\n");
    emit({ ok: true, output: entry });
    process.exitCode = 0;
  } else if (process.exitCode !== 1) {
    emit({ ok: false, error: "label is required" });
    process.exitCode = 1;
  }
} else {
  emit({ ok: false, error: "unknown command " + String(command) });
  process.exitCode = 1;
}
`;

/**
 * Install the REAL demo app into a temp dir and bind the REAL local
 * adapter to it. Returns the app dir (for direct state-file reads in
 * assertions) and a cleanup.
 */
export async function installLocalTagBoardApp(): Promise<{
  adapter: LocalApplicationAdapter;
  appDirectory: string;
  appExecutable: string;
  statePath: string;
  cleanup: () => Promise<void>;
}> {
  const appDirectory = await fs.mkdtemp(join(tmpdir(), "sporta-w9c-app-"));
  const appExecutable = join(appDirectory, "tagboard.mjs");
  await fs.writeFile(appExecutable, TAGBOARD_APP_SOURCE, "utf8");
  await fs.chmod(appExecutable, 0o755);
  const clock = new FixedClock("2026-10-13T00:00:00.000Z");
  const adapter = new LocalApplicationAdapter({
    appExecutable,
    appDirectory,
    clock,
    hash,
  });
  return {
    adapter,
    appDirectory,
    appExecutable,
    statePath: join(appDirectory, "highlights.json"),
    cleanup: async () => {
      await fs.rm(appDirectory, { recursive: true, force: true });
    },
  };
}

/** Read the app's REAL state file (assertion helper). */
export async function readTagBoardState(statePath: string): Promise<{ highlights: unknown[] }> {
  try {
    return JSON.parse(await fs.readFile(statePath, "utf8")) as { highlights: unknown[] };
  } catch {
    return { highlights: [] };
  }
}

// ---------------------------------------------------------------------------
// The zcode-cli headless double (agent wrapper) — REAL process speaking
// the real headless interface; the app-action tool call is a REAL HTTP
// request to the generic tool endpoint (the W4A wrapper precedent).
// ---------------------------------------------------------------------------

export const AGENT_WRAPPER_SOURCE = `#!/usr/bin/env node
// agent-wrapper — the zcode-cli headless double for the W9C demo.
// REAL process: parses --prompt <task> --output-format stream-json,
// performs the requested attached-app action through the generic
// app-action tool endpoint over REAL localhost HTTP, and streams
// stream-json events on stdout with a REAL exit code.
const emit = (type, message) =>
  process.stdout.write(JSON.stringify({ type, message, timestamp: new Date().toISOString() }) + "\\n");

const args = process.argv.slice(2);
let task = "";
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--prompt") task = args[index + 1] ?? "";
}

emit("started", "agent session started for task: " + task);
const toolUrl = process.env.SPORTA_APP_TOOL_URL ?? "";
const sessionId = process.env.SPORTA_APP_SESSION_ID ?? "";
if (toolUrl === "" || sessionId === "") {
  emit("failed", "app-action tool environment not configured");
  process.exitCode = 1;
} else {
  try {
    const request = JSON.parse(task);
    const response = await fetch(toolUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        capabilityId: request.capabilityId,
        actor: request.actor ?? "agent:zcode-demo",
        parameters: request.parameters ?? {},
        confirmed: request.confirmed === true,
      }),
    });
    const result = await response.json();
    emit("progress", "app-action tool HTTP " + response.status + ": " + JSON.stringify(result));
    if (response.status !== 200) {
      emit("failed", "app-action tool refused transport: HTTP " + response.status);
      process.exitCode = 1;
    } else if (result.ok) {
      const revision = result.record?.reconciledRefs?.artifactRevisionIds?.[0] ?? "none";
      emit("completed", "app action succeeded; reconciled revision " + revision);
    } else {
      const reason = result.admission?.admitted === false ? result.admission.reason : result.record?.status;
      emit("completed", "app action not executed: " + reason + " — " + (result.record?.missingCoverageNote ?? ""));
    }
  } catch (error) {
    emit("failed", "app-action tool call failed: " + error.message);
    process.exitCode = 1;
  }
}
`;

/** Install the agent wrapper executable (real process program). */
export async function installAgentWrapper(): Promise<{
  wrapperPath: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await fs.mkdtemp(join(tmpdir(), "sporta-w9c-agent-"));
  const wrapperPath = join(dir, "agent-wrapper.mjs");
  await fs.writeFile(wrapperPath, AGENT_WRAPPER_SOURCE, "utf8");
  await fs.chmod(wrapperPath, 0o755);
  return { wrapperPath, cleanup: async () => {
    await fs.rm(dir, { recursive: true, force: true });
  } };
}

/**
 * Drive ONE app action through the REAL agent path: the REAL
 * ZCodeAgentRuntimeAdapter spawns the wrapper process with the task;
 * the wrapper performs the tool call over REAL HTTP; the adapter's
 * typed events and the REAL process exit code are the evidence
 * (polled to the terminal event — the W4A observation pattern).
 */
/** Agent-run identity counter: every agent run is a DISTINCT run (the
 * W4A idempotency law returns existing handles for repeated runIds —
 * a re-drive of the same logical action must be a new organization
 * version, never a silently skipped spawn). */
let agentOrganizationVersion = 0;

export async function runAgentAppAction(options: {
  runtime: import("@sporta/work/contract").AgentRuntimeExecutionPort & {
    dispose?(): void;
  };
  task: { capabilityId: string; parameters?: Record<string, unknown>; confirmed?: boolean; actor?: string };
  workGraphId: string;
  toolUrl: string;
  sessionId: string;
}): Promise<{ runId: string; events: readonly import("@sporta/work/contract").AgentRunEvent[] }> {
  agentOrganizationVersion += 1;
  const previousUrl = process.env.SPORTA_APP_TOOL_URL;
  const previousSession = process.env.SPORTA_APP_SESSION_ID;
  process.env.SPORTA_APP_TOOL_URL = options.toolUrl;
  process.env.SPORTA_APP_SESSION_ID = options.sessionId;
  try {
    const handle = await options.runtime.startRun({
      workGraphId: options.workGraphId,
      organization: {
        organizationId: "org:w9c-demo",
        version: agentOrganizationVersion,
        intentProfile: "sports-replay",
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
        policy: testPolicy,
      },
      task: JSON.stringify(options.task),
    });
    const deadline = Date.now() + 20_000;
    let events: readonly import("@sporta/work/contract").AgentRunEvent[] = [];
    while (Date.now() < deadline) {
      events = await options.runtime.observeRun(handle.runId);
      const last = events[events.length - 1];
      if (last !== undefined && (last.type === "completed" || last.type === "failed")) break;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return { runId: handle.runId, events };
  } finally {
    if (previousUrl === undefined) delete process.env.SPORTA_APP_TOOL_URL;
    else process.env.SPORTA_APP_TOOL_URL = previousUrl;
    if (previousSession === undefined) delete process.env.SPORTA_APP_SESSION_ID;
    else process.env.SPORTA_APP_SESSION_ID = previousSession;
  }
}

// ---------------------------------------------------------------------------
// The REAL verified-effect reconciliation sink: commits through the REAL
// Artifact Fabric service + REAL WorkGraph refs port (the product
// composition's wiring of the structural domain port).
// ---------------------------------------------------------------------------

/**
 * Build a REAL effect sink over the REAL ArtifactGraphService and
 * WorkGraphService (both passed in — the composition owns them). Every
 * verified effect becomes an immutable artifact revision plus an
 * artifact-revision ref appended to the SAME WorkGraph the run used.
 */
export function makeRealEffectSink(
  artifacts: import("../../sporta-artifacts/src/contract.js").ArtifactGraphPort,
  workGraphs: import("@sporta/work/contract").WorkGraphRefsPort &
    import("@sporta/work/contract").WorkGraphPort,
): ApplicationEffectSinkPort {
  return {
    async commitVerifiedEffect(input) {
      const artifactId = `art:app-effect:${input.sessionId}:${input.actionRecordId}`;
      await artifacts.recordArtifact({
        artifactId,
        kind: "app-effect-evidence",
        editability: "derived-only",
        policy: input.policy,
      });
      const contentHash = sha256Bytes(input.effect.evidenceBytes);
      const revisionId = `rev:app:${hash.text(`${artifactId}:${contentHash}`).slice(7, 31)}`;
      const lineage = await artifacts.lineage(artifactId);
      const parentRevisionId =
        lineage.length > 0 ? lineage[lineage.length - 1]?.revisionId : undefined;
      await artifacts.commitRevision({
        artifactId,
        revisionId,
        ...(parentRevisionId !== undefined ? { parentRevisionId } : {}),
        contentHash,
        toolVersions: ["sporta-app-environments:w9c"],
        provenance: input.provenance,
        policy: input.policy,
      });
      const node = await workGraphs.appendNode({
        workGraphId: input.workGraphId,
        kind: "artifact",
        actor: { actorKind: "agent-run", actorRef: input.provenance.sourceRef },
      });
      await workGraphs.commitArtifactRevision({
        workGraphId: input.workGraphId,
        nodeId: node.nodeId,
        revisionId,
      });
      return { artifactId, revisionId, appendedToNodeId: node.nodeId, workGraphId: input.workGraphId };
    },
  };
}
