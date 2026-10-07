import type { EscalateInput, RecordCapabilityGapInput } from "./contract.js";

export const exampleGap: RecordCapabilityGapInput = {
  gapId: "gap:example",
  workGraphId: "wg:example",
  capabilityNeed: "broadcast-frame-tracking",
  attemptedStrategies: ["builtin-tracker@0"],
  contextRefs: [],
  evidence: [],
};

export const exampleEscalate: EscalateInput = {
  idempotencyKey: "esc:example-key",
  gapId: "gap:example",
  urgency: "routine",
  sessionMode: "unblock",
  permittedActions: ["observe", "correct"],
  contextRefs: ["wg:example"],
};
