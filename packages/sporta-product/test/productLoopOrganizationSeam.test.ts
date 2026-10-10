/**
 * W4C-1 integration test: the product-loop projection consumes the REAL
 * Worker-A organization candidate read seam (OrganizationCandidateReadService
 * from @sporta/lab/contract) as its optional `organizationCandidates` dep.
 *
 * EVIDENCE CLASS: hybrid — the SEAM and the PROJECTION WIRING are production
 * code (real service over the real registry service); the STORES are
 * hand-written fixtures (InMemoryOrganizationStore, fixed clock, in-test
 * resolver/work/artifact/editor/arena ports typed from the frozen contracts).
 * No durability is claimed.
 *
 * Laws proven:
 * - seam present ⇒ the organization-improvement stage completes DONE with
 *   field-for-field candidate/promotion summaries in the trace (promoted
 *   population), and reports ACTIVE for a live candidate version (the
 *   current improvement leg outranks past promotions);
 * - seam absent ⇒ the stage keeps the exact seam-pending detail (graceful
 *   degradation parity — the v1 law);
 * - queries are scoped to the resolved organization (no cross-org leak).
 *
 * Project law: node:test + tsx only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  IntentSpec,
  OrganizationVersionRecord,
  PolicySet,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { WorkGraphPort } from "@sporta/work/contract";
import type { OrganizationResolverPort, OrganizationSelection } from "@sporta/organizations/contract";
import {
  InMemoryOrganizationStore,
  OrganizationRegistryService,
} from "@sporta/organizations/contract";
import { OrganizationCandidateReadService } from "@sporta/lab/contract";
import type { ArtifactGraphPort } from "@sporta/artifacts/contract";
import type { EditorBrokerPort } from "@sporta/editors/contract";
import type { ArenaClientPort } from "@sporta/arena/contract";
import { ProductLoopProjection } from "../src/app/productLoopProjection.js";
import { SEAM_IMPROVEMENT } from "../src/app/productLoopEscalationStages.js";

const NOW = "2026-10-07T12:00:00.000Z";
const now = (): string => NOW;

function fixturePolicySet(): PolicySet {
  return {
    rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

function fixtureIntent(): IntentSpec {
  return {
    goal: "produce a tactical replay of the match",
    constraints: [],
    artifactRequirements: ["tactical-board-video"],
    learningPolicy: { scopes: [], requireConsent: true },
    policy: fixturePolicySet(),
  };
}

function fixtureWorkGraph(): WorkGraphRecord {
  return {
    workGraphId: "wg:org-seam",
    intent: fixtureIntent(),
    nodes: [
      { nodeId: "task:1", kind: "task", seq: 1 },
      { nodeId: "run:1", kind: "run", parent: "task:1", seq: 2 },
      { nodeId: "out:1", kind: "outcome", parent: "task:1", seq: 3 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    status: "closed",
  };
}

/** A full registry-grade organization version (the real service reads these). */
function makeOrganization(
  organizationId: string,
  version: number,
): OrganizationVersionRecord {
  return {
    organizationId,
    version,
    intentProfile: "sports-replay",
    roleGraph: [],
    agentBodies: [],
    cognitiveSubstrates: [],
    toolGraph: [],
    workflowGraph: [],
    environmentProfile: "local",
    fallbacks: [],
    budgets: {},
    learnedPreferences: [],
    evidence: ["ev:1"],
    policy: fixturePolicySet(),
  };
}

class FixtureWorkGraphPort implements WorkGraphPort {
  constructor(private readonly graphs: ReadonlyMap<string, WorkGraphRecord>) {}
  async openIntent(): Promise<never> {
    throw new Error("projection must not open intents");
  }
  async readWorkGraph(workGraphId: string): Promise<WorkGraphRecord | null> {
    return this.graphs.get(workGraphId) ?? null;
  }
  async appendNode(): Promise<never> {
    throw new Error("projection must not append nodes");
  }
}

class FixtureOrganizationResolver implements OrganizationResolverPort {
  constructor(private readonly organization: OrganizationVersionRecord) {}
  async resolve(): Promise<OrganizationSelection> {
    return {
      selected: {
        organization: this.organization,
        rationale: "fixture rationale",
        evidence: ["ev:org"],
      },
      candidates: [],
      explanation: [],
    };
  }
}

class FixtureArtifactGraph implements ArtifactGraphPort {
  async recordArtifact(): Promise<never> {
    throw new Error("projection must not record artifacts");
  }
  async commitRevision(): Promise<never> {
    throw new Error("projection must not commit revisions");
  }
  async readRevision(): Promise<never> {
    throw new Error("not used by the projection");
  }
  async lineage(): Promise<never[]> {
    return [];
  }
}

class FixtureEditorBroker implements EditorBrokerPort {
  async resolveEditor(): Promise<never> {
    throw new Error("projection must not resolve editors");
  }
  async openSession(): Promise<never> {
    throw new Error("projection must not open editor sessions");
  }
  async reconcileSession(): Promise<never> {
    throw new Error("projection must not reconcile sessions");
  }
}

