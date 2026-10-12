/**
 * Support for the Completion-journey acceptance test
 * (packages/sporta-product/test/acceptance/completionJourney.test.ts).
 *
 * EVIDENCE CLASS, per component (the test's per-leg table restates it):
 *
 * REAL (the composition wires the real services/adapters):
 * - WorkGraphService, OrganizationRegistryService,
 *   OrganizationResolverService, UserPreferenceService, EvaluationService,
 *   ArtifactGraphService, LearningIntakeService, ArenaClientService — the
 *   frozen domain services.
 * - FsArtifactBlobStore on a real temp dir (real files, real sha-256
 *   content addresses, verified read-backs).
 * - FsEditorSessionHistoryStore + the REAL EditorSessionHistoryService read
 *   seam (usage-declared at wiring time, the W4-C host pattern) over the
 *   broker's real sessionHistory appends.
 * - OrganizationCandidateReadService (the REAL lab read seam).
 * - KdenliveAdapter (real MLT parse/mutate/serialize/re-parse) through the
 *   REAL EditorBrokerService reconcile path.
 * - HttpArenaTransport over the StubArenaRole's REAL localhost HTTP server.
 * - ResumingAgentRuntime over ZCodeAgentRuntimeAdapter + FsAgentRunJournal
 *   (w7a): a real spawned child process on real pipes (real wall time, real
 *   exit code) whose observed events are durably journaled on the real FS.
 *
 * FIXTURE (labeled): the executable behind the process leg is the
 * process-level stand-in (the vendored zcode-cli is unbuildable in this
 * sandbox — BLOCKERS carried since wave 2); the Arena ROLE behind the real
 * HTTP transport is fixture-scripted (the W2 pattern); the
 * work-graph/organization/preference/artifact-graph/session stores are v1
 * in-memory ledgers (durability is claimed only for the real FS stores).
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentRunEvent,
  EditorSessionHistoryQuery,
  EditorSessionHistoryReadPort,
  IntentSpec,
  KdenliveProjectState,
  OrganizationVersionRecord,
  PolicySet,
} from "@sporta/contracts/contract";
import {
  FsAgentRunJournal,
  InMemoryWorkGraphStore,
  ResumingAgentRuntime,
  WorkGraphService,
  ZCodeAgentRuntimeAdapter,
  systemClockNow,
} from "@sporta/work/contract";
import {
  InMemoryOrganizationStore,
  InMemoryUserPreferenceStore,
  OrganizationRegistryService,
  OrganizationResolverService,
  UserPreferenceService,
} from "@sporta/organizations/contract";
import { OrganizationCandidateReadService } from "@sporta/lab/contract";
import { EvaluationService } from "@sporta/evaluation/contract";
import {
  ArtifactGraphService,
  FsArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import {
  EditorBrokerService,
  EditorSessionHistoryService,
  FsEditorSessionHistoryStore,
  InMemoryEditorSessionStore,
  KdenliveAdapter,
  sha256EditorHash,
  SystemClock as EditorSystemClock,
} from "@sporta/editors/contract";
import { ArenaClientService, HttpArenaTransport } from "@sporta/arena/contract";
import { LearningIntakeService } from "../../src/app/learningIntake.js";
import { ProductLoopProjection } from "../../src/app/productLoopProjection.js";
import { StubArenaRole } from "../a17FullRealSupport.js";
import { INITIAL_MLT_XML, countFiles, userEditedState } from "../a17FullRealFixtures.js";

export const STANDIN_PATH = fileURLToPath(
  new URL("../fixtures/zcode-cli-standin.mjs", import.meta.url),
);

export const USER = "user:operator";
/** The capability the intent needs — absent from org v1, learned into v2 via the Arena. */
export const CAPABILITY_NEED = "broadcast-frame-tracking";
export const LEARNED_TOOL_ID = "tool:broadcast-frame-tracking";

