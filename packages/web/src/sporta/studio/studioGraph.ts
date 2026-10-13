/**
 * The studio graph builder (W9C-6) — the editable draft that produces a
 * `TransformPipelineManifest` for validation through the REAL @sporta
 * validation port. The component palette pins the REAL w9a trim
 * component (digest computed through the real hash port over its exact
 * source — never a moving tag) and the fixture model component
 * (fixture-labeled). The application-environment-action node kind is
 * supported in the palette with its honest deferred-lane note.
 */
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
import {
  JSON_EVENT_STREAM_TRIM_SOURCE,
  jsonEventStreamTrimComponent,
  Sha256TransformHash,
} from "@sporta/transforms/contract";

/** The studio's REAL hash port (REAL node:crypto sha256). */
const studioHash = new Sha256TransformHash();

/** The REAL pinned trim component (digest over its exact source bytes). */
export const STUDIO_TRIM_COMPONENT = jsonEventStreamTrimComponent(studioHash);

/** The fixture model component pin (fixture-labeled digest). */
export const STUDIO_MODEL_COMPONENT = {
  name: "fixture-event-summer",
  digest: studioHash.text("fixture-event-summer@fixture-v1"),
} as const;

export const EVENT_STREAM_DATAKIND = "sporta/json-event-stream";
export const SUMMARY_DATAKIND = "sporta/json-summary";

/** The studio's fixture-labeled demo policy (tenant-visible, retained). */
export const STUDIO_DEMO_POLICY: PolicySet = {
  rights: { holders: ["holder:studio-demo"], usages: ["render", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** The demo feed provenance (fixture content; the process lane is real). */
export const STUDIO_FEED_PROVENANCE: ProvenanceDescriptor = {
  sourceKind: "authorized-source",
  sourceRef: "source:studio-demo-feed",
  capturedAt: "2026-10-13T00:00:00.000Z",
  confidence: 0.95,
};

/** One editable draft node (internal builder state). */
export interface StudioDraftNode extends TransformNode {
  note: string;
}

/** The editable builder draft. */
export interface StudioDraft {
  pipelineId: string;
  version: string;
  nodes: StudioDraftNode[];
  edges: TransformEdge[];
  parameters: Record<string, Record<string, unknown>>;
}

/** A fresh draft with the default trim node (the first-slice starter). */
export function initialStudioDraft(): StudioDraft {
  return {
    pipelineId: "pipe:studio-demo",
    version: "1.0.0",
    nodes: [trimNode("node:trim")],
    edges: [],
    parameters: { "node:trim": { startMs: 1000, endMs: 4000 } },
  };
}

/** The trim node pinned to the REAL component digest. */
export function trimNode(nodeId: string): StudioDraftNode {
  return {
    nodeId,
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: STUDIO_TRIM_COMPONENT.digest,
      name: STUDIO_TRIM_COMPONENT.name,
    },
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    parameterSchema: {
      startMs: { type: "number", required: true, minimum: 0 },
      endMs: { type: "number", required: true, minimum: 0 },
    },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "out-of-window or malformed input fails closed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
    note: "REAL w9a deterministic filter (real child process)",
  };
}

/** The fixture model node (fixture-labeled lane). */
export function modelNode(nodeId: string): StudioDraftNode {
  return {
    nodeId,
    kind: "model",
    componentRef: {
      kind: "model",
      digest: STUDIO_MODEL_COMPONENT.digest,
      name: STUDIO_MODEL_COMPONENT.name,
    },
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "summary", dataKind: SUMMARY_DATAKIND, required: true, cardinality: "single" }],
    parameterSchema: {},
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 5_000, maxOutputBytes: 100_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "declared-fallback", contract: "refusals fall back to identity pass-through" },
    provenanceRules: ["model output labeled with its evidence grade"],
    note: "FIXTURE model lane (labeled; no real provider)",
  };
}

