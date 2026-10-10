import { test } from "node:test";
import assert from "node:assert/strict";
import { OrganizationCandidateReadService } from "../src/contract.js";
import type { OrganizationCandidateReadPort } from "../src/contract.js";
import {
  InMemoryOrganizationStore,
  OrganizationRegistryService,
} from "@sporta/organizations/contract";
import type { IntentSpec, OrganizationVersionRecord } from "@sporta/contracts/contract";

/**
 * Wave 4 — the rejected/rolled-back states surface as REAL data through
 * the Lab read seam (the registry decision path landed; the honest empty
 * arrays become rows). Split from candidateReads.test.ts to honor the
 * file-size law (400 lines).
 *
 * EVIDENCE CLASS: fixture (in-memory stores, fixed clock) — these tests
 * prove the decided-state surfacing LAWS (field-for-field summaries,
 * latest-decision status, decision-ledger listing, bounded queries,
 * determinism), never durability.
 */
const NOW = "2026-10-07T12:00:00.000Z";
const now = (): string => NOW;

function makeIntent(goal: string): IntentSpec {
  return {
    goal,
    constraints: [],
    artifactRequirements: ["reel"],
    learningPolicy: { scopes: [], requireConsent: true },
    policy: {
      rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
  };
}

function makeOrganization(
  organizationId: string,
  version: number,
  overrides: Partial<OrganizationVersionRecord> = {},
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
    policy: makeIntent("goal").policy,
    ...overrides,
  };
}

interface ReadFixture {
  registry: OrganizationRegistryService;
  read: OrganizationCandidateReadService;
}

function makeReadFixture(): ReadFixture {
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now,
  });
  const read = new OrganizationCandidateReadService({ catalog: registry });
  return { registry, read };
}

/**
 * One candidate per reachable status: rejected (org:a), promoted (org:b),
 * promoted-then-rolled-back (org:c v1), undecided draft (org:c v2) —
 * produced through the REAL registry decision path.
 */
async function seedDecidedPopulation(fixture: ReadFixture): Promise<void> {
  const { registry } = fixture;
  await registry.registerDraft({ record: makeOrganization("org:a", 1) });
  await registry.rejectCandidate({ organizationId: "org:a", version: 1 });
  await registry.registerDraft({ record: makeOrganization("org:b", 1) });
  await registry.promote({ organizationId: "org:b", version: 1 });
  await registry.registerDraft({ record: makeOrganization("org:c", 1) });
  await registry.promote({ organizationId: "org:c", version: 1 });
  await registry.rollbackPromotion({ organizationId: "org:c", version: 1 });
  await registry.registerDraft({ record: makeOrganization("org:c", 2) });
}

test("decided candidates surface field-for-field — rejected and rolled-back with their decision basis", async () => {
  const fixture = makeReadFixture();
  await seedDecidedPopulation(fixture);
  const summaries = await fixture.read.listOrganizationCandidates({});
  assert.deepEqual(
    summaries.map((summary) => [
      summary.candidateId,
      summary.organizationId,
      summary.version,
      summary.status,
      summary.basis,
    ]),
    [
      ["org:a:1", "org:a", 1, "rejected", "decision record rejection:org:a:1"],
      ["org:b:1", "org:b", 1, "promoted", "promotion record promotion:org:b:1"],
      ["org:c:1", "org:c", 1, "rolled-back", "decision record rollback:org:c:1"],
      ["org:c:2", "org:c", 2, "candidate", "unpromoted registry draft"],
    ],
  );
  // Field-for-field exactness: exactly the five contracts fields, no fewer.
  for (const summary of summaries) {
    assert.deepEqual(Object.keys(summary).sort(), [
      "basis",
      "candidateId",
      "organizationId",
      "status",
      "version",
    ]);
  }
});

test("status filters return real data for rejected and rolled-back; a rolled-back candidate is not promoted", async () => {
  const fixture = makeReadFixture();
  await seedDecidedPopulation(fixture);
  const rejected = await fixture.read.listOrganizationCandidates({ status: "rejected" });
  assert.deepEqual(rejected.map((summary) => summary.candidateId), ["org:a:1"]);
  const rolledBack = await fixture.read.listOrganizationCandidates({ status: "rolled-back" });
  assert.deepEqual(rolledBack.map((summary) => summary.candidateId), ["org:c:1"]);
  // The retracted promotion no longer counts as promoted (the latest
  // decision wins); the still-promoted candidate does.
  const promoted = await fixture.read.listOrganizationCandidates({ status: "promoted" });
  assert.deepEqual(promoted.map((summary) => summary.candidateId), ["org:b:1"]);
  // organizationId + status compose.
  const rolledBackByOrg = await fixture.read.listOrganizationCandidates({
    organizationId: "org:c",
    status: "rolled-back",
  });
  assert.deepEqual(rolledBackByOrg.map((summary) => summary.candidateId), ["org:c:1"]);
  assert.deepEqual(
    (await fixture.read.listOrganizationCandidates({ candidateId: "org:a:1" }))[0]?.status,
    "rejected",
  );
});