export const policy: PolicySet = {
  rights: { holders: ["holder:operator"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** The journey's goal — IDENTICAL for both runs (the replay is the same journey). */
export function journeyIntent(): IntentSpec {
  return {
    goal: "produce a tactical replay of the authorized clip with the user's imported angle",
    constraints: ["authorized sources only"],
    artifactRequirements: ["tactical-board-video"],
    learningPolicy: {
      scopes: ["preference", "workflow", "capability", "organization-composition", "knowledge"],
      requireConsent: true,
    },
    policy,
  };
}

/** Organization drafts: v1 the baseline; v2 the learned composition (SPEC §W7C-1 replay law). */
export function journeyOrgDraft(
  version: number,
  learned?: { preferences: readonly string[]; evidence: readonly string[] },
): OrganizationVersionRecord {
  return {
    organizationId: "org:journey",
    version,
    intentProfile: "sports-replay",
    roleGraph: [],
    agentBodies: [],
    cognitiveSubstrates: [],
    // v2 declares the Arena-learned capability tool — the replay's
    // capability check reads THIS (the real selected record).
    toolGraph: learned === undefined ? [] : [LEARNED_TOOL_ID],
    workflowGraph: [],
    environmentProfile: "local",
    fallbacks: [],
    budgets: {},
    learnedPreferences: learned === undefined ? [] : [...learned.preferences],
    evidence: learned === undefined ? ["evidence:journey-seed"] : [...learned.evidence],
    policy,
  };
}

/**
 * The capability check (pure, honest): does the SELECTED organization
 * record declare the capability the intent needs? v1 (empty toolGraph)
 * does not — that is the real gap. v2 (toolGraph carries the Arena-learned
 * tool) does — no gap, no escalation on the replay.
 */
export function organizationDeclaresCapability(
  organization: OrganizationVersionRecord,
  need: string,
): boolean {
  return (
    organization.toolGraph.some((tool) => tool.includes(need)) ||
    organization.cognitiveSubstrates.includes(need)
  );
}

/** The user's quality standard (pure): the timeline must carry the user-imported replay clip. */
export function timelineCarriesUserClip(state: KdenliveProjectState): boolean {
  return state.mlt.producers.some(
    (producer) =>
      ((producer.properties["resource"] as string | undefined) ?? "").includes(
        "user-imported-replay",
      ),
  );
}

/** One counted corrective user action (the intervention ledger, SPEC §W7C-1). */
export interface InterventionRecord {
  readonly kind: "manual-edit" | "capability-escalation";
  readonly label: string;
  readonly wallMs: number;
}

/** One authorization (tracked separately from corrective interventions). */
export interface AuthorizationRecord {
  readonly kind: "learning-consent";
  readonly label: string;
  readonly detail: string;
}

/**
 * The honest intervention ledger: counts actions ACTUALLY performed with
 * their measured wall times — never hypothetical, never fabricated.
 */
export class JourneyLedger {
  readonly interventions: InterventionRecord[] = [];
  readonly authorizations: AuthorizationRecord[] = [];

  /** Record one corrective intervention, measuring the action's real wall time. */
  async intervention(
    kind: InterventionRecord["kind"],
    label: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const started = Date.now();
    await action();
    this.interventions.push({ kind, label, wallMs: Date.now() - started });
  }

  /** Record one authorization (consent) — separate from corrective actions. */
  authorization(label: string, detail: string): void {
    this.authorizations.push({ kind: "learning-consent", label, detail });
  }

  get manualInterventions(): number {
    return this.interventions.length;
  }

  get userSeconds(): number {
    return Math.round(this.interventions.reduce((total, entry) => total + entry.wallMs, 0)) / 1000;
  }
}

/** Everything the journey drives (one composition, shared by BOTH runs). */
export interface JourneyComposition {
  readonly workService: WorkGraphService;
  readonly registry: OrganizationRegistryService;
  readonly resolver: OrganizationResolverService;
  readonly evaluation: EvaluationService;
  readonly artifacts: ArtifactGraphService;
  readonly blobStore: FsArtifactBlobStore;
  readonly editors: EditorBrokerService;
  readonly arena: ArenaClientService;
  readonly learningIntake: LearningIntakeService;
  readonly projection: ProductLoopProjection;
  readonly runtime: ResumingAgentRuntime;
  readonly kdenlive: KdenliveAdapter;
  readonly blobRoot: string;
  readonly journalRoot: string;
}

/**
 * The usage-declared editor-history bridge (the W4-C host wiring pattern):
 * the REAL W3-B service is fail-closed without a usage context, and the
 * wiring site declares the operator's usages (sessions carry the operator
 * policy, so the gate passes). The SERVICE and GATE are real.
 */
class UsageDeclaredEditorHistory implements EditorSessionHistoryReadPort {
  readonly #service: EditorSessionHistoryService;
  readonly #usages: readonly string[];
  constructor(service: EditorSessionHistoryService, usages: readonly string[]) {
    this.#service = service;
    this.#usages = usages;
  }
  async listEditorSessions(query: EditorSessionHistoryQuery) {
    return this.#service.listEditorSessions({ ...query, usage: { usages: this.#usages } });
  }
}

/** Build the ONE journey composition (real legs per the evidence classes above). */
export function buildJourneyComposition(
  tempRoot: string,
  arenaRole: StubArenaRole,
): JourneyComposition {
  const workService = new WorkGraphService({
    store: new InMemoryWorkGraphStore(),
    now: systemClockNow,
  });
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now: systemClockNow,
  });
  const preferences = new UserPreferenceService({
    store: new InMemoryUserPreferenceStore(),
    now: systemClockNow,
  });
  const resolver = new OrganizationResolverService({ catalog: registry, preferences });
  const evaluation = new EvaluationService();
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const blobRoot = join(tempRoot, "blobs");
  const blobStore = new FsArtifactBlobStore(blobRoot); // REAL FS
  const journalRoot = join(tempRoot, "run-journals");
  const editorHistoryRoot = join(tempRoot, "editor-history");
  const editorHistory = new UsageDeclaredEditorHistory(
    new EditorSessionHistoryService({ history: new FsEditorSessionHistoryStore(editorHistoryRoot) }),
    policy.rights.usages,
  );
  const editors = new EditorBrokerService({
    clock: new EditorSystemClock(),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveAdapter(sha256EditorHash)],
    sessionHistory: new FsEditorSessionHistoryStore(editorHistoryRoot), // REAL FS appends
  });
  const arena = new ArenaClientService({
    transport: new HttpArenaTransport({ baseUrl: arenaRole.baseUrl }), // REAL HTTP
  });
  const learningIntake = new LearningIntakeService({ workGraphs: workService });
  const candidateReads = new OrganizationCandidateReadService({ catalog: registry });
  const runtime = new ResumingAgentRuntime({
    inner: new ZCodeAgentRuntimeAdapter({ now: systemClockNow, zcodeCliPath: STANDIN_PATH }),
    journal: new FsAgentRunJournal(journalRoot), // REAL durable journal
  });
  const projection = new ProductLoopProjection({
    workGraphs: workService,
    organizations: resolver,
    artifacts,
    editors,
    arena,
    userRef: USER,
    environmentProfile: "local",
    constraints: [],
    editorSessionHistory: editorHistory, // the REAL read seam
    learningArtifacts: learningIntake, // the REAL read seam
    organizationCandidates: candidateReads, // the REAL read seam
    escalations: arena, // the REAL read seam
  });
  return {
    workService,
    registry,
    resolver,
    evaluation,
    artifacts,
    blobStore,
    editors,
    arena,
    learningIntake,
    projection,
    runtime,
    kdenlive: new KdenliveAdapter(sha256EditorHash),
    blobRoot,
    journalRoot,
  };
}