class FixtureArenaClient implements ArenaClientPort {
  async recordGap(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
  async escalate(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
  async readResult(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
  async validateResult(): Promise<never> {
    throw new Error("projection must not use the arena client");
  }
}

interface RealSeamHarness {
  projection: ProductLoopProjection;
  /** The real Worker-A seam over the real registry service (fixture store). */
  seam: OrganizationCandidateReadService;
  registry: OrganizationRegistryService;
}

/**
 * Wires the projection with the REAL organization candidate read seam
 * (OrganizationCandidateReadService over OrganizationRegistryService).
 * The registry store is a labeled fixture (in-memory, fixed clock).
 */
function makeRealSeamHarness(
  organization: OrganizationVersionRecord,
  graph: WorkGraphRecord = fixtureWorkGraph(),
): RealSeamHarness {
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now,
  });
  const seam = new OrganizationCandidateReadService({ catalog: registry });
  const projection = new ProductLoopProjection({
    workGraphs: new FixtureWorkGraphPort(new Map([[graph.workGraphId, graph]])),
    organizations: new FixtureOrganizationResolver(organization),
    artifacts: new FixtureArtifactGraph(),
    editors: new FixtureEditorBroker(),
    arena: new FixtureArenaClient(),
    organizationCandidates: seam,
  });
  return { projection, seam, registry };
}

function byStage(stages: readonly { stage: string }[]) {
  return new Map(stages.map((stage) => [stage.stage, stage]));
}

test("real seam: promoted organization version completes the improvement stage DONE with the promotion summary", async () => {
  const harness = makeRealSeamHarness(makeOrganization("org:tactical", 1));
  await harness.registry.registerDraft({ record: makeOrganization("org:tactical", 1) });
  await harness.registry.promote({ organizationId: "org:tactical", version: 1 });

  const trace = await harness.projection.trace("wg:org-seam");
  assert.deepEqual(byStage(trace.stages).get("organization-improvement"), {
    stage: "organization-improvement",
    state: "done",
    ref: "promotion:org:tactical:1",
    detail: "1 promoted organization version(s)",
  });
});

test("real seam: a live un-promoted candidate version keeps the improvement stage ACTIVE (current leg outranks past promotion)", async () => {
  const harness = makeRealSeamHarness(makeOrganization("org:tactical", 2));
  await harness.registry.registerDraft({ record: makeOrganization("org:tactical", 1) });
  await harness.registry.promote({ organizationId: "org:tactical", version: 1 });
  await harness.registry.registerDraft({ record: makeOrganization("org:tactical", 2) });

  const trace = await harness.projection.trace("wg:org-seam");
  assert.deepEqual(byStage(trace.stages).get("organization-improvement"), {
    stage: "organization-improvement",
    state: "active",
    ref: "org:tactical:2",
    detail: "1 candidate organization version(s)",
  });
});

test("real seam: queries are scoped to the resolved organization — a noisy other-org population does not leak", async () => {
  const harness = makeRealSeamHarness(makeOrganization("org:tactical", 1));
  await harness.registry.registerDraft({ record: makeOrganization("org:tactical", 1) });
  await harness.registry.promote({ organizationId: "org:tactical", version: 1 });
  // Noise: other organizations' candidates and promotions.
  for (const other of ["org:other-1", "org:other-2"]) {
    await harness.registry.registerDraft({ record: makeOrganization(other, 1) });
    await harness.registry.promote({ organizationId: other, version: 1 });
  }

  const trace = await harness.projection.trace("wg:org-seam");
  const stage = byStage(trace.stages).get("organization-improvement");
  assert.equal(stage?.state, "done");
  assert.equal(stage?.ref, "promotion:org:tactical:1");
  assert.equal(stage?.detail, "1 promoted organization version(s)", "counts only org:tactical");
});

test("real seam: an organization with no candidate yet is honestly pending (not an error)", async () => {
  const harness = makeRealSeamHarness(makeOrganization("org:tactical", 1));
  await harness.registry.registerDraft({ record: makeOrganization("org:unrelated", 1) });

  const trace = await harness.projection.trace("wg:org-seam");
  assert.deepEqual(byStage(trace.stages).get("organization-improvement"), {
    stage: "organization-improvement",
    state: "pending",
    detail: "no organization candidate yet",
  });
});

test("absent seam parity: without organizationCandidates the stage keeps the exact seam-pending detail", async () => {
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now,
  });
  await registry.registerDraft({ record: makeOrganization("org:tactical", 1) });
  await registry.promote({ organizationId: "org:tactical", version: 1 });

  // The population exists, but the seam is NOT injected: graceful degradation.
  const projection = new ProductLoopProjection({
    workGraphs: new FixtureWorkGraphPort(new Map([["wg:org-seam", fixtureWorkGraph()]])),
    organizations: new FixtureOrganizationResolver(makeOrganization("org:tactical", 1)),
    artifacts: new FixtureArtifactGraph(),
    editors: new FixtureEditorBroker(),
    arena: new FixtureArenaClient(),
  });
  const trace = await projection.trace("wg:org-seam");
  assert.deepEqual(byStage(trace.stages).get("organization-improvement"), {
    stage: "organization-improvement",
    state: "pending",
    detail: SEAM_IMPROVEMENT,
  });
});
