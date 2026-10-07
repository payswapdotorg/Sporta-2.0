import type { ComputeJobStatus, ComputeProviderPort, SubmitComputeInput } from "./contract.js";

const policy = {
  rights: { holders: ["holder:example"], usages: ["render", "compute:echo"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
} as const;

export const exampleSpec = {
  kind: "echo",
  inputs: ["art:example"],
  requirements: [],
  timeoutMs: 30_000,
} as const;

export const exampleSubmit: SubmitComputeInput = {
  jobId: "job:example",
  spec: exampleSpec,
  policy,
};

/** A fixture provider for wiring examples (refusal-first visibility). */
export const exampleProvider: ComputeProviderPort = {
  providerId: "example-provider",
  quote: async () => ({ providerId: "example-provider", estimatedLatencyMs: 10 }),
  execute: async () => ({ state: "succeeded", outputArtifactId: "out:echo:art:example" }),
};

/** What a policy-denied submission looks like (typed refusal, terminal). */
export const examplePolicyDeniedStatus: ComputeJobStatus = {
  jobId: "job:example",
  state: "refused",
  providerId: "sporta-compute-broker",
  refusal: {
    kind: "policy-denied",
    providerId: "sporta-compute-broker",
    detail: 'policy rights.usages must include "compute:echo" for job kind "echo"',
  },
};
