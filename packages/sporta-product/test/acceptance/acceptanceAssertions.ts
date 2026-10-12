/**
 * W7C-1 — the journey's assertion helpers (split from
 * acceptanceSupport.ts for the file-size law): the "return to the same
 * WorkGraph/artifact" durable read-backs, the learning-consent law
 * exercise, and the printed evidence table's per-leg rows. Every helper
 * asserts on REAL state and throws loudly on any dishonesty — never a
 * silent pass.
 */
import { FsAgentRunJournal } from "@sporta/work/contract";
import { FsArtifactBlobStore } from "@sporta/artifacts/contract";
import { FsEditorSessionHistoryStore } from "@sporta/editors/contract";
import { LearningConsentRefusedError } from "../../src/domain/errors.js";
import type { JourneyComposition, JourneyLedger, JourneyLeg } from "./acceptanceSupport.js";
import { journeyOrgDraft } from "./acceptanceSupport.js";
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import { USER, countFiles } from "./acceptanceSupport.js";

/**
 * The "return to the same WorkGraph/artifact" leg (SPEC §W7C-1): the
 * durable read-backs with FRESH adapter instances over the same roots —
 * blobs byte-identical, editor session listed from disk, run journal
 * replayed to its terminal event. Returns the measured blob-file count.
 */
export async function readBackDurableStores(
  journey: JourneyComposition,
  editorHistoryRoot: string,
  r1Hash: string,
  r2Hash: string,
  runId: string,
  renderBytes: Uint8Array,
): Promise<number> {
  const r1Back = await new FsArtifactBlobStore(journey.blobRoot).read(r1Hash); // FRESH instance
  if (!uint8Equals(r1Back, renderBytes)) {
    throw new Error("return leg: r1 blob did not read back byte-identical from the durable store");
  }
  const r2Back = await new FsArtifactBlobStore(journey.blobRoot).read(r2Hash); // FRESH instance
  if (r2Back.length === 0) {
    throw new Error("return leg: r2 blob did not read back from the durable store");
  }
  const historyFresh = new FsEditorSessionHistoryStore(editorHistoryRoot);
  const listed = await historyFresh.list({ editorSessionId: "es:journey-1" });
  if (listed.length !== 1) {
    throw new Error(`return leg: expected the editor session durable on disk (got ${String(listed.length)})`);
  }
  const journalFresh = new FsAgentRunJournal(journey.journalRoot);
  const replayed = await journalFresh.readJournal(runId);
  if (replayed === null || replayed.events.at(-1)?.type !== "completed") {
    throw new Error("return leg: the run journal did not replay to its terminal event");
  }
  return countFiles(journey.blobRoot);
}

function uint8Equals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** The measurements the printed evidence table cites. */
export interface JourneyMeasurements {
  readonly v1Rationale: string;
  readonly run1Events: number;
  readonly run1WallMs: number;
  readonly run2Events: number;
  readonly run2WallMs: number;
  readonly editWallMs: number;
  readonly blobFiles: number;
  readonly learningId: string;
  readonly run1Interventions: number;
  readonly run1InterventionKinds: readonly string[];
  readonly run2Interventions: number;
}

/** The per-leg evidence rows (the acceptance artifact's content). */
export function journeyEvidenceLegs(m: JourneyMeasurements): readonly JourneyLeg[] {
  return [
    { leg: "express intent", grade: "REAL", claim: "WorkGraphService.openIntent admits the goal", evidence: "status open (work-graph store: v1 in-memory ledger, labeled)" },
    { leg: "explainable organization", grade: "REAL", claim: "registry draft→promote + resolver selection with rationale", evidence: `v1 rationale "${m.v1Rationale}"; v2 selected on the replay` },
    { leg: "watch execution", grade: "REAL", claim: "real spawned process on real pipes, exit code 0, events durably journaled", evidence: `run1 ${String(m.run1Events)} events wall ${String(m.run1WallMs)}ms; run2 ${String(m.run2Events)} events wall ${String(m.run2WallMs)}ms (executable: the labeled process-level stand-in)` },
    { leg: "edit manually", grade: "REAL", claim: "KdenliveAdapter round-trip + broker reconcile (r2, editor-session provenance)", evidence: `intervention 1 wall ${String(m.editWallMs)}ms` },
    { leg: "return to the same WorkGraph/artifact", grade: "REAL", claim: "same graph + artifact ids, r1→r2 lineage, durable read-backs with FRESH instances", evidence: `${String(m.blobFiles)} blob file(s); editor session listed from disk; run journal replayed to the terminal event (artifact-graph ledger: v1 in-memory, labeled)` },
    { leg: "authorize learning", grade: "REAL", claim: "learning-consent intake law: grant creates the candidate; denial is a typed refusal creating nothing", evidence: m.learningId },
    { leg: "trigger Arena on a capability gap", grade: "REAL", claim: "real HTTP escalation over a real localhost server", evidence: "1 POST + 2 GETs on the wire (the Arena ROLE behind the transport: fixture-scripted, labeled)" },
    { leg: "receive a validated result", grade: "REAL", claim: "Sporta verdict (all checks pass) AND the Arena-side accepted_result gate", evidence: "verdict accepted; validated flag flipped at accepted_result" },
    { leg: "reduced manual intervention on a future run", grade: "REAL", claim: "the replay: same journey, learning in place, interventions counted", evidence: `run 1 = ${String(m.run1Interventions)} (${m.run1InterventionKinds.join(", ")}) → run 2 = ${String(m.run2Interventions)}; learned template carried over byte-identically (sha-256 equal); zero arena wire growth` },
  ];
}

