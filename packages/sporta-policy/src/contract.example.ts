import type { PolicySet } from "./contract.js";

/** Example policy set: single tenant, render-only rights, 30-run retention. */
export const examplePolicySet: PolicySet = {
  rights: { holders: ["holder:example"], usages: ["render"], prohibitions: ["distribute"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "purge", retainRuns: 30 },
};
