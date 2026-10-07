import type {
  ArtifactBlobStorePort,
  CommitRevisionInput,
  RecordArtifactInput,
} from "./contract.js";
import type { ArtifactClock } from "./contract.js";

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

/** A blob store seam consumers wire at runtime (injected port). */
export const exampleBlobStoreUsage: {
  put: ArtifactBlobStorePort["put"];
  read: ArtifactBlobStorePort["read"];
} = {
  put: async (content) => `fixture:${content.byteLength}`,
  read: async () => new Uint8Array(0),
};

/** Clocks are injectable; example of a fixed fixture clock. */
export const exampleClock: ArtifactClock = {
  now: () => "2026-10-07T00:00:00.000Z",
};
