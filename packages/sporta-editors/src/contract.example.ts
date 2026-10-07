import type {
  EditOperation,
  OpenEditorSessionInput,
  ReconcileSessionInput,
  ResolveEditorInput,
} from "./contract.js";

const policy = {
  rights: { holders: ["holder:example"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
} as const;

export const exampleResolve: ResolveEditorInput = {
  revisionId: "rev:example-1",
  operation: "round-trip",
  availability: [
    {
      editorId: "kdenlive",
      version: "24.08.0",
      integrationLevel: 2,
      projectFormat: "kdenlive",
      licensing: "GPL-3.0",
    },
  ],
};

export const exampleOpen: OpenEditorSessionInput = {
  revisionId: "rev:example-1",
  editorId: "kdenlive",
  mode: "local",
  policy,
};

export const exampleReconcile: ReconcileSessionInput = {
  editorSessionId: "es:example",
  changedProjectHash: "ff" + "00".repeat(31),
  externalTool: { name: "kdenlive", version: "24.08.0" },
  projectFormat: "kdenlive",
  projectState: { clips: [{ start: 0, end: 90 }], tracks: 2 },
};

export const exampleEditOperation: EditOperation = {
  kind: "set",
  path: "/clips/0",
  valueHash: "ab" + "00".repeat(31),
};
