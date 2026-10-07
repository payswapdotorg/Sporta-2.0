import type { LearningConsentInput, ProductLoopStage } from "./contract.js";

export const exampleConsent: LearningConsentInput = {
  workGraphId: "wg:example",
  userId: "user:example",
  scopes: ["preference"],
  decision: "granted",
};

export const exampleStage: ProductLoopStage = {
  stage: "artifact",
  ref: "art:example",
  state: "done",
  detail: "2 revision(s)",
};
