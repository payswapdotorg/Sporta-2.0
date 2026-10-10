import type {
  ArtifactBlobStorePort,
  ArtifactGatedReadPort,
  ArtifactGatedReadDeps,
  ArtifactReadUsageContext,
  CommitRevisionInput,
  ReadLineageInput,
  ReadRevisionContentInput,
  ReadRevisionInput,
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

/** The caller's usage context for a rights-gated read (wave 4, invariant 22). */
export const exampleUsageContext: ArtifactReadUsageContext = {
  usages: ["render"],
};

/** A gated revision read: direct reads refuse prohibited/bare usage contexts. */
export const exampleReadRevision: ReadRevisionInput = {
  revisionId: "rev:example-1",
  usage: exampleUsageContext,
};

/** A gated lineage read: listings exclude prohibited revisions (honest absence). */
export const exampleReadLineage: ReadLineageInput = {
  artifactId: "art:example",
  usage: exampleUsageContext,
  limit: 25,
};

/** A gated revision-content read: the revision's PolicySet gates the blob read. */
export const exampleReadRevisionContent: ReadRevisionContentInput = {
  revisionId: "rev:example-1",
  usage: exampleUsageContext,
};

/** A minimal graph satisfying the frozen port (manifest read optional). */
const exampleGraph = {
  recordArtifact: (async (input: RecordArtifactInput) => ({
    artifactId: input.artifactId ?? "art:example",
    kind: input.kind,
    editability: input.editability,
    policy: input.policy,
  })) as ArtifactGatedReadDeps["graph"]["recordArtifact"],
  commitRevision: (async () => {
    throw new Error("example only");
  }) as ArtifactGatedReadDeps["graph"]["commitRevision"],
  readRevision: (async () => null) as ArtifactGatedReadDeps["graph"]["readRevision"],
  lineage: (async () => []) as ArtifactGatedReadDeps["graph"]["lineage"],
};

/** The gated read seam wiring (blobs optional; clock injected). */
export const exampleGatedReadDeps: ArtifactGatedReadDeps = {
  graph: exampleGraph,
  clock: exampleClock,
};

/** The gated read seam satisfies its own port shape (type-checked wiring). */
export const exampleGatedReadUsage: Pick<
  ArtifactGatedReadPort,
  "readRevision" | "lineage" | "readRevisionContent"
> = {
  readRevision: async (input) => {
    if (input.usage === undefined) {
      throw new Error("fail-closed: bare usage context refuses a direct read");
    }
    return null;
  },
  lineage: async () => [],
  readRevisionContent: async () => null,
};
