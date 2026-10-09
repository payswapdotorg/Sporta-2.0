/**
 * A17 FULL-REAL loop test (Wave 3, worker-c lane).
 *
 * The complete seeded loop on ONE WorkGraph/artifact lineage with REAL
 * legs wherever the sandbox permits, honestly labeled per leg:
 *
 * EVIDENCE CLASS:
 *   - execution: REAL. The REAL ZCodeAgentRuntimeAdapter spawns a REAL
 *     child process (real spawn, real wall time, real stream-json
 *     events on real pipes, real exit code). The EXECUTABLE is the
 *     process-level stand-in (test/fixtures/zcode-cli-standin.mjs): the
 *     vendored apps/zcode-cli bundle is unbuildable in this sandbox
 *     (missing internal packages @zcode/model-option-map, @zcode/provider,
 *     @zcode/provider-node, @zcode/zcode-cua, @zcode/shared) — real
 *     zcode-cli execution remains unmeasured (BLOCKERS in the wave-2
 *     report carry this).
 *   - storage: REAL. The REAL FsArtifactBlobStore on a REAL temp dir —
 *     real files on real disk, real sha-256 content addresses, read back
 *     and verified byte-identical, measured (bytes, files, wall time).
 *   - editor: REAL. The REAL KdenliveAdapter — real MLT XML parsed,
 *     mutated, serialized and re-parsed (round-trip identity asserted),
 *     through the REAL EditorBrokerService reconcile path; the new
 *     revision's content hash is the real content address of the real
 *     serialized XML bytes in the blob store.
 *   - arena: REAL. The REAL HttpArenaTransport over a REAL localhost
 *     HTTP server (real TCP sockets, real fetch requests, real status
 *     codes, real wire JSON) — the Arena ROLE behind the server is
 *     fixture-scripted (the W2 transport-test pattern). When the stub's
 *     lifecycle passes validating -> accepted_result it flips the result
 *     record's `validated` flag — the ARENA-side validation gate (the
 *     lifecycle's own meaning), never Sporta-side validation; the
 *     Sporta verdict (validateResult) is computed and asserted
 *     separately below.
 *   - read seams: escalations = the REAL ArenaClientService read seam
 *     (W3C-1) over the real HTTP transport; learningArtifacts = the REAL
 *     LearningIntakeService read seam (W3C-2). editorSessionHistory and
 *     organizationCandidates are test-local adapters typed from the
 *     frozen contracts shapes (worker-b's/worker-a's wave-3 lanes own
 *     those module implementations) reflecting REAL broker sessions and
 *     REAL registry drafts/promotions.
 *   - FIXTURE: the work-graph/organization/preference stores
 *     (InMemoryWorkGraphStore etc. — v1 has no FS stores for those) and
 *     the scripted Arena role / expert session.
 *
 * A17 law asserted: the WorkGraph only ever APPENDED and revision r1 is
 * preserved byte-identically; every ProductLoopTrace stage reaches done
 * (the first full-loop green trace), with a mid-loop trace showing the
 * loop honestly in flight.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentRunEvent } from "@sporta/contracts/contract";
import { ZCodeAgentRuntimeAdapter, systemClockNow } from "@sporta/work/contract";
import { KdenliveAdapter, sha256EditorHash } from "@sporta/editors/contract";
import { StubArenaRole } from "./a17FullRealSupport.js";
import {
  INITIAL_MLT_XML,
  ISO_8601,
  ORG_ID,
  STANDIN_PATH,
  T0,
  WORK_GRAPH_ID,
  buildFullRealComposition,
  countFiles,
  intent,
  orgDraftFor,
  policy,
  userEditedState,
} from "./a17FullRealFixtures.js";

test("A17 full-real loop: every ProductLoopTrace stage done on one real-evidence lineage", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-a17-full-real-"));
  const arenaRole = await StubArenaRole.start();
  try {
    const {
      workService,
      registry,
      resolver,
      evaluation,
      artifacts,
      blobStore,
      editors,
      arena,
      learningIntake,
      editorHistory,
      candidateTrace,
      projection,
    } = buildFullRealComposition(tempRoot, arenaRole);

    // --- stage 1: intent ---
    const graph = await workService.openIntent({ workGraphId: WORK_GRAPH_ID, intent });
    assert.equal(graph.status, "open");
    const nodesBefore = graph.nodes.length;

    // --- stage 2: organization v1 (draft -> promote -> explainable resolve) ---
    const orgV1 = orgDraftFor(1);
    await registry.registerDraft({ record: orgV1 });
    candidateTrace.draftRegistered(orgV1, "v1 baseline composition");
    const promotionV1 = await registry.promote({ organizationId: ORG_ID, version: 1 });
    candidateTrace.promoted(promotionV1);
    assert.equal(promotionV1.decision, "promoted");
    const selection = await resolver.resolve({
      intent,
      workGraph: graph,
      userRef: "user:operator",
      environmentProfile: "local",
      constraints: [],
    });
    assert.equal(selection.selected.organization.organizationId, ORG_ID);

    // --- stage 3: execution, REAL (real spawn / pipes / wall time / exit code) ---
    const runtime = new ZCodeAgentRuntimeAdapter({
      now: systemClockNow,
      zcodeCliPath: STANDIN_PATH,
    });
    const executionStartedWall = Date.now();
    const handle = await runtime.startRun({
      workGraphId: WORK_GRAPH_ID,
      organization: selection.selected.organization,
      task: "render the tactical board from the authorized source",
    });
    const isTerminal = (event: AgentRunEvent | undefined): boolean =>
      event !== undefined && (event.type === "completed" || event.type === "failed");
    let events: readonly AgentRunEvent[] = [];
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      events = await runtime.observeRun(handle.runId);
      if (isTerminal(events[events.length - 1])) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const executionWallMs = Date.now() - executionStartedWall;
    assert.ok(events.length > 0, "the real process produced observable events");
    assert.equal(
      events[events.length - 1]?.type,
      "completed",
      "the real process exited successfully",
    );
    assert.ok(events[events.length - 1]?.detail.includes("exited with code 0"));
    for (const event of events) assert.ok(ISO_8601.test(event.at), "real ISO-8601 timestamps");
    const appendAgent = (input: {
      kind: "task" | "run" | "artifact" | "outcome";
      nodeId: string;
      parent?: string;
    }) =>
      workService.appendNode({
        workGraphId: WORK_GRAPH_ID,
        actor: { actorKind: "agent-run", actorRef: handle.runId },
        ...input,
      });
    await appendAgent({ kind: "task", nodeId: "task:render" });
    await appendAgent({ kind: "run", nodeId: handle.runId });

    // --- stage 4: durable artifact; REAL storage (real files, real hashes) ---
    const renderBytes = new TextEncoder().encode(
      "tactical-board-render-v1: 1920x1080@25fps, authorized source only",
    );
    const storageStartedWall = Date.now();
    const r1Hash = await blobStore.put(renderBytes);
    const storageWallMs = Date.now() - storageStartedWall;
    await artifacts.recordArtifact({
      artifactId: "art:a17-full",
      kind: "tactical-board-video",
      editability: "editable",
      policy,
    });
    const r1 = await artifacts.commitRevision({
      artifactId: "art:a17-full",
      revisionId: "rev:a17-full-1",
      contentHash: r1Hash,
      organizationVersion: { organizationId: ORG_ID, version: 1 },
      toolVersions: ["sporta-render@0"],
      provenance: { sourceKind: "agent-run", sourceRef: handle.runId, capturedAt: T0 },
      policy,
    });
    await appendAgent({ kind: "artifact", nodeId: "art:a17-full", parent: handle.runId });
    // REAL read-back: stored bytes hash back to the content address.
    const r1ReadBack = await blobStore.read(r1Hash);
    assert.deepEqual(r1ReadBack, renderBytes, "the real blob reads back byte-identical");

    // --- stage 5 + 6: REAL kdenlive editor session + user takeover ---
    const kdenlive = new KdenliveAdapter(sha256EditorHash);
    const editorStartedWall = Date.now();
    const parsed = kdenlive.parseKdenliveXml(INITIAL_MLT_XML); // REAL parse
    const editedState = userEditedState(parsed); // the scripted user edit (pure)
    const editedXml = kdenlive.exportToKdenliveXml(editedState); // REAL serialize
    const reparsed = kdenlive.parseKdenliveXml(editedXml); // REAL re-parse
    assert.deepEqual(
      reparsed,
      editedState,
      "real MLT round-trip identity (parse -> serialize -> parse)",
    );
    const editorWallMs = Date.now() - editorStartedWall;

    const session = await editors.openSession({
      editorSessionId: "es:a17-full",
      revisionId: "rev:a17-full-1",
      editorId: "kdenlive",
      mode: "local",
      policy,
    });
    assert.equal(session.integrationLevel, 2, "the real kdenlive adapter is integration level 2");
    editorHistory.record(session);

    const xmlBytes = new TextEncoder().encode(editedXml);
    const r2PutStarted = Date.now();
    const r2Hash = await blobStore.put(xmlBytes); // REAL file for the edited project
    const r2PutWallMs = Date.now() - r2PutStarted;
    const reconciled = await editors.reconcileSession({
      editorSessionId: "es:a17-full",
      changedProjectHash: r2Hash,
      externalTool: { name: "kdenlive", version: "24.08.0" },
      projectFormat: "kdenlive",
      projectState: editedState,
    });
    assert.equal(reconciled.understood, true, "the real kdenlive adapter understood the project");
    assert.equal(reconciled.revision.parentRevisionId, "rev:a17-full-1");
    assert.ok(
      reconciled.delta.operations.length > 0,
      "real derived edit operations from the real MLT state",
    );
    const userAppend = await workService.appendNode({
      workGraphId: WORK_GRAPH_ID,
      nodeId: "edit:user-1",
      kind: "action",
      parent: "art:a17-full",
      actor: { actorKind: "user", actorRef: "user:operator" },
    });
    assert.ok(userAppend.seq > 0, "user takeover is first-class lineage");

    // --- stage 7: learning consent (the REAL W3C-2 intake seam is live) ---
    // (the user action append above already drove status -> awaiting-user)
    const learningArtifact = await learningIntake.recordConsent({
      workGraphId: WORK_GRAPH_ID,
      userId: "user:operator",
      scopes: ["workflow", "organization-composition"],
      decision: "granted",
    });
    assert.equal(learningArtifact.status, "candidate");
    assert.equal(learningArtifact.scope, "user");

    // --- stage 8: capability gap (typed, evidence-backed) ---
    const gap = await arena.recordGap({
      gapId: "gap:a17-full",
      workGraphId: WORK_GRAPH_ID,
      capabilityNeed: "broadcast-frame-tracking",
      attemptedStrategies: ["builtin-tracker@0"],
      contextRefs: [WORK_GRAPH_ID, "art:a17-full"],
      evidence: [],
    });
    assert.equal(gap.status, "open");

    // --- stage 9: REAL HTTP escalation over real TCP ---
    await workService.transitionStatus(WORK_GRAPH_ID, "escalated");
    const escalateInput = {
      idempotencyKey: "esc:a17-full-key",
      gapId: "gap:a17-full",
      tenantRef: "tenant:operator",
      urgency: "high" as const,
      sessionMode: "unblock" as const,
      permittedActions: ["observe", "correct"],
      learningPermissions: { scopes: ["workflow", "capability"] as const, requireConsent: true },
      contextRefs: ["gap:a17-full"],
      policy,
    };
    const arenaStartedWall = Date.now();
    const escalation = await arena.escalate(escalateInput); // REAL POST over a real socket
    const posts = arenaRole.requests.filter((request) => request.method === "POST");
    assert.equal(posts.length, 1, "exactly one real POST /escalations crossed the wire");
    assert.deepEqual(
      posts[0]?.body,
      { escalation: { ...escalation }, contextRefs: ["gap:a17-full"] },
      "context minimization on the real wire: exactly the caller's refs",
    );
    // The scripted expert session works the escalation to a submitted result.
    arenaRole.advanceTo(escalation.escalationId, "submitted");
    const result = await arena.readResult(escalation.escalationId); // REAL GET
    const arenaWallMs = Date.now() - arenaStartedWall;
    assert.ok(result !== null, "the Arena-side result exists (read over a real GET)");
    assert.equal(result?.validated, false, "the Arena never claims Sporta-side validation");
    assert.ok(arenaWallMs > 0, "real wall time for the arena leg");

    // --- stage 10: Sporta validates before applying (verdict-only) ---
    const verdict = await arena.validateResult(result);
    assert.equal(verdict.accepted, true, "the real validation checks all pass");
    assert.ok(verdict.checks.every((check) => check.passed));

    // --- stage 11: organization v2 candidate improved by the validated learning ---
    const orgV2 = {
      ...orgDraftFor(2),
      learnedPreferences: [learningArtifact.learningArtifactId],
      evidence: [...orgDraftFor(1).evidence, promotionV1.promotionId],
    };
    await registry.registerDraft({ record: orgV2 });
    candidateTrace.draftRegistered(orgV2, "v2 candidate improved by Arena-validated learning");

    // --- MID-LOOP TRACE: the loop honestly in flight ---
    const midTrace = await projection.trace(WORK_GRAPH_ID);
    assert.deepEqual(
      midTrace.stages.map((stage) => stage.state),
      [
        "done", // intent
        "done", // organization
        "active", // execution (status escalated, no outcome yet)
        "done", // progress
        "done", // artifact
        "done", // takeover (real reconciled revision)
        "done", // editor
        "active", // learning (candidate, not yet promoted)
        "done", // capability-gap (escalation recorded)
        "active", // arena (in flight: submitted)
        "active", // result (exists, awaiting validation)
        "active", // organization-improvement (v2 candidate)
      ],
      `mid-loop trace shows the loop in flight (stages: ${midTrace.stages.map((s) => `${s.stage}:${s.state}`).join(", ")})`,
    );

    // --- stage 12: evaluation (intervention cost is a first-class signal) ---
    const report = await evaluation.evaluateCandidates({
      candidates: [
        { organization: orgV1, rationale: "v1 baseline", evidence: [] },
        {
          organization: orgV2,
          rationale: "v2 candidate improved by Arena-validated learning",
          evidence: [learningArtifact.learningArtifactId],
        },
      ],
      evidence: [learningArtifact.learningArtifactId],
      interventionCost: { manualInterventions: 1, userSeconds: 45 },
    });
    assert.ok(report.metrics.some((metric) => metric.axis === "intervention-cost"));

    // --- stage 13: promotion of the improved organization ---
    const promotionV2 = await registry.promote({ organizationId: ORG_ID, version: 2 });
    candidateTrace.promoted(promotionV2);
    assert.equal(promotionV2.decision, "promoted");
    assert.notEqual(promotionV2.promotionId, promotionV1.promotionId);

    // --- stage 14: the Arena-side validation gate accepts the result ---
    arenaRole.advanceTo(escalation.escalationId, "accepted_result");
    const finalResult = await arena.readResult(escalation.escalationId); // REAL GET
    assert.ok(finalResult !== null);
    assert.equal(
      finalResult?.validated,
      true,
      "the ARENA-side validated flag flipped at accepted_result",
    );
    assert.equal((await arena.listResults({ escalationId: escalation.escalationId })).length, 1);

    // --- stage 15: outcome closes the loop (append-driven) ---
    await appendAgent({ kind: "outcome", nodeId: "outcome:loop-complete", parent: "task:render" });
    const closed = await workService.readWorkGraph(WORK_GRAPH_ID);
    assert.equal(closed?.status, "closed");

    // === FINAL TRACE: EVERY stage done (the first full-loop green trace) ===
    const trace = await projection.trace(WORK_GRAPH_ID);
    assert.deepEqual(
      trace.stages.map((stage) => stage.stage),
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
    for (const stage of trace.stages) {
      assert.equal(
        stage.state,
        "done",
        `stage ${stage.stage} must be done (got ${stage.state}: ${stage.detail})`,
      );
    }
    const finalStages = new Map(trace.stages.map((stage) => [stage.stage, stage]));
    assert.match(
      finalStages.get("organization")?.ref ?? "",
      new RegExp(`^${ORG_ID}@v2$`),
      "the improved organization v2 is selected",
    );
    assert.equal(finalStages.get("artifact")?.detail, "2 revision(s)");
    assert.equal(finalStages.get("arena")?.detail, "escalation concluded (accepted_result)");
    assert.equal(finalStages.get("result")?.detail, "1 validated result(s)");
    assert.match(finalStages.get("learning")?.ref ?? "", /^learn:user:operator:wg:a17-full/);

    // === A17 law: the canonical WorkGraph only ever APPENDED ===
    const finalGraph = await workService.readWorkGraph(WORK_GRAPH_ID);
    assert.ok(finalGraph !== null);
    assert.ok(finalGraph.nodes.length > nodesBefore);
    assert.deepEqual(
      finalGraph.nodes.slice(0, nodesBefore),
      graph.nodes,
      "pre-existing nodes are never rewritten",
    );
    assert.ok(
      finalGraph.nodes.every(
        (node, index) => index === 0 || finalGraph.nodes[index - 1].seq < node.seq,
      ),
      "seq stays strictly monotonic",
    );

    // === A17 law: the artifact lineage preserved r1 (never overwritten) ===
    const r1After = await artifacts.readRevision("rev:a17-full-1");
    assert.deepEqual(r1After, r1, "revision r1 is byte-identical after the whole loop");
    const lineage = await artifacts.lineage("art:a17-full");
    assert.equal(lineage.length, 2, "r1 -> r2 chain");
    assert.equal(lineage[1]?.parentRevisionId, "rev:a17-full-1");
    const r2ReadBack = await blobStore.read(r2Hash);
    assert.deepEqual(r2ReadBack, xmlBytes, "the edited project blob reads back byte-identical");

    // === REAL measurements (honest metrics, printed for the report) ===
    const blobFileCount = await countFiles(join(tempRoot, "blobs"));
    console.log("A17 FULL-REAL EVIDENCE:");
    console.log(
      `- execution (real process): wall ${executionWallMs}ms, ${events.length} stream-json events, exit code 0`,
    );
    console.log(
      `- storage (real FS): ${blobFileCount} blob file(s), ${renderBytes.length}+${xmlBytes.length} bytes, content-verified read-back, wall ${storageWallMs}ms + ${r2PutWallMs}ms`,
    );
    console.log(
      `- editor (real MLT XML): parsed ${INITIAL_MLT_XML.length} chars, serialized ${editedXml.length} chars, round-trip identity asserted, ${reconciled.delta.operations.length} derived operations, wall ${editorWallMs}ms`,
    );
    console.log(
      `- arena (real HTTP): ${arenaRole.requests.length} real request(s) [${arenaRole.requests.map((r) => `${r.method} ${r.path}`).join(", ")}], wall ${arenaWallMs}ms`,
    );
    runtime.dispose();
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
