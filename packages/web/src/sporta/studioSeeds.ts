/**
 * Seed data for the Transform Studio host composition (W10A-1) — the
 * hostSeeds.ts precedent: fixture CONTENT behind the REAL ports.
 *
 * EVIDENCE CLASS: fixture for the CONTENT (the sample pipeline
 * manifest, the sample feed bytes, the tag-board descriptor, the draft
 * envelopes); every REAL leg that consumes them (the REAL
 * `validateTransformPipelineManifest`, the REAL marketplace services
 * and fail-closed admission, the REAL ApplicationEnvironmentService
 * laws, the REAL TransformRunService child-process run) is real — the
 * fixtures are the data those REAL legs carry, mirroring the
 * a17-full-real / hostSeeds.ts composition's fixtures.
 */
import type { PolicySet } from "@sporta/contracts/contract";
import {
  Sha256TransformHash,
  jsonEventStreamTrimComponent,
  stableStringify,
  type TransformNode,
  type TransformPipelineManifest,
} from "@sporta/transforms/contract";
import type { ApplicationEnvironmentDescriptor } from "@sporta/app-environments/contract";
import { SPORTA_HOST_POLICY, SPORTA_HOST_TENANT } from "./hostSeeds.js";
import type { StudioGraphDraft } from "./studio/studioPorts.js";

export const STUDIO_VERSION = "1.0.0";
export const STUDIO_PUBLISHER = "publisher:studio-host";
export const STUDIO_WORKSPACE = "ws:sporta-host";
export const STUDIO_WORK_GRAPH_ID = "wg:studio-host";
export const STUDIO_SAMPLE_PIPELINE_ID = "pipe:studio-host";
export const STUDIO_SUSPENDED_PIPELINE_ID = "pipe:studio-host-boards";
export const STUDIO_SAMPLE_FEED_REF = "art:studio-sample-feed";
export const STUDIO_SAMPLE_PROVENANCE_AT = "2026-10-13T12:00:00.000Z";

