import type { LabReplayInput, LabSearchInput } from "./contract.js";

export const exampleSearch: LabSearchInput = {
  intent: {
    goal: "produce a tactical replay",
    constraints: [],
    artifactRequirements: ["tactical-board-video"],
    learningPolicy: { scopes: [], requireConsent: true },
    policy: {
      rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
  },
  environmentProfile: "local",
  constraints: [],
  populations: ["baseline-generalist", "historical-winner"],
};

export const exampleReplay: LabReplayInput = {
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
    policy: exampleSearch.intent.policy,
  },
};
