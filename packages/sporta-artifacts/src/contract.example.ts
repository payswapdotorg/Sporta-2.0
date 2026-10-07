import type { CommitRevisionInput, RecordArtifactInput } from "./contract.js";

const policy = {
  rights: { holders: ["holder:example"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
} as const;

export const exampleRecordArtifact: RecordArtifactInput = {
  artifactId: "art:example",
  kind: "tactical-board-video",
  editability: "editable",
  policy,
};

export const exampleCommitRevision: CommitRevisionInput = {
  artifactId: "art:example",
  revisionId: "rev:example-1",
  contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
  toolVersions: ["sporta-render@0"],
  provenance: {
    sourceKind: "agent-run",
    sourceRef: "run:example",
    capturedAt: "2026-10-07T00:00:00.000Z",
  },
  policy,
};