const STREAM_PORT = { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" as const };

/**
 * The declared envelope every studio node carries: drafts add it around
 * the 1:1-mapped draft fields (safe sandbox posture, bounded resources,
 * fail-closed error behavior — lock-invariant-32 analog; the draft maps
 * the user's fields, the envelope is the composition's declared law).
 */
export function studioNodeEnvelope(
  nodeId: string, kind: TransformNode["kind"], digest: string, name: string,
  inputs: readonly TransformNode["inputs"][number][], outputs: readonly TransformNode["outputs"][number][],
  parameterSchema: TransformNode["parameterSchema"] = {},
): TransformNode {
  return {
    nodeId, kind, componentRef: { kind, digest, name },
    inputs: [...inputs], outputs: [...outputs], parameterSchema,
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 15_000, maxOutputBytes: 1_000_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "fail-closed", contract: "studio graphs fail closed — never run unreviewed" },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
}

/**
 * Map the studio draft 1:1 onto a full manifest: node/edge fields map
 * 1:1; the composition adds ONLY the declared envelopes the manifest
 * requires (draft identity, safe sandbox/resources/error envelopes, the
 * operator policy, declared-grade expectations). The draft digest is a
 * REAL sha-256 of the draft content (an identity, never a claim that
 * the draft is a reviewed release).
 */
export function studioDraftManifest(draft: StudioGraphDraft): TransformPipelineManifest {
  const nodes = draft.nodes.map((node) =>
    studioNodeEnvelope(node.nodeId, node.kind, node.componentDigest, node.componentName, node.inputs, node.outputs));
  const edges = draft.edges.map((edge) => ({
    from: { nodeId: edge.from.nodeId, port: edge.from.port },
    to: { nodeId: edge.to.nodeId, port: edge.to.port },
  }));
  return {
    pipelineId: "pipe:studio-draft",
    version: "0.0.0-draft",
    manifestDigest: new Sha256TransformHash().text(stableStringify(draft)),
    publisher: "user:operator",
    purpose: "studio draft validation (unreviewed)",
    limitations: ["draft — never published, never run"],
    inputs: [], outputs: [], nodes, edges,
    semantics: { preservationClaims: [], declaredChanges: [], measurement: { evidenceKind: "declared", benchmarkIds: [] } },
    expectedOutputs: [], pinnedDependencies: [],
    licensing: { license: "UNREVIEWED-DRAFT", provenance: "studio draft" },
    policy: SPORTA_HOST_POLICY satisfies PolicySet,
    cancellation: { supportsCheckpoint: false, contract: "drafts are never run" },
    expectations: { typicalLatencyMs: 0, declaredThroughput: "n/a (draft)", evidenceGrade: "declared" },
  };
}

/**
 * The seeded sample pipeline: ONE REAL deterministic trim node whose
 * digest is the REAL `json-event-stream-trim` component digest (so the
 * sample-preview run executes the REAL child-process component). The
 * manifest CONTENT is fixture; the pipeline it describes is real
 * enough to run through the REAL validator and run service.
 */
export function studioSeedManifest(pipelineId: string): TransformPipelineManifest {
  const transformHash = new Sha256TransformHash();
  const trim = jsonEventStreamTrimComponent(transformHash);
  const trimNode = studioNodeEnvelope(
    "node:trim", "deterministic-filter", trim.digest, trim.name, [STREAM_PORT], [STREAM_PORT],
    { startMs: { type: "number", required: true, minimum: 0 }, endMs: { type: "number", required: true, minimum: 0 } },
  );
  return {
    pipelineId, version: STUDIO_VERSION,
    manifestDigest: transformHash.text(JSON.stringify({ pipeline: pipelineId, version: STUDIO_VERSION })),
    publisher: STUDIO_PUBLISHER,
    purpose: "studio host seed: trim a prerecorded feed to the highlights window",
    limitations: ["fixture seed content; the deterministic trim run is real"],
    inputs: [STREAM_PORT], outputs: [STREAM_PORT], nodes: [trimNode], edges: [],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [{ kind: "code", name: trim.name, digest: trim.digest, license: "MIT", storageRef: "fabric:studio-host" }],
    licensing: { license: "MIT", provenance: "studio host seed" },
    policy: SPORTA_HOST_POLICY satisfies PolicySet,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  };
}

/**
 * The declared sample feed (fixture bytes — 5 events with ids, order,
 * timestamps and provenance; the REAL trim run over them is what the
 * sample preview shows).
 */
export function studioSampleFeedBytes(): Uint8Array {
  const events = [0, 1, 2, 3, 4].map((index) => ({
    eventId: `evt-${index + 1}`,
    entityId: index % 2 === 0 ? "team-A" : "team-B",
    atMs: 1000 + index * 1000,
    confidence: 0.3 + index / 10,
    provenance: { sourceKind: "observation", sourceRef: `source:${index + 1}`, capturedAt: STUDIO_SAMPLE_PROVENANCE_AT },
  }));
  return new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

/**
 * The seeded tag-board app descriptor (fixture content; the registry
 * laws that validate it — catalog stability, class vocabulary, data
 * scope disclosure — are the REAL domain laws). One observe capability
 * + one control capability so granted-vs-not-granted is visible.
 */
export function studioSeedDescriptor(now: string): ApplicationEnvironmentDescriptor {
  return {
    descriptorId: "desc:studio-tag-board",
    applicationId: "app:studio-tag-board",
    providerAdapterId: "adapter:studio-fixture-probe",
    appVersion: "1.0.0",
    targetKind: "local",
    targetIdentity: "local:app:studio-tag-board@1.0.0:studio-host",
    workspaceBinding: { tenant: SPORTA_HOST_TENANT, workspace: STUDIO_WORKSPACE },
    capabilities: [
      {
        capabilityId: "cap:studio-read-status", capabilityClass: "observe", action: "read-status",
        inputs: [], outputs: [{ name: "status", dataKind: "app/status" }],
        sideEffects: [], requiredPermissions: [], failures: ["app-exit-nonzero"],
      },
      {
        capabilityId: "cap:studio-append-highlight", capabilityClass: "control", action: "append-highlight",
        inputs: [{ name: "label", dataKind: "app/highlight-label", required: true }, { name: "eventId", dataKind: "app/event-id", required: true }],
        outputs: [{ name: "entry", dataKind: "app/highlight-entry" }],
        sideEffects: ["mutates highlights.json"], requiredPermissions: [], failures: ["app-exit-nonzero"],
      },
    ],
    launchRequirements: ["studio host composition"],
    dataClasses: ["app-status", "app-highlights"],
    networkNeeds: "none",
    licensing: { license: "MIT", provenance: "studio host fixture seed" },
    health: { checkedAt: now, status: "healthy" },
    limitations: ["fixture seed descriptor"],
    policy: SPORTA_HOST_POLICY satisfies PolicySet,
  };
}