/** One per-leg evidence row (the acceptance artifact's table). */
export interface JourneyLeg {
  readonly leg: string;
  readonly grade: "REAL" | "FIXTURE";
  readonly claim: string;
  readonly evidence: string;
}

/** Print the per-leg evidence table + the intervention comparison (the acceptance artifact). */
export function printJourneyEvidence(
  run1: JourneyLedger,
  run2: JourneyLedger,
  legs: readonly JourneyLeg[],
): void {
  console.log("=== COMPLETION JOURNEY — PER-LEG EVIDENCE (the acceptance artifact) ===");
  for (const leg of legs) {
    console.log(`- [${leg.grade}] ${leg.leg}: ${leg.claim} — ${leg.evidence}`);
  }
  console.log("=== INTERVENTION LEDGER (honestly counted) ===");
  for (const entry of run1.interventions) {
    console.log(`- run 1 intervention (${entry.kind}): ${entry.label} [wall ${String(entry.wallMs)}ms]`);
  }
  for (const entry of run1.authorizations) {
    console.log(`- run 1 authorization (${entry.kind}): ${entry.label} -> ${entry.detail}`);
  }
  if (run2.interventions.length === 0 && run2.authorizations.length === 0) {
    console.log("- run 2 (the replay): ZERO interventions, ZERO authorizations");
  }
  for (const entry of run2.interventions) {
    console.log(`- run 2 intervention (${entry.kind}): ${entry.label} [wall ${String(entry.wallMs)}ms]`);
  }
  console.log(
    `=== REDUCED MANUAL INTERVENTION: run 1 = ${String(run1.manualInterventions)} manual intervention(s), ${String(run1.userSeconds)}s user time | run 2 = ${String(run2.manualInterventions)} manual intervention(s), ${String(run2.userSeconds)}s user time ===`,
  );
}

export { INITIAL_MLT_XML, countFiles, userEditedState };

/** Watch execution (REAL runtime lane): run to terminal, return the events + wall time. */
export async function watchExecution(
  journey: JourneyComposition,
  workGraphId: string,
  task: string,
): Promise<{ runId: string; events: readonly AgentRunEvent[]; wallMs: number }> {
  const graph = await journey.workService.readWorkGraph(workGraphId);
  if (graph === null) throw new Error("watchExecution: the intent must be opened before execution");
  const selection = await journey.resolver.resolve({
    intent: graph.intent,
    workGraph: graph,
    userRef: USER,
    environmentProfile: "local",
    constraints: [],
  });
  const started = Date.now();
  const handle = await journey.runtime.startRun({
    workGraphId,
    organization: selection.selected.organization,
    task,
  });
  const isTerminal = (event: AgentRunEvent | undefined): boolean =>
    event !== undefined && (event.type === "completed" || event.type === "failed");
  let events: readonly AgentRunEvent[] = [];
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    events = await journey.runtime.observeRun(handle.runId);
    if (isTerminal(events[events.length - 1])) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return { runId: handle.runId, events, wallMs: Date.now() - started };
}
