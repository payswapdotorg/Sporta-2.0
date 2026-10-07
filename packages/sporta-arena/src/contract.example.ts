import type { EscalateInput, RecordCapabilityGapInput } from "./contract.js";
import type { PolicySet } from "@sporta/contracts/contract";

const policy: PolicySet = {
  rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "escalation", exportableFields: [] },
  retention: { disposition: "retain" },
};

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
  tenantRef: "tenant:example",
  urgency: "routine",
  sessionMode: "unblock",
  permittedActions: ["observe", "correct"],
  learningPermissions: { scopes: ["capability"], requireConsent: true },
  policy,
  contextRefs: ["wg:example"],
};