/** Add a palette component to the draft (unique node ids). */
export function addPaletteNode(
  draft: StudioDraft,
  component: "json-event-stream-trim" | "fixture-event-summer",
): StudioDraft {
  const nodeId =
    component === "json-event-stream-trim"
      ? uniqueNodeId(draft, "node:trim")
      : uniqueNodeId(draft, "node:model");
  const node = component === "json-event-stream-trim" ? trimNode(nodeId) : modelNode(nodeId);
  const defaults: Record<string, unknown> =
    component === "json-event-stream-trim" ? { startMs: 1000, endMs: 4000 } : {};
  return {
    ...draft,
    nodes: [...draft.nodes, node],
    parameters: { ...draft.parameters, [nodeId]: defaults },
  };
}

/** Remove a node (and its edges/parameters). */
export function removeNode(draft: StudioDraft, nodeId: string): StudioDraft {
  return {
    ...draft,
    nodes: draft.nodes.filter((node) => node.nodeId !== nodeId),
    edges: draft.edges.filter((edge) => edge.from.nodeId !== nodeId && edge.to.nodeId !== nodeId),
    parameters: Object.fromEntries(
      Object.entries(draft.parameters).filter(([key]) => key !== nodeId),
    ),
  };
}

/** Connect two nodes' "events" ports (the first-slice port vocabulary). */
export function connectNodes(draft: StudioDraft, from: string, to: string): StudioDraft {
  return {
    ...draft,
    edges: [
      ...draft.edges.filter((edge) => !(edge.from.nodeId === from && edge.to.nodeId === to)),
      { from: { nodeId: from, port: "events" }, to: { nodeId: to, port: "events" } },
    ],
  };
}

/** Set one node's run-time parameters. */
export function setParameters(
  draft: StudioDraft,
  nodeId: string,
  values: Readonly<Record<string, unknown>>,
): StudioDraft {
  return { ...draft, parameters: { ...draft.parameters, [nodeId]: { ...values } } };
}

/** Assemble the immutable manifest the validation port consumes. */
export function buildStudioManifest(draft: StudioDraft): TransformPipelineManifest {
  const nodes: readonly TransformNode[] = draft.nodes.map(({ note: _note, ...node }) => node);
  const outputKinds = new Set(nodes.flatMap((node) => node.outputs.map((port) => port.dataKind)));
  return {
    pipelineId: draft.pipelineId,
    version: draft.version,
    manifestDigest: studioHash.text(
      JSON.stringify({
        pipelineId: draft.pipelineId,
        version: draft.version,
        nodes: nodes.map((node) => [node.nodeId, node.componentRef.digest]),
        edges: draft.edges,
      }),
    ),
    publisher: "publisher:studio-demo",
    purpose: "studio demo pipeline (prerecorded feed trim + optional fixture model summary)",
    limitations: [
      "first slice: single input feed, chain semantics",
      "model lane is fixture-labeled when present",
    ],
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs:
      outputKinds.size === 0
        ? [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }]
        : [...outputKinds].map((dataKind) => ({
            name: dataKind === SUMMARY_DATAKIND ? "summary" : "events",
            dataKind,
            required: true,
            cardinality: dataKind === SUMMARY_DATAKIND ? ("single" as const) : ("stream" as const),
          })),
    nodes,
    edges: draft.edges,
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the trim window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream", "optional fixture summary"],
    pinnedDependencies: [
      {
        kind: "code",
        name: STUDIO_TRIM_COMPONENT.name,
        digest: STUDIO_TRIM_COMPONENT.digest,
        license: "MIT",
        storageRef: `repo:${JSON_EVENT_STREAM_TRIM_SOURCE.length}-bytes-pinned`,
      },
    ],
    licensing: { license: "MIT", provenance: "studio demo (fixture-labeled content)" },
    policy: STUDIO_DEMO_POLICY,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  };
}

function uniqueNodeId(draft: StudioDraft, base: string): string {
  let candidate = base;
  let counter = 2;
  while (draft.nodes.some((node) => node.nodeId === candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}
