import type {
  EditOperation,
  EditorSessionHistoryListInput,
  EditorSessionHistoryReadPort,
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

export const exampleListEditorSessions: EditorSessionHistoryListInput = {
  revisionId: "rev:example-1",
  openOnly: true,
  limit: 20,
  usage: { usages: ["render"] },
};

// The frozen contracts port shape is satisfied by the additive input:
// a bare query is valid (and lists nothing — fail-closed, no usages).
export const examplePortQuery: Parameters<EditorSessionHistoryReadPort["listEditorSessions"]>[0] = {
  openOnly: true,
};
