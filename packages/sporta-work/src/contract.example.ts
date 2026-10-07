import type { AppendWorkNodeInput, OpenIntentInput } from "./contract.js";
import type { IntentSpec } from "@sporta/contracts/contract";

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