test("listPromotions surfaces the full decision ledger (rejected + rolled-back included, promotion history kept)", async () => {
  const fixture = makeReadFixture();
  await seedDecidedPopulation(fixture);
  const promotions = await fixture.read.listPromotions({});
  assert.deepEqual(promotions, [
    {
      promotionId: "rejection:org:a:1",
      candidateId: "org:a:1",
      decision: "rejected",
      decidedAt: NOW,
    },
    {
      promotionId: "promotion:org:b:1",
      candidateId: "org:b:1",
      decision: "promoted",
      decidedAt: NOW,
    },
    {
      promotionId: "promotion:org:c:1",
      candidateId: "org:c:1",
      decision: "promoted",
      decidedAt: NOW,
    },
    {
      promotionId: "rollback:org:c:1",
      candidateId: "org:c:1",
      decision: "rolled-back",
      decidedAt: NOW,
    },
  ]);
  // Status→decision filters map onto the new decisions.
  assert.deepEqual(
    (await fixture.read.listPromotions({ status: "rejected" })).map((p) => p.promotionId),
    ["rejection:org:a:1"],
  );
  assert.deepEqual(
    (await fixture.read.listPromotions({ status: "rolled-back" })).map((p) => p.promotionId),
    ["rollback:org:c:1"],
  );
  // The earlier promotion of the rolled-back candidate stays queryable.
  assert.deepEqual(
    (await fixture.read.listPromotions({ organizationId: "org:c", status: "promoted" })).map(
      (p) => p.promotionId,
    ),
    ["promotion:org:c:1"],
  );
  assert.deepEqual(
    (await fixture.read.listPromotions({ candidateId: "org:c:1" })).map((p) => p.promotionId),
    ["promotion:org:c:1", "rollback:org:c:1"],
  );
});

test("decided-state reads are deterministic — repeated queries are byte-identical", async () => {
  const fixture = makeReadFixture();
  await seedDecidedPopulation(fixture);
  const first = await fixture.read.listOrganizationCandidates({});
  const second = await fixture.read.listOrganizationCandidates({});
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  const promotionsFirst = await fixture.read.listPromotions({});
  const promotionsSecond = await fixture.read.listPromotions({});
  assert.equal(JSON.stringify(promotionsSecond), JSON.stringify(promotionsFirst));
});

test("the bounded-read laws hold over decided populations too", async () => {
  const fixture = makeReadFixture();
  // One rejected candidate per organization, 55 orgs: the rejected filter
  // still caps at 50 rows (filters first, capped limit last).
  for (let index = 0; index < 55; index += 1) {
    const id = `org:bulk-${String(index).padStart(3, "0")}`;
    await fixture.registry.registerDraft({ record: makeOrganization(id, 1) });
    await fixture.registry.rejectCandidate({ organizationId: id, version: 1 });
  }
  const rejected = await fixture.read.listOrganizationCandidates({ status: "rejected" });
  assert.equal(rejected.length, 50);
  assert.ok(rejected.every((summary) => summary.status === "rejected"));
  const firstThree = await fixture.read.listOrganizationCandidates({
    status: "rejected",
    limit: 3,
  });
  assert.deepEqual(
    firstThree.map((summary) => summary.candidateId),
    ["org:bulk-000:1", "org:bulk-001:1", "org:bulk-002:1"],
  );
});

test("the seam surface is unchanged by the Wave 4 states: read-only, exactly the two port methods", async () => {
  const fixture = makeReadFixture();
  await seedDecidedPopulation(fixture);
  const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(fixture.read)).filter(
    (name) => name !== "constructor",
  );
  assert.deepEqual([...methodNames].sort(), ["listOrganizationCandidates", "listPromotions"]);
  const port: OrganizationCandidateReadPort = fixture.read;
  assert.equal(typeof port.listOrganizationCandidates, "function");
  assert.equal(typeof port.listPromotions, "function");
});
