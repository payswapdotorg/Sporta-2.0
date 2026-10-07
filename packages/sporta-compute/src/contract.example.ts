import type { ComputeJobSpec, SubmitComputeInput } from "./contract.js";

export const exampleSpec: ComputeJobSpec = {
  kind: "ffmpeg-encode",
  inputs: ["art:example"],
  requirements: ["ffmpeg@6"],
  timeoutMs: 30_000,
};

export const exampleSubmit: SubmitComputeInput = {
  jobId: "job:example",
  spec: exampleSpec,
  policy: {
    rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};
