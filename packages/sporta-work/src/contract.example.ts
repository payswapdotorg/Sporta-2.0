import type {
  AppendWorkNodeInput,
  OpenIntentInput,
  StartAgentRunInput,
  WorkGraphStatus,
} from "./contract.js";
import type { IntentSpec, OrganizationVersionRecord } from "@sporta/contracts/contract";

const intent: IntentSpec = {
  goal: "produce a tactical replay",
  constraints: [],
  artifactRequirements: ["tactical-board-video"],
  learningPolicy: { scopes: [], requireConsent: true },
  policy: {
    rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

export const exampleOpenIntent: OpenIntentInput = { workGraphId: "wg:example", intent };

export const exampleAppendRun: AppendWorkNodeInput = {
  workGraphId: "wg:example",
  kind: "run",
  actor: { actorKind: "agent-run", actorRef: "run:example" },
};

/** Manual takeover: a user append is a first-class ledger entry. */
export const exampleUserAppend: AppendWorkNodeInput = {
  workGraphId: "wg:example",
  kind: "action",
  actor: { actorKind: "user", actorRef: "user:example" },
};

/** Explicit lifecycle transition (Arena escalation edge). */
export const exampleEscalation: { workGraphId: string; next: WorkGraphStatus } = {
  workGraphId: "wg:example",
  next: "escalated",
};

/** Execution seam usage (the ZCode AgentRuntime adapter implements it later). */
export const exampleStartRun: StartAgentRunInput = {
  workGraphId: "wg:example",
  organization: {
    organizationId: "org:example",
    version: 1,
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
    policy: intent.policy,
  } satisfies OrganizationVersionRecord,
  task: "render the tactical replay",
};
