/**
 * W11A-3 Home view-model tests — `deriveSportaHomeView` fed by REAL
 * states from the REAL headless host composition (node:test + tsx; the
 * sportaHost.test.ts precedent: temp dir, real stores, clean teardown),
 * by the honestly-labeled browser fixture host, and by synthetic
 * traces for the pure edge lanes.
 *
 * EVIDENCE CLASS (honestly labeled):
 *   - REAL: the composition legs behind `createSportaHost` — the real
 *     spawned child process (the labeled stand-in executable), the real
 *     FS blob store on a real temp dir, the real localhost HTTP arena
 *     (the Arena ROLE behind it is fixture-scripted), and the real
 *     learning-intake write path the consent card drives.
 *   - FIXTURE (labeled): the in-memory stores + seed data behind the
 *     composition, the scripted Arena role, the stand-in executable,
 *     the browser fixture host state, and the synthetic pure-edge
 *     traces. The React render layer (HomeScreen.tsx) is BUILD-VERIFIED
 *     via tsc -b (the SportaPanel precedent).
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { ProductLoopTrace } from "@sporta/product/contract";
import { createSportaHost } from "../src/sporta/composition.js";
import { createBrowserFixtureHost } from "../src/sporta/browserFixtureHost.js";
import type { SportaHostState } from "../src/sporta/hostPorts.js";
import type { StudioSamplePreviewView } from "../src/sporta/studio/studioPorts.js";
import { StubArenaRole } from "./support/stubArenaRole.js";
import {
  deriveSportaHomeView,
  type SportaHomeAttention,
} from "../src/sporta/product/home/homeModel.js";

const STANDIN_PATH = fileURLToPath(new URL("./fixtures/zcode-cli-standin.mjs", import.meta.url));
const WORK_GRAPH_ID = "wg:sporta-host";

function attentionTitles(items: readonly SportaHomeAttention[]): string[] {
  return items.map((item) => item.title);
}

/** Derive the counts straight from a trace (independent of the model). */
function countsOf(trace: ProductLoopTrace) {
  const counts = { done: 0, active: 0, blocked: 0, refused: 0, pending: 0 };
  for (const stage of trace.stages) counts[stage.state] += 1;
  return counts;
}

test("W11A home (REAL composition): honest view mid-loop — evidence verbatim, attention state-driven", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-home-"));
  const arenaRole = await StubArenaRole.start();
  try {
    const { host, loop, dispose } = createSportaHost({
      zcodeCliPath: STANDIN_PATH,
      blobRoot: join(tempRoot, "blobs"),
      arenaBaseUrl: arenaRole.baseUrl,
    });
    try {
      await loop.openIntent();
      await loop.registerOrganizationDraft(1);
      await loop.promoteOrganization(1);
      await loop.runExecution("render the tactical replay of the authorized clip");
      await loop.seedRenderArtifact();
      await loop.recordGapAndEscalate("gap:home-1");

      const state = await host.readState();
      const view = deriveSportaHomeView(state, null);

      // Evidence VERBATIM (UI-15): the headless composition reports real.
      assert.equal(view.evidence, "real");
      assert.equal(view.workGraphId, WORK_GRAPH_ID);

      // Stage counts are honest against the trace itself.
      const expected = countsOf(state.trace);
      assert.deepEqual({ ...view.stageCounts, total: view.stageCounts.total }, {
        total: state.trace.stages.length,
        done: expected.done,
        active: expected.active,
        blocked: expected.blocked,
        refused: expected.refused,
        pending: expected.pending,
      });
      assert.equal(view.stageCounts.total, 12);

      // Attention is state-driven: the learning decision is genuinely
      // open (no consent yet) and the escalation is in flight.
      const titles = attentionTitles(view.attention);
      assert.ok(titles.includes("Learning consent decision pending"), `got: ${titles.join(" | ")}`);
      assert.ok(titles.includes("An escalation with the Arena is in flight"), `got: ${titles.join(" | ")}`);

      // Ordering law: blocked -> refused -> attention -> info.
      const severities = view.attention.map((item) => item.severity);
      const rank = { blocked: 0, refused: 1, attention: 2, info: 3 } as const;
      for (let index = 1; index < severities.length; index += 1) {
        assert.ok(
          rank[severities[index]!] >= rank[severities[index - 1]!],
          "attention severity order must be non-decreasing",
        );
      }

      // Start actions (UI-07): recorded feed + resume functional, live
      // source honestly disabled WITH a reason (UI-06).
      const byId = new Map(view.startActions.map((action) => [action.id, action]));
      assert.equal(byId.get("recorded-feed")?.enabled, true);
      assert.deepEqual(byId.get("recorded-feed")?.target, { screen: "studio" });
      assert.equal(byId.get("live-source")?.enabled, false);
      assert.match(byId.get("live-source")?.disabledReason ?? "", /[Ll]ive[- ]source/);
      assert.equal(byId.get("resume-project")?.enabled, true);

      // The raw trace is carried as secondary technical evidence (UI-05).
      assert.equal(view.trace.length, 12);
    } finally {
      await dispose();
    }
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W11A home (REAL write path): consent flips the learning decision honestly", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-home-consent-"));
  const arenaRole = await StubArenaRole.start();
  try {
    const { host, loop, dispose } = createSportaHost({
      zcodeCliPath: STANDIN_PATH,
      blobRoot: join(tempRoot, "blobs"),
      arenaBaseUrl: arenaRole.baseUrl,
    });
    try {
      await loop.openIntent();
      await loop.registerOrganizationDraft(1);
      await loop.promoteOrganization(1);

      const before = deriveSportaHomeView(await host.readState(), null);
      assert.equal(before.learningStage.state, "pending");
      assert.ok(attentionTitles(before.attention).includes("Learning consent decision pending"));

      // The Home card's write path: the EXISTING host port write seam.
      const granted = await host.submitConsent({
        scopes: ["workflow", "capability"],
        decision: "granted",
      });
      assert.equal(granted.outcome, "granted");

      const after = deriveSportaHomeView(await host.readState(), null);
      assert.equal(after.learningStage.state, "active");
      assert.ok(
        !attentionTitles(after.attention).includes("Learning consent decision pending"),
        "the decision item disappears once the decision is made",
      );
    } finally {
      await dispose();
    }
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W11A home (FIXTURE host, labeled): the browser fixture state derives honestly", async () => {
  const host = createBrowserFixtureHost();
  const state: SportaHostState = await host.readState();
  const view = deriveSportaHomeView(state, null);

  // The fixture host's label flows VERBATIM — never claimed real.
  assert.equal(view.evidence, "fixture");
  assert.equal(view.stageCounts.total, 12);
  assert.deepEqual(
    {
      done: view.stageCounts.done,
      active: view.stageCounts.active,
      blocked: view.stageCounts.blocked,
      refused: view.stageCounts.refused,
      pending: view.stageCounts.pending,
    },
    { done: 8, active: 0, blocked: 0, refused: 0, pending: 4 },
    `fixture counts (got: ${JSON.stringify(view.stageCounts)})`,
  );
  assert.equal(view.projectSummary, "8 of 12 stages complete · finishing");
  assert.ok(attentionTitles(view.attention).includes("Learning consent decision pending"));
});

