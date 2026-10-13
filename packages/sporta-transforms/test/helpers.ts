/**
 * Shared fixtures for the Wave 9 test suites.
 *
 * EVIDENCE CLASS: fixture CONTENT — the manifests/events here are
 * deterministic test data; every PROCESS observation (spawns, exit
 * codes, timing, resources, revisions) is REAL and measured by the
 * suites that use these helpers.
 */
import type {
  PolicySet,
  ProvenanceDescriptor,
} from "@sporta/contracts/contract";
import type {
  TransformEdge,
  TransformNode,
  TransformPipelineManifest,
} from "../src/contract.js";
import {
  DeterministicComponentStore,
  DeterministicFilterNodeAdapter,
  FixtureTransformModelAdapter,
  Sha256TransformHash,
  jsonEventStreamTrimComponent,
} from "../src/contract.js";

export const hash = new Sha256TransformHash();

/** The REAL pinned trim component (digest computed from its source). */
export const trimComponent = jsonEventStreamTrimComponent(hash);

/** A slow component (8s sleep) for timeout/kill/cancel process tests. */
export const SLOW_TRIM_SOURCE = `#!/usr/bin/env node
// slow-trim — test component: sleeps 8s before writing a valid trim output.
import { writeFileSync } from "node:fs";
const [inputPath, outputPath, summaryPath] = process.argv.slice(2);
await new Promise((resolve) => setTimeout(resolve, 8000));
writeFileSync(outputPath, "", "utf8");
writeFileSync(summaryPath, JSON.stringify({
  component: "slow-trim", version: 1, ok: true, total: 0, kept: 0, dropped: 0,
  inBytes: 0, outBytes: 0, cpuUserMs: 0, cpuSystemMs: 0, maxRssKiB: 0,
}), "utf8");
process.exitCode = 0;
`;

export const EVENT_STREAM_DATAKIND = "sporta/json-event-stream";

export function eventStreamBytes(
  overrides: { atMs?: (index: number) => number } = {},
): Uint8Array {
  const atMs = overrides.atMs ?? ((index: number) => 1000 + index * 1000);
  const events = [0, 1, 2, 3, 4].map((index) => ({
    eventId: `evt-${index + 1}`,
    entityId: index % 2 === 0 ? "team-A" : "team-B",
    atMs: atMs(index),
    confidence: 0.3 + index / 10,
    provenance: {
      sourceKind: "observation",
      sourceRef: `source:${index + 1}`,
      capturedAt: "2026-10-13T00:00:00.000Z",
    },
  }));
  return new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

export const feedProvenance: ProvenanceDescriptor = {
  sourceKind: "authorized-source",
  sourceRef: "source:feed-1",
  capturedAt: "2026-10-13T00:00:00.000Z",
  confidence: 0.95,
};

export const testPolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export function makeTrimNode(
  overrides: Partial<TransformNode> & { nodeId?: string } = {},
): TransformNode {
  return {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: trimComponent.digest,
      name: trimComponent.name,
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
    ...overrides,
  };
}

export function makeModelNode(
  overrides: Partial<TransformNode> & { nodeId?: string } = {},
): TransformNode {
  return {
    nodeId: "node:model",
    kind: "model",
    componentRef: {
      kind: "model",
      digest: `sha256:${"6".repeat(64)}`,
      name: "fixture-event-summer",
    },
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "summary", dataKind: "sporta/json-summary", required: true, cardinality: "single" }],
    parameterSchema: {},
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: { timeoutMs: 5_000, maxOutputBytes: 100_000, cpuClass: "light", memoryMiB: 256 },
    errorBehavior: { mode: "declared-fallback", contract: "refusals fall back to identity pass-through" },
    provenanceRules: ["model output labeled with its evidence grade"],
    ...overrides,
  };
}

export function makeManifest(
  nodes: readonly TransformNode[],
  edges: readonly TransformEdge[] = [],
  overrides: Partial<TransformPipelineManifest> = {},
): TransformPipelineManifest {
  return {
    pipelineId: "pipe:test",
    version: "1.0.0",
    manifestDigest: `sha256:${"a".repeat(64)}`,
    publisher: "publisher:test",
    purpose: "test pipeline",
    limitations: ["test only"],
    inputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    outputs: [{ name: "events", dataKind: EVENT_STREAM_DATAKIND, required: true, cardinality: "stream" }],
    nodes,
    edges,
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [],
    licensing: { license: "MIT", provenance: "test" },
    policy: testPolicy,
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: { typicalLatencyMs: 500, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    ...overrides,
  };
}

export function makeStore(extraComponents: { name: string; kind: "deterministic-filter" | "script"; source: string }[] = []): DeterministicComponentStore {
  return new DeterministicComponentStore(
    [trimComponent, ...extraComponents.map((component) => ({ ...component }))],
    hash,
  );
}

export function makeExecutor(store: DeterministicComponentStore): DeterministicFilterNodeAdapter {
  return new DeterministicFilterNodeAdapter({ store });
}

export function makeModelLane(): FixtureTransformModelAdapter {
  return new FixtureTransformModelAdapter();
}