/**
 * The "authorize learning" leg (SPEC §W7C-1): the REAL intake law driven
 * honestly — a grant creates the candidate; a later denial is a TYPED
 * refusal that creates nothing. Returns the granted learning artifact id.
 */
export async function exerciseConsentLaw(
  journey: JourneyComposition,
  workGraphId: string,
  ledger: JourneyLedger,
): Promise<string> {
  const granted = await journey.learningIntake.recordConsent({
    workGraphId,
    userId: USER,
    scopes: ["workflow", "capability"],
    decision: "granted",
  });
  if (granted.status !== "candidate" || granted.scope !== "user") {
    throw new Error(`consent law: expected a user-scope candidate (got ${granted.scope}/${granted.status})`);
  }
  ledger.authorization("consent granted (workflow, capability)", granted.learningArtifactId);
  const before = await journey.learningIntake.listLearningArtifacts({ limit: 50 });
  let refused = false;
  try {
    await journey.learningIntake.recordConsent({
      workGraphId,
      userId: USER,
      scopes: ["workflow", "capability"],
      decision: "denied",
    });
  } catch (error) {
    refused = error instanceof LearningConsentRefusedError;
  }
  if (!refused) {
    throw new Error("consent law: a denial must be a typed LearningConsentRefusedError");
  }
  const after = await journey.learningIntake.listLearningArtifacts({ limit: 50 });
  if (after.length !== before.length) {
    throw new Error("consent law: the denial created an artifact (it must create nothing)");
  }
  return granted.learningArtifactId;
}

/** Assert run 1's mid-journey trace: the loop honestly in flight. */
export function assertMidJourneyTrace(midTrace: { stages: readonly { stage: string; state: string }[] }): void {
  const states = new Map(midTrace.stages.map((stage) => [stage.stage, stage.state]));
  if (states.get("intent") !== "done") throw new Error("mid trace: intent must be done");
  if (states.get("organization") !== "done") throw new Error("mid trace: organization must be done");
  if (states.get("execution") !== "active") throw new Error("mid trace: execution must be active (no outcome yet)");
  if (states.get("artifact") !== "done") throw new Error("mid trace: artifact must be done (1 revision committed)");
}

/** Assert run 1's FINAL trace: every one of the 12 stages done. */
export function assertRun1FinalTrace(trace: { stages: readonly { stage: string; state: string; ref?: string; detail?: string }[] }): void {
  for (const stage of trace.stages) {
    if (stage.state !== "done") {
      throw new Error(`run 1 final trace: stage ${stage.stage} must be done (got ${stage.state})`);
    }
  }
  const byStage = new Map(trace.stages.map((stage) => [stage.stage, stage]));
  if (!/^org:journey@v2$/.test(byStage.get("organization")?.ref ?? "")) {
    throw new Error(`run 1 final trace: organization ref must be org:journey@v2 (got ${String(byStage.get("organization")?.ref)})`);
  }
  if (byStage.get("artifact")?.detail !== "2 revision(s)") {
    throw new Error("run 1 final trace: artifact detail must be 2 revision(s)");
  }
}