test("W11A home (PURE): quiet trace -> empty attention; blocked/refused lead with product copy", () => {
  const quiet: SportaHostState = {
    workGraphId: "wg:synthetic",
    evidence: "fixture", // synthetic trace — labeled fixture
    trace: {
      workGraphId: "wg:synthetic",
      stages: [
        { stage: "intent", state: "done" },
        { stage: "organization", state: "done" },
        { stage: "execution", state: "done" },
        { stage: "progress", state: "done" },
        { stage: "artifact", state: "done" },
        { stage: "takeover", state: "done" },
        { stage: "editor", state: "done" },
        { stage: "learning", state: "done" },
        { stage: "capability-gap", state: "done" },
        { stage: "arena", state: "done" },
        { stage: "result", state: "pending" },
        { stage: "organization-improvement", state: "pending" },
      ],
    },
  };
  const view = deriveSportaHomeView(quiet, null);
  assert.equal(view.attention.length, 0, "a quiet loop needs no attention items");
  assert.equal(view.projectSummary, "10 of 12 stages complete · finishing");

  const troubled: SportaHostState = {
    ...quiet,
    trace: {
      ...quiet.trace,
      stages: [
        ...quiet.trace.stages.filter((stage) => stage.stage !== "execution"),
        { stage: "execution", state: "blocked", detail: "the run lane refused the task" },
      ],
    },
  };
  const troubledView = deriveSportaHomeView(troubled, null);
  assert.equal(troubledView.attention[0]?.severity, "blocked");
  assert.equal(troubledView.attention[0]?.title, "The production run is blocked");
  assert.equal(troubledView.attention[0]?.detail, "the run lane refused the task", "detail VERBATIM");
  assert.equal(troubledView.attention[0]?.stage, "execution", "the technical stage label travels");
  assert.match(troubledView.projectSummary, /blocked/);
});

test("W11A home (PURE): the sample-run card carries the studio seam's grade VERBATIM", () => {
  const sample: StudioSamplePreviewView = {
    pipelineId: "pipeline:sample-trim",
    version: "1.0.0",
    inputSummary: "5-event prerecorded sample feed",
    outputSummary: "1 output revision (rev:out-1)",
    semanticEvidence: "3 kept byte-exact, 2 dropped",
    evidenceGrade: "measured",
  };
  const view = deriveSportaHomeView(
    {
      workGraphId: "wg:synthetic",
      evidence: "fixture",
      trace: { workGraphId: "wg:synthetic", stages: [] },
    },
    sample,
  );
  assert.equal(view.sampleRun?.evidenceGrade, "measured", "never re-badged");
  assert.equal(view.sampleRun?.outputSummary, sample.outputSummary);
  assert.equal(view.sampleRun?.semanticEvidence, sample.semanticEvidence);
  assert.equal(view.sampleRun?.pipelineId, sample.pipelineId);
  assert.equal(view.sampleRun?.version, sample.version);
});
