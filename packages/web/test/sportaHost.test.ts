/**
 * W4C-3 headless host-composition test (packages/web, node:test + tsx —
 * the project law; no new framework, no browser harness).
 *
 * Drives the COMPOSITION MODULE (packages/web/src/sporta/composition.ts)
 * end-to-end through its two surfaces: the `host` port (the React
 * surface's exact contract: readState + the two write paths) and the
 * `loop` driver (headless loop primitives, mirroring the a17-full-real
 * sequence). The full loop covers consent ACCEPT and the takeover append
 * with every trace stage observable; a second test covers consent
 * DECLINE (the typed refusal surfaced, never swallowed) and the honest
 * failure paths.
 *
 * EVIDENCE CLASS (per the SPEC.md composition law, honestly labeled):
 *   - REAL: the process leg (real spawned child process on real pipes —
 *     the executable is the labeled stand-in at
 *     test/fixtures/zcode-cli-standin.mjs; the vendored zcode-cli remains
 *     unbuildable in this sandbox), the storage leg (real FsArtifactBlobStore
 *     on a real temp dir — real files, real content addresses), the editor
 *     leg (real KdenliveAdapter MLT parse -> mutate -> serialize -> re-parse
 *     with round-trip identity, through the real EditorBrokerService), the
 *     arena leg (real HttpArenaTransport over a real localhost HTTP server;
 *     the Arena ROLE behind it is fixture-scripted), and the read seams
 *     (real ArenaClientService, real LearningIntakeService, real
 *     OrganizationCandidateReadService, real EditorSessionHistoryService).
 *   - FIXTURE (labeled): the in-memory work/organization/preference/session
 *     stores, the seed data, the scripted Arena role, the stand-in
 *     executable.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createSportaHost } from "../src/sporta/composition.js";
import { StubArenaRole, countFiles } from "./support/stubArenaRole.js";

const STANDIN_PATH = fileURLToPath(new URL("./fixtures/zcode-cli-standin.mjs", import.meta.url));
const WORK_GRAPH_ID = "wg:sporta-host";
const LEARNING_ID = "learn:user:operator:wg:sporta-host:capability+workflow";

test("W4C-3 full-real host loop: both write paths real, every trace stage done", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-web-host-"));
  const arenaRole = await StubArenaRole.start();
  try {
    const { host, loop, dispose } = createSportaHost({
      zcodeCliPath: STANDIN_PATH,
      blobRoot: join(tempRoot, "blobs"),
      arenaBaseUrl: arenaRole.baseUrl,
    });
    try {
      // --- intent + organization v1 (real registry draft -> promotion) ---
      await loop.openIntent();
      await loop.registerOrganizationDraft(1);
      await loop.promoteOrganization(1);
      assert.equal(await loop.readGraphStatus(), "open");

      // --- execution: REAL process leg (real spawn, real wall time) ---
      const executionStarted = Date.now();
      const exec = await loop.runExecution("render the tactical board from the authorized source");
      const executionWallMs = Date.now() - executionStarted;
      assert.ok(exec.events > 0, "the real process produced observable events");
      assert.ok(exec.wallMs > 0, "real wall time for the process leg");

      // --- artifact: REAL storage leg (real files, real content address) ---
      const seed = await loop.seedRenderArtifact();
      assert.match(seed.contentHash, /^[0-9a-f]{64}$/, "a real sha-256 content address");
      const r1Path = join(
        tempRoot,
        "blobs",
        seed.contentHash.slice(0, 2),
        seed.contentHash.slice(2, 4),
        seed.contentHash.slice(4),
      );
      const r1Stat = await fs.stat(r1Path); // REAL file on real disk
      assert.ok(r1Stat.size > 0, "the r1 blob exists on the real FS");

      // --- write path B: takeover (real MLT round-trip + broker reconcile) ---
      const arenaRequestsBeforeTakeover = arenaRole.requests.length;
      const takeover = await host.submitTakeover({ label: "user-edit-1" });
      assert.equal(takeover.outcome, "appended");
      assert.ok(takeover.revisionId !== undefined, "a reconciled revision id is surfaced");
      assert.notEqual(takeover.revisionId, "rev:sporta-host-1", "a NEW revision, not the seed");
      assert.equal(
        arenaRole.requests.length,
        arenaRequestsBeforeTakeover,
        "the takeover leg never touches the Arena wire",
      );
      assert.equal(await countFiles(join(tempRoot, "blobs")), 2, "two real blobs on the real FS");

      // --- write path A: consent ACCEPT (real intake seam) ---
      const granted = await host.submitConsent({
        scopes: ["workflow", "capability"],
        decision: "granted",
      });
      assert.equal(granted.outcome, "granted");
      assert.equal(granted.detail, LEARNING_ID);

      // --- capability gap + REAL HTTP escalation ---
      const { escalationId } = await loop.recordGapAndEscalate("gap:sporta-host-1");
      const posts = arenaRole.requests.filter((request) => request.method === "POST");
      assert.equal(posts.length, 1, "exactly one real POST /escalations crossed the wire");
      assert.equal(await loop.readGraphStatus(), "escalated");

      // --- v2 draft: the live improvement candidate ---
      await loop.registerOrganizationDraft(2, [LEARNING_ID]);

      // --- the Arena role works the session to a submitted result ---
      arenaRole.advanceTo(escalationId, "submitted");

      // --- MID-LOOP TRACE: the loop honestly in flight ---
      const mid = await host.readState();
      assert.equal(mid.evidence, "real", "the headless composition reports REAL evidence");
      assert.equal(mid.workGraphId, WORK_GRAPH_ID);
      assert.deepEqual(
        mid.trace.stages.map((stage) => stage.state),
        [
          "done", // intent
          "done", // organization (v1 selected)
          "active", // execution (escalated, no outcome yet)
          "done", // progress (task + run + action)
          "done", // artifact (r1 committed)
          "done", // takeover (real reconciled revision r2)
          "done", // editor (same revision's evidence)
          "active", // learning (candidate, not yet promoted)
          "done", // capability-gap (escalation recorded)
          "active", // arena (session in flight)
          "active", // result (exists, awaiting validation)
          "active", // organization-improvement (v2 live candidate)
        ],
        `mid-loop trace shows the loop in flight (stages: ${mid.trace.stages
          .map((stage) => `${stage.stage}:${stage.state}:${stage.detail ?? ""}`)
          .join(", ")})`,
      );
      const midStages = new Map(mid.trace.stages.map((stage) => [stage.stage, stage]));
      assert.equal(midStages.get("organization")?.ref, "org:sporta-host@v1");

      // --- v2 promotion + Arena-side validation + outcome ---
      await loop.promoteOrganization(2);
      arenaRole.advanceTo(escalationId, "accepted_result");
      const arenaResult = await loop.arena().readResult(escalationId); // REAL GET; mirrors lifecycle
      assert.ok(arenaResult !== null, "the Arena result reads back over a real GET");
      assert.equal(
        arenaResult.validated,
        true,
        "the ARENA-side validated flag flipped at accepted_result",
      );
      await loop.appendOutcome("outcome:loop-complete");
      assert.equal(await loop.readGraphStatus(), "closed", "the loop closes append-driven");

      // === FINAL TRACE: every stage done (through the host read surface) ===
      const final = await host.readState();
      assert.deepEqual(
        final.trace.stages.map((stage) => stage.stage),
        [
          "intent",
          "organization",
          "execution",
          "progress",
          "artifact",
          "takeover",
          "editor",
          "learning",
          "capability-gap",
          "arena",
          "result",
          "organization-improvement",
        ],
        "all 12 UX stages project in loop order",
      );
      for (const stage of final.trace.stages) {
        assert.equal(
          stage.state,
          "done",
          `stage ${stage.stage} must be done (got ${stage.state}: ${stage.detail})`,
        );
      }
      const finalStages = new Map(final.trace.stages.map((stage) => [stage.stage, stage]));
      assert.equal(finalStages.get("organization")?.ref, "org:sporta-host@v2");
      assert.equal(finalStages.get("artifact")?.detail, "2 revision(s)");
      assert.equal(finalStages.get("arena")?.detail, "escalation concluded (accepted_result)");
      assert.equal(finalStages.get("result")?.detail, "1 validated result(s)");
      assert.equal(finalStages.get("learning")?.ref, LEARNING_ID);
      assert.equal(
        finalStages.get("organization-improvement")?.detail,
        "2 promoted organization version(s)",
      );

      // === REAL measurements (honest metrics, printed for the report) ===
      console.log("W4C-3 HOST LOOP REAL EVIDENCE:");
      console.log(
        `- process (real spawn): ${exec.events} stream-json event(s), wall ${executionWallMs}ms, exit code 0 (stand-in executable, labeled)`,
      );
      console.log(
        `- storage (real FS): 2 blob file(s), r1 ${r1Stat.size} bytes at content ${seed.contentHash.slice(0, 12)}…, stat-verified on the real disk`,
      );
      console.log(
        `- arena (real HTTP): ${arenaRole.requests.length} real request(s) [${arenaRole.requests
          .map((request) => `${request.method} ${request.path}`)
          .join(", ")}]`,
      );
    } finally {
      await dispose();
    }
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W4C-3 consent DECLINE is a typed refusal; honest failure paths never lie", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-web-host-"));
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

      // DECLINE: the typed refusal is surfaced through the host, never swallowed.
      const refused = await host.submitConsent({ scopes: ["workflow"], decision: "denied" });
      assert.equal(refused.outcome, "refused");
      assert.equal(
        refused.detail,
        "learning consent denied by user user:operator for work graph wg:sporta-host — no learning artifact is created",
        "the LearningConsentRefusedError message surfaces verbatim",
      );

      // The projection honestly reports no learning artifact yet.
      const state = await host.readState();
      assert.equal(state.evidence, "real");
      const learning = state.trace.stages.find((stage) => stage.stage === "learning");
      assert.deepEqual(learning, {
        stage: "learning",
        state: "pending",
        detail: "no learning artifact in policy scope yet",
      });

      // Host surface law: non-refusal typed errors PROPAGATE (empty scopes).
      await assert.rejects(
        () => host.submitConsent({ scopes: [], decision: "granted" }),
        /learning consent with empty scopes — nothing to learn/,
      );

      // Takeover before any artifact revision is an honest failure, never a fabrication.
      const early = await host.submitTakeover({ label: "too-early" });
      assert.equal(early.outcome, "failed");
      assert.equal(early.detail, "no artifact revision to take over yet");
    } finally {
      await dispose();
    }
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
