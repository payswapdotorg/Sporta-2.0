/**
 * W7C-1 — the Completion journey (P8 acceptance, REAL lane).
 *
 * The roadmap's Completion paragraph, executed as ONE REAL lineage test:
 * a fresh user expresses intent → gets an explainable organization →
 * watches execution → edits manually in an integrated editor (Kdenlive) →
 * returns to the same WorkGraph/artifact (durable stores) → authorizes
 * learning → triggers Arena on a capability gap → receives a validated
 * result → and the REPLAY: a second run of the same journey with the
 * learning in place, with MEASURED reduced manual intervention.
 *
 * Every leg is labeled REAL or FIXTURE in the printed per-leg evidence
 * table (the acceptance artifact); see acceptanceSupport.ts for the
 * per-component evidence classes. Where the environment makes a leg
 * partially fixture (the stand-in executable; the scripted Arena ROLE
 * behind the real HTTP transport; v1 in-memory ledgers), the label says so
 * and the assertions are scoped to what is real — never faked.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { KdenliveProjectState } from "@sporta/contracts/contract";
import { StubArenaRole } from "../a17FullRealSupport.js";
import {
  CAPABILITY_NEED,
  INITIAL_MLT_XML,
  type JourneyComposition,
  type JourneyLedger,
  JourneyLedger as Ledger,
  USER,
  buildJourneyComposition,
  journeyIntent,
  journeyOrgDraft,
  organizationDeclaresCapability,
  policy,
  printJourneyEvidence,
  timelineCarriesUserClip,
  userEditedState,
  watchExecution,
} from "./acceptanceSupport.js";
import {
  assertMidJourneyTrace,
  assertRun1FinalTrace,
  assertRun2Trace,
  exerciseConsentLaw,
  journeyEvidenceLegs,
  promoteLearnedOrganization,
  readBackDurableStores,
  receiveValidatedResult,
} from "./acceptanceAssertions.js";

const WG_1 = "wg:journey-1";
const WG_2 = "wg:journey-2";
const ORG_ID = "org:journey";
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const appendAgent =
  (journey: JourneyComposition, workGraphId: string, actorRef: string) =>
  (input: { kind: "task" | "run" | "artifact" | "outcome"; nodeId: string; parent?: string }) =>
    journey.workService.appendNode({
      workGraphId,
      actor: { actorKind: "agent-run", actorRef },
      ...input,
    });

test("W7C-1 Completion journey: the full paragraph on one real lineage, replay included", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-completion-journey-"));
  const arenaRole = await StubArenaRole.start();
  const run1: JourneyLedger = new Ledger();
  const run2: JourneyLedger = new Ledger();
  try {
    const journey = buildJourneyComposition(tempRoot, arenaRole);
    const intent = journeyIntent();

    // ── RUN 1 — the fresh user's journey (wg:journey-1) ──────────────────
    // 1. express intent (REAL service; in-memory store is v1's labeled fixture).
    const graph1 = await journey.workService.openIntent({ workGraphId: WG_1, intent });
    assert.equal(graph1.status, "open");

    // 2. explainable organization (REAL registry draft→promote + resolver).
    const orgV1 = journeyOrgDraft(1);
    await journey.registry.registerDraft({ record: orgV1 });
    const promotionV1 = await journey.registry.promote({ organizationId: ORG_ID, version: 1 });
    assert.equal(promotionV1.decision, "promoted");
    const graph1ForResolve = (await journey.workService.readWorkGraph(WG_1))!;
    const selection1 = await journey.resolver.resolve({
      intent,
      workGraph: graph1ForResolve,
      userRef: USER,
      environmentProfile: "local",
      constraints: [],
    });
    assert.equal(selection1.selected.organization.organizationId, ORG_ID);
    assert.equal(selection1.selected.organization.version, 1);
    assert.match(
      selection1.selected.rationale,
      /rank 1 of/,
      "the selection is explainable (rationale surfaced)",
    );
    // The honest capability check: org v1 does NOT declare the needed capability.
    assert.equal(
      organizationDeclaresCapability(selection1.selected.organization, CAPABILITY_NEED),
      false,
      "org v1 lacks the capability — the gap the user will have to escalate",
    );

    // 3. watch execution (REAL process lane: real spawn/pipes/exit code; the
    //    executable is the labeled stand-in; events durably journaled).
    const execution1 = await watchExecution(journey, WG_1, "render the tactical board from the authorized source");
    assert.ok(execution1.events.length > 0, "the real process produced observable events");
    assert.equal(execution1.events.at(-1)?.type, "completed", "the real process exited successfully");
    assert.ok(execution1.events.at(-1)?.detail.includes("exited with code 0"));
    for (const event of execution1.events) assert.ok(ISO_8601.test(event.at));
    const appendRun1 = appendAgent(journey, WG_1, execution1.runId);
    await appendRun1({ kind: "task", nodeId: "task:render" });
    await appendRun1({ kind: "run", nodeId: execution1.runId });

    // 4. the artifact (REAL storage): the fresh render r1, content-verified.
    const renderBytes = new TextEncoder().encode(INITIAL_MLT_XML);
    const r1Hash = await journey.blobStore.put(renderBytes);
    await journey.artifacts.recordArtifact({
      artifactId: "art:journey",
      kind: "tactical-board-video",
      editability: "editable",
      policy,
    });
    const r1 = await journey.artifacts.commitRevision({
      artifactId: "art:journey",
      revisionId: "rev:journey-1-1",
      contentHash: r1Hash,
      organizationVersion: { organizationId: ORG_ID, version: 1 },
      toolVersions: ["sporta-render@0"],
      provenance: { sourceKind: "agent-run", sourceRef: execution1.runId, capturedAt: execution1.events[0]!.at },
      policy,
    });
    assert.equal(r1.revisionId, "rev:journey-1-1", "the committed revision id");
    await appendRun1({ kind: "artifact", nodeId: "art:journey", parent: execution1.runId });

    // Mid-journey trace: the loop honestly in flight (watched execution).
    assertMidJourneyTrace(await journey.projection.trace(WG_1));

    // 5. edit manually (REAL editor round-trip — the KdenliveAdapter
    //    precedent) — INTERVENTION 1: the user's standard is not met (the
    //    timeline lacks the user-imported replay clip).
    const parsed1 = journey.kdenlive.parseKdenliveXml(INITIAL_MLT_XML);
    assert.equal(timelineCarriesUserClip(parsed1), false, "the fresh render misses the user's clip");
    let r2Hash = ""; // the learned template's content address (run 2 reads it back)
    await run1.intervention("manual-edit", "kdenlive takeover: import the user replay clip", async () => {
      const editedState = userEditedState(parsed1);
      const editedXml = journey.kdenlive.exportToKdenliveXml(editedState);
      const reparsed = journey.kdenlive.parseKdenliveXml(editedXml);
      assert.deepEqual(reparsed, editedState, "real MLT round-trip identity");
      const session = await journey.editors.openSession({
        editorSessionId: "es:journey-1",
        revisionId: "rev:journey-1-1",
        editorId: "kdenlive",
        mode: "local",
        policy,
      });
      assert.equal(session.integrationLevel, 2);
      r2Hash = await journey.blobStore.put(new TextEncoder().encode(editedXml));
      const reconciled = await journey.editors.reconcileSession({
        editorSessionId: "es:journey-1",
        changedProjectHash: r2Hash,
        externalTool: { name: "kdenlive", version: "24.08.0" },
        projectFormat: "kdenlive",
        projectState: editedState,
      });
      assert.equal(reconciled.understood, true);
      assert.equal(reconciled.revision.parentRevisionId, "rev:journey-1-1");
    });
    assert.ok(r2Hash.length > 0, "the manual edit produced the learned template revision");
    await journey.workService.appendNode({
      workGraphId: WG_1,
      nodeId: "edit:user-1",
      kind: "action",
      parent: "art:journey",
      actor: { actorKind: "user", actorRef: USER },
    });

    // 6. return to the SAME WorkGraph/artifact — REAL durable read-backs
    //    with FRESH adapter instances over the same roots (support helper).
    const returnedGraph = await journey.workService.readWorkGraph(WG_1);
    assert.equal(returnedGraph?.workGraphId, WG_1, "the same work graph");
    const lineage1 = await journey.artifacts.lineage("art:journey");
    assert.equal(lineage1.length, 2, "the same artifact, the grown r1→r2 lineage");
    assert.equal(lineage1[0]?.revisionId, "rev:journey-1-1", "r1 preserved");
    assert.equal(lineage1[1]?.parentRevisionId, "rev:journey-1-1", "r2 is a child of r1");
    assert.match(
      lineage1[1]?.revisionId ?? "",
      /^rev:reconcile:/,
      "r2 is the broker's real deterministic reconcile revision",
    );
    const blobFiles = await readBackDurableStores(
      journey,
      join(tempRoot, "editor-history"),
      r1Hash,
      r2Hash,
      execution1.runId,
      renderBytes,
    );

    // 7. authorize learning (REAL intake law — grant AND the honest denial,
    //    driven by the support helper; the typed refusal creates nothing).
    const learningId = await exerciseConsentLaw(journey, WG_1, run1);

    // 8. trigger Arena on the capability gap — INTERVENTION 2 (REAL HTTP
    //    transport; the ROLE behind it is the labeled fixture).
    await journey.workService.transitionStatus(WG_1, "escalated");
    let escalationId = "";
    await run1.intervention("capability-escalation", "arena escalation: broadcast-frame-tracking", async () => {
      await journey.arena.recordGap({
        gapId: "gap:journey-1",
        workGraphId: WG_1,
        capabilityNeed: CAPABILITY_NEED,
        attemptedStrategies: ["builtin-tracker@0"],
        contextRefs: [WG_1, "art:journey"],
        evidence: [],
      });
      const escalation = await journey.arena.escalate({
        idempotencyKey: "esc:journey-1-key",
        gapId: "gap:journey-1",
        tenantRef: "tenant:operator",
        urgency: "high",
        sessionMode: "unblock",
        permittedActions: ["observe", "correct"],
        learningPermissions: { scopes: ["workflow", "capability"], requireConsent: true },
        contextRefs: ["gap:journey-1"],
        policy,
      });
      escalationId = escalation.escalationId;
    });
    assert.ok(escalationId.length > 0);
    const postsAfterRun1 = arenaRole.requests.filter((request) => request.method === "POST").length;
    assert.equal(postsAfterRun1, 1, "exactly one real POST /escalations crossed the wire in run 1");

    // 9. receive a validated result — BOTH gates honestly (the Sporta
    //    verdict AND the Arena-side lifecycle; support helper throws on any lie).
    await receiveValidatedResult(journey.arena, arenaRole, escalationId);

    // 10. the improvement: org v2 carrying the validated learning — REAL
    //     evaluation (intervention cost as a first-class signal) + promotion.
    await promoteLearnedOrganization(journey, {
      orgV1,
      learningId,
      promotionV1Id: promotionV1.promotionId,
      escalationId,
      manualInterventions: run1.manualInterventions,
      userSeconds: run1.userSeconds,
    });

    // 11. close run 1's loop; every trace stage done.
    await appendRun1({ kind: "outcome", nodeId: "outcome:loop-complete", parent: "task:render" });
    assertRun1FinalTrace(await journey.projection.trace(WG_1));

    // ── RUN 2 — the replay (wg:journey-2): same journey, learning in place ─
    const arenaRequestsBeforeRun2 = arenaRole.requests.length;
    const learningCountBeforeRun2 = (
      await journey.learningIntake.listLearningArtifacts({ limit: 50 })
    ).length;

    // 1'. the same intent, fresh run.
    const graph2 = await journey.workService.openIntent({ workGraphId: WG_2, intent });
    assert.equal(graph2.status, "open");

    // 2'. the explainable organization is now v2 — the learned composition.
    const graph2ForResolve = (await journey.workService.readWorkGraph(WG_2))!;
    const selection2 = await journey.resolver.resolve({
      intent,
      workGraph: graph2ForResolve,
      userRef: USER,
      environmentProfile: "local",
      constraints: [],
    });
    assert.equal(selection2.selected.organization.version, 2, "the promoted learned organization v2 is selected");
    assert.match(selection2.selected.rationale, /rank 1 of/);
    assert.equal(
      organizationDeclaresCapability(selection2.selected.organization, CAPABILITY_NEED),
      true,
      "v2 declares the Arena-learned capability — no gap this time",
    );

    // 3'. watch execution (a NEW real process run, durably journaled).
    const execution2 = await watchExecution(journey, WG_2, "render the tactical board from the learned composition");
    assert.equal(execution2.events.at(-1)?.type, "completed");
    assert.notEqual(execution2.runId, execution1.runId, "a genuinely new run");
    const appendRun2 = appendAgent(journey, WG_2, execution2.runId);
    await appendRun2({ kind: "task", nodeId: "task:render" });
    await appendRun2({ kind: "run", nodeId: execution2.runId });

    // 4'. the artifact IS the learned template — run 1's user-edited revision
    //     read back BYTE-IDENTICAL from the real durable blob store.
    const learnedBytes = await journey.blobStore.read(r2Hash); // the durable learned template
    const r1PrimeHash = await journey.blobStore.put(learnedBytes);
    assert.equal(
      r1PrimeHash,
      r2Hash,
      "the learned template carried over byte-identically (same sha-256 content address)",
    );
    await journey.artifacts.recordArtifact({
      artifactId: "art:journey-replay",
      kind: "tactical-board-video",
      editability: "editable",
      policy,
    });
    await journey.artifacts.commitRevision({
      artifactId: "art:journey-replay",
      revisionId: "rev:journey-2-1",
      contentHash: r1PrimeHash,
      organizationVersion: { organizationId: ORG_ID, version: 2 },
      toolVersions: ["sporta-render@0"],
      provenance: {
        sourceKind: "agent-run",
        sourceRef: execution2.runId,
        capturedAt: execution2.events[0]!.at,
      },
      policy,
    });
    await appendRun2({ kind: "artifact", nodeId: "art:journey-replay", parent: execution2.runId });

    // 5'. the user's standard is ALREADY met — no manual edit (zeroth check).
    const parsed2 = journey.kdenlive.parseKdenliveXml(new TextDecoder().decode(learnedBytes));
    assert.equal(
      timelineCarriesUserClip(parsed2 as KdenliveProjectState),
      true,
      "the learned template carries the user's clip — no edit intervention",
    );

    // 6'. no capability gap (v2 declares it) — assert on the REAL wire: the
    //     Arena saw NO new requests during run 2.
    assert.equal(
      arenaRole.requests.length,
      arenaRequestsBeforeRun2,
      "zero arena requests in run 2 — the escalation intervention did not recur",
    );

    // 7'. no new learning candidate — nothing new happened to consent to.
    assert.equal(
      (await journey.learningIntake.listLearningArtifacts({ limit: 50 })).length,
      learningCountBeforeRun2,
      "run 2 created no new learning candidate — no consent needed",
    );

    // 8'. close run 2's loop (executing → closed, legal without user action).
    await appendRun2({ kind: "outcome", nodeId: "outcome:replay-complete", parent: "task:render" });
    const closed2 = await journey.workService.readWorkGraph(WG_2);
    assert.equal(closed2?.status, "closed");

    // Run 2's trace: the honest projection of an intervention-free run.
    assertRun2Trace(await journey.projection.trace(WG_2));

    // ── THE REDUCED-INTERVENTION ASSERTION (measured, honest) ────────────
    assert.equal(run1.manualInterventions, 2, "run 1: one manual edit + one arena escalation");
    assert.equal(run2.manualInterventions, 0, "run 2 (the replay): zero manual interventions");
    assert.ok(run2.manualInterventions < run1.manualInterventions, "measurably reduced");
    assert.equal(run1.authorizations.length, 1);
    assert.equal(run2.authorizations.length, 0, "no new consent in run 2");

    // ── the printed acceptance artifact ──────────────────────────────────
    printJourneyEvidence(
      run1,
      run2,
      journeyEvidenceLegs({
        v1Rationale: selection1.selected.rationale,
        run1Events: execution1.events.length,
        run1WallMs: execution1.wallMs,
        run2Events: execution2.events.length,
        run2WallMs: execution2.wallMs,
        editWallMs: run1.interventions[0]?.wallMs ?? 0,
        blobFiles,
        learningId: learningId,
        run1Interventions: run1.manualInterventions,
        run1InterventionKinds: run1.interventions.map((entry) => entry.kind),
        run2Interventions: run2.manualInterventions,
      }),
    );

    journey.runtime.dispose();
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
