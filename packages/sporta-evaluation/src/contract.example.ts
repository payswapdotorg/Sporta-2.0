import type { EvaluateCandidatesInput } from "./contract.js";

export const exampleEvaluate: EvaluateCandidatesInput = {
  candidates: [
    {
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
        policy: {
          rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
          privacy: { visibility: "tenant", exportableFields: [] },
          retention: { disposition: "retain" },
        },
      },
      rationale: "example candidate",
      evidence: [],
    },
  ],
  evidence: [],
  interventionCost: { manualInterventions: 2, userSeconds: 140 },
};

/** Explicit honest basis: fixture input must never claim "measured". */
export const exampleMeasuredIntervention = {
  manualInterventions: 1,
  userSeconds: 42,
  basis: "fixture",
} as const;
