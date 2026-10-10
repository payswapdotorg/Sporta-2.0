import { test } from "node:test";
import assert from "node:assert/strict";
import { LabCandidateQueryError, OrganizationCandidateReadService } from "../src/contract.js";
import type { OrganizationCandidateQuery, OrganizationCandidateReadPort } from "../src/contract.js";
import {
  InMemoryOrganizationStore,
  OrganizationRegistryService,
} from "@sporta/organizations/contract";
import type { IntentSpec, OrganizationVersionRecord } from "@sporta/contracts/contract";

/**
 * Fixture-grade evidence (in-memory stores, fixed clock): these tests
 * prove the read-seam LAWS (field-for-field summaries, honest status
 * mapping, bounded queries, read-only surface), never durability.
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

/** Two drafts + one promoted org + a promoted-then-drafted second version. */
async function seedPopulation(fixture: ReadFixture): Promise<void> {
  const { registry } = fixture;
  await registry.registerDraft({ record: makeOrganization("org:a", 1) });
  await registry.registerDraft({ record: makeOrganization("org:b", 1) });
  await registry.promote({ organizationId: "org:b", version: 1 });
  await registry.registerDraft({ record: makeOrganization("org:c", 1) });
  await registry.promote({ organizationId: "org:c", version: 1 });
  await registry.registerDraft({ record: makeOrganization("org:c", 2) });
}

test("listOrganizationCandidates returns field-for-field summaries in deterministic order", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
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
      ["org:a:1", "org:a", 1, "candidate", "unpromoted registry draft"],
      ["org:b:1", "org:b", 1, "promoted", "promotion record promotion:org:b:1"],
      ["org:c:1", "org:c", 1, "promoted", "promotion record promotion:org:c:1"],
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

test("listOrganizationCandidates filters by organizationId and candidateId", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
  const byOrg: OrganizationCandidateQuery = { organizationId: "org:c" };
  assert.deepEqual(
    (await fixture.read.listOrganizationCandidates(byOrg)).map((s) => s.candidateId),
    ["org:c:1", "org:c:2"],
  );
  const byCandidate: OrganizationCandidateQuery = { candidateId: "org:b:1" };
  assert.deepEqual(
    (await fixture.read.listOrganizationCandidates(byCandidate)).map((s) => s.candidateId),
    ["org:b:1"],
  );
});

test("listOrganizationCandidates filters by status: candidate and promoted", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
  const candidates = await fixture.read.listOrganizationCandidates({ status: "candidate" });
  assert.deepEqual(
    candidates.map((s) => s.candidateId),
    ["org:a:1", "org:c:2"],
  );
  const promoted = await fixture.read.listOrganizationCandidates({ status: "promoted" });
  assert.deepEqual(
    promoted.map((s) => s.candidateId),
    ["org:b:1", "org:c:1"],
  );
});

test("status filters for rejected/rolled-back return an honest empty array (unreachable states)", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
  assert.deepEqual(await fixture.read.listOrganizationCandidates({ status: "rejected" }), []);
  assert.deepEqual(await fixture.read.listOrganizationCandidates({ status: "rolled-back" }), []);
});

test("bounded read: default limit is capped at 50 (fixtures: 55 drafts -> 50 rows)", async () => {
  const fixture = makeReadFixture();
  for (let index = 0; index < 55; index += 1) {
    const id = `org:bulk-${String(index).padStart(3, "0")}`;
    await fixture.registry.registerDraft({ record: makeOrganization(id, 1) });
  }
  const defaultRows = await fixture.read.listOrganizationCandidates({});
  assert.equal(defaultRows.length, 50);
  const cappedRows = await fixture.read.listOrganizationCandidates({ limit: 500 });
  assert.equal(cappedRows.length, 50);
  const smallRows = await fixture.read.listOrganizationCandidates({ limit: 3 });
  assert.equal(smallRows.length, 3);
});

test("invalid limits are typed refusals, never silently coerced", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
  for (const limit of [0, -1, 2.5]) {
    await assert.rejects(
      fixture.read.listOrganizationCandidates({ limit }),
      (error: unknown) => error instanceof LabCandidateQueryError,
    );
    await assert.rejects(
      fixture.read.listPromotions({ limit }),
      (error: unknown) => error instanceof LabCandidateQueryError,
    );
  }
});

test("listPromotions mirrors PromotionRecord identity fields field-for-field", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
  const promotions = await fixture.read.listPromotions({});
  assert.deepEqual(promotions, [
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
  ]);
  for (const promotion of promotions) {
    assert.deepEqual(Object.keys(promotion).sort(), [
      "candidateId",
      "decidedAt",
      "decision",
      "promotionId",
    ]);
  }
});

test("listPromotions filters by candidateId, organizationId and status->decision mapping", async () => {
  const fixture = makeReadFixture();
  await seedPopulation(fixture);
  assert.deepEqual(
    (await fixture.read.listPromotions({ candidateId: "org:b:1" })).map((p) => p.promotionId),
    ["promotion:org:b:1"],
  );
  assert.deepEqual(
    (await fixture.read.listPromotions({ organizationId: "org:c" })).map((p) => p.promotionId),
    ["promotion:org:c:1"],
  );
  assert.equal((await fixture.read.listPromotions({ status: "promoted" })).length, 2);
  // "candidate" matches no promotion: a never-promoted version has none.
  assert.deepEqual(await fixture.read.listPromotions({ status: "candidate" }), []);
  assert.deepEqual(await fixture.read.listPromotions({ status: "rejected" }), []);
});

test("empty registry: both reads return honest empty arrays", async () => {
  const fixture = makeReadFixture();
  assert.deepEqual(await fixture.read.listOrganizationCandidates({}), []);
  assert.deepEqual(await fixture.read.listPromotions({}), []);
});

test("the seam is read-only: only the two port methods exist on the surface", async () => {
  const fixture = makeReadFixture();
  const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(fixture.read)).filter(
    (name) => name !== "constructor",
  );
  assert.deepEqual([...methodNames].sort(), ["listOrganizationCandidates", "listPromotions"]);
  // Compile-time check: the service satisfies the contracts port exactly.
  const port: OrganizationCandidateReadPort = fixture.read;
  assert.equal(typeof port.listOrganizationCandidates, "function");
  assert.equal(typeof port.listPromotions, "function");
});
