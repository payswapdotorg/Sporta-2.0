import type { IntentSpec, PolicySet, ProvenanceDescriptor } from "./contract.js";

/** Example policy set (fixture-grade, not real evidence). */
export const examplePolicySet: PolicySet = {
  rights: { holders: ["holder:example"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** Minimal example intent. */
export const exampleIntent: IntentSpec = {
  goal: "produce a tactical replay of the authorized clip",
  constraints: ["use only authorized sources"],
  artifactRequirements: ["tactical-board-video"],
  learningPolicy: { scopes: ["workflow"], requireConsent: true },
  policy: examplePolicySet,
};

/** Example provenance descriptor. */
export const exampleProvenance: ProvenanceDescriptor = {
  sourceKind: "authorized-source",
  sourceRef: "source:example",
  capturedAt: "2026-10-07T00:00:00.000Z",
  confidence: 0.9,
};
