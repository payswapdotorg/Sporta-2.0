import type { OrganizationSelectionContext, RegisterOrganizationInput } from "./contract.js";
import type { IntentSpec, WorkGraphRecord } from "@sporta/contracts/contract";

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

const workGraph: WorkGraphRecord = {
  workGraphId: "wg:example",
  intent,
  nodes: [],
  createdAt: "2026-10-07T00:00:00.000Z",
  updatedAt: "2026-10-07T00:00:00.000Z",
  status: "open",
};

export const exampleContext: OrganizationSelectionContext = {
  intent,
  workGraph,
  environmentProfile: "local",
  constraints: [],
};

export const exampleRegister: RegisterOrganizationInput = {
  record: {
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
  },
};