/** Assert run 2's trace: the honest projection of an intervention-free run. */
export function assertRun2Trace(trace: { stages: readonly { stage: string; state: string; ref?: string; detail?: string }[] }): void {
  const byStage = new Map(trace.stages.map((stage) => [stage.stage, stage]));
  const expect: readonly (readonly [string, string])[] = [
    ["intent", "done"],
    ["execution", "done"],
    ["progress", "active"],
    ["artifact", "done"],
    ["takeover", "pending"],
    ["editor", "pending"],
    ["learning", "done"],
    ["capability-gap", "pending"],
    ["arena", "pending"],
    ["result", "pending"],
    ["organization-improvement", "done"],
  ];
  for (const [stage, state] of expect) {
    if (byStage.get(stage)?.state !== state) {
      throw new Error(`run 2 trace: ${stage} must be ${state} (got ${String(byStage.get(stage)?.state)})`);
    }
  }
  if (!/^org:journey@v2$/.test(byStage.get("organization")?.ref ?? "")) {
    throw new Error("run 2 trace: the learned organization v2 must be selected");
  }
  if (!/0 action\(s\)/.test(byStage.get("progress")?.detail ?? "")) {
    throw new Error("run 2 trace: progress must show zero user actions");
  }
  if (!(byStage.get("learning")?.ref ?? "").startsWith("learn:user:operator:wg:journey-1")) {
    throw new Error("run 2 trace: the promoted learning from run 1 must carry over");
  }
}

/**
 * The "receive a validated result" leg (SPEC §W7C-1): BOTH gates honestly —
 * the Sporta verdict (validateResult, all checks) AND the Arena-side
 * lifecycle gate (validated flips at accepted_result). Throws loudly if
 * either gate lies.
 */
export async function receiveValidatedResult(
  arena: JourneyComposition["arena"],
  arenaRole: { advanceTo(id: string, target: string): void },
  escalationId: string,
): Promise<void> {
  arenaRole.advanceTo(escalationId, "submitted");
  const result = await arena.readResult(escalationId); // REAL GET
  if (result === null) throw new Error("result leg: no result over the real GET");
  if (result.validated) throw new Error("result leg: the Arena must never claim Sporta-side validation");
  const verdict = await arena.validateResult(result);
  if (!verdict.accepted || !verdict.checks.every((check) => check.passed)) {
    throw new Error("result leg: the Sporta-side validation checks did not all pass");
  }
  arenaRole.advanceTo(escalationId, "accepted_result");
  const finalResult = await arena.readResult(escalationId); // REAL GET
  if (finalResult?.validated !== true) {
    throw new Error("result leg: the Arena-side validated flag did not flip at accepted_result");
  }
}

/**
 * The improvement leg (SPEC §W7C-1): register + evaluate + promote the
 * learned organization v2 — the REAL evaluation service consumes the
 * counted intervention cost as a first-class signal; the REAL registry
 * promotes. Throws loudly if the intervention-cost metric is missing or
 * the promotion is not "promoted".
 */
export async function promoteLearnedOrganization(
  journey: JourneyComposition,
  input: {
    readonly orgV1: OrganizationVersionRecord;
    readonly learningId: string;
    readonly promotionV1Id: string;
    readonly escalationId: string;
    readonly manualInterventions: number;
    readonly userSeconds: number;
  },
): Promise<{ promotionId: string }> {
  const orgV2 = journeyOrgDraft(2, {
    preferences: [input.learningId],
    evidence: ["evidence:journey-seed", input.promotionV1Id, input.escalationId, input.learningId],
  });
  await journey.registry.registerDraft({ record: orgV2 });
  const report = await journey.evaluation.evaluateCandidates({
    candidates: [
      { organization: input.orgV1, rationale: "v1 baseline", evidence: [] },
      {
        organization: orgV2,
        rationale: "v2 candidate improved by Arena-validated learning",
        evidence: [input.learningId],
      },
    ],
    evidence: [input.learningId],
    interventionCost: { manualInterventions: input.manualInterventions, userSeconds: input.userSeconds },
  });
  if (!report.metrics.some((metric) => metric.axis === "intervention-cost")) {
    throw new Error("improvement leg: the evaluation report lacks the intervention-cost metric");
  }
  const promotion = await journey.registry.promote({ organizationId: orgV2.organizationId, version: 2 });
  if (promotion.decision !== "promoted") {
    throw new Error(`improvement leg: v2 promotion decided ${promotion.decision}`);
  }
  return { promotionId: promotion.promotionId };
}
