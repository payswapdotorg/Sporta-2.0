import {
  EditorBrokerService,
  EditorSessionHistoryService,
  FixedClock,
  InMemoryEditorSessionHistoryStore,
  InMemoryEditorSessionStore,
  InMemorySharedSessionStore,
  KdenliveFixtureAdapter,
  MysteryAppFixtureAdapter,
  SharedEditorSessionService,
  sha256EditorHash,
} from "../src/contract.js";
import { ArtifactGraphService } from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type {
  SharedDeltaDelivery,
  SharedDeltaSinkPort,
  SharedEditorSessionDeps,
} from "../src/contract.js";
/**
 * Shared fixtures for the W6A service-level test suites (support file —
 * deliberately NOT named *.test.ts so the test glob never executes it;
 * the a17 support-file pattern). EVIDENCE CLASS of everything here:
 * FIXTURE (in-memory stores, fixture adapters, fixed clock).
 */

export const CHECKPOINT_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const SESSION_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const NARROW_SESSION_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render", "edit"], prohibitions: ["derive"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const NO_EDIT_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const PROVENANCE: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:w6a",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

export const EDITOR_AVAILABILITY = [
  {
    editorId: "kdenlive",
    version: "24.08.0",
    integrationLevel: 2 as const,
    projectFormat: "kdenlive",
    licensing: "GPL-3.0",
  },
  { editorId: "mystery-app", integrationLevel: 1 as const, licensing: "proprietary-fixture" },
];

/** A delta sink that records every fan-out delivery (fixture). */
export class RecordingSink implements SharedDeltaSinkPort {
  readonly deliveries: SharedDeltaDelivery[] = [];
  async publish(delivery: SharedDeltaDelivery): Promise<void> {
    this.deliveries.push(delivery);
  }
}

export interface SharedSessionFixture {
  service: SharedEditorSessionService;
  broker: EditorBrokerService;
  artifacts: ArtifactGraphService;
  clock: FixedClock;
  sharedStore: InMemorySharedSessionStore;
  sink?: RecordingSink;
}

/** Wire the real broker + real service over fixture stores. */
export function fixture(options?: {
  withSink?: boolean;
  withHistoryRead?: boolean;
}): SharedSessionFixture {
  const clock = new FixedClock("2026-10-01T00:00:00.000Z");
  const artifacts = new ArtifactGraphService(clock);
  const historyStore = new InMemoryEditorSessionHistoryStore();
  const broker = new EditorBrokerService({
    clock,
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
    sessionHistory: historyStore,
  });
  const sharedStore = new InMemorySharedSessionStore();
  const sink = options?.withSink === true ? new RecordingSink() : undefined;
  const deps: SharedEditorSessionDeps = {
    clock,
    hash: sha256EditorHash,
    broker,
    artifactGraph: artifacts,
    sharedSessionStore: sharedStore,
    ...(sink === undefined ? {} : { deltaSink: sink }),
    ...(options?.withHistoryRead === true
      ? { historyRead: new EditorSessionHistoryService({ history: historyStore }) }
      : {}),
  };
  const wired: SharedSessionFixture = {
    service: new SharedEditorSessionService(deps),
    broker,
    artifacts,
    clock,
    sharedStore,
  };
  return sink === undefined ? wired : { ...wired, sink };
}

/** Seed one artifact revision with the given policy (fixture). */
export async function seedRevision(
  artifacts: ArtifactGraphService,
  revisionId: string,
  policy: PolicySet,
): Promise<string> {
  const artifactId = `art:${revisionId}`;
  await artifacts.recordArtifact({
    artifactId,
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const revision = await artifacts.commitRevision({
    artifactId,
    revisionId,
    contentHash: sha256EditorHash(revisionId),
    toolVersions: ["sporta-render@0"],
    provenance: PROVENANCE,
    policy,
  });
  return revision.revisionId;
}

/** Open a shared session with the standard opener (fixture helper). */
export async function openSession(
  service: SharedEditorSessionService,
  revisionId: string,
  sessionId: string,
  options?: { policy?: PolicySet },
) {
  return service.openSharedSession({
    sessionId,
    revisionId,
    availability: EDITOR_AVAILABILITY,
    userPreference: "kdenlive",
    mode: "local",
    policy: options?.policy ?? SESSION_POLICY,
    opener: {
      participantId: "user:opener",
      capabilities: ["timeline"],
      usage: { usages: ["edit", "render"] },
    },
  });
}
