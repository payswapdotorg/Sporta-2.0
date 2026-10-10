import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryOrganizationStore,
  OrganizationDecisionError,
  OrganizationImmutableError,
  OrganizationRegistryService,
  OrganizationResolverService,
  OrganizationResolutionError,
  OrganizationVersionNotFoundError,
  UserPreferenceService,
  InMemoryUserPreferenceStore,
} from "../src/contract.js";
import type { OrganizationVersionRecord, PromotionRecord } from "@sporta/contracts/contract";

/**
 * Wave 4 decision-path tests (ADR wave-4: the organization
 * rejection/rollback decision path). Split from organization.test.ts to
 * honor the file-size law (400 lines).
 *
 * EVIDENCE CLASS: fixture (in-memory store, fixed clock) — these tests
 * prove the decision LAWS (gates, idempotency, immutability,
 * rollback-requires-prior-promotion, typed refusals, read-seam
 * surfacing), never durability.
 */
const NOW = "2026-10-07T12:00:00.000Z";
const now = (): string => NOW;

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
    evidence: ["ev:1", "ev:2"],
    policy: {
      rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
    ...overrides,
  };
}

function makeRegistry(): OrganizationRegistryService {
  return new OrganizationRegistryService({ store: new InMemoryOrganizationStore(), now });
}

function makeResolverFixture(registry: OrganizationRegistryService) {
  const resolver = new OrganizationResolverService({
    catalog: registry,
    preferences: new UserPreferenceService({
      store: new InMemoryUserPreferenceStore(),
      now,
    }),
  });
  return resolver;
}

test("rejectCandidate grants a typed rejection record: deterministic id, gates, evidence, decidedAt", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  const rejection = await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  assert.equal(rejection.decision, "rejected");
  assert.equal(rejection.candidateId, "org:alpha:1");
  assert.equal(rejection.promotionId, "rejection:org:alpha:1");
  assert.deepEqual(rejection.gates, [
    { gate: "version-registered", passed: true },
    { gate: "evidence-present", passed: true },
    { gate: "policy-defined", passed: true },
  ]);
  assert.deepEqual(rejection.evidence, ["ev:1", "ev:2"]);
  assert.equal(rejection.decidedAt, NOW);
  // The rejected candidate was never promoted.
  const catalog = await registry.listVersions();
  assert.equal(catalog[0]?.promoted, false);
});

test("rejectCandidate is idempotent per candidate+decision for identical effective evidence", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  const first = await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  const retry = await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  assert.deepEqual(retry, first);
  // Identical effective evidence (input ∪ record evidence, deduped,
  // input first) is idempotent: input ["ev:1"] + record ["ev:1","ev:2"].
  const identical = await registry.rejectCandidate({
    organizationId: "org:alpha",
    version: 1,
    evidence: ["ev:1"],
  });
  assert.deepEqual(identical, first);
  // Different effective evidence is a typed immutability refusal.
  await assert.rejects(
    registry.rejectCandidate({
      organizationId: "org:alpha",
      version: 1,
      evidence: ["ev:extra"],
    }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
});

test("rejectCandidate is evidence/policy gated like promotion (typed refusals)", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({
    record: makeOrganization("org:no-evidence", 1, { evidence: [] }),
  });
  await assert.rejects(
    registry.rejectCandidate({ organizationId: "org:no-evidence", version: 1 }),
    (error: unknown) =>
      error instanceof OrganizationDecisionError && /evidence-present/.test(error.message),
  );
  await registry.registerDraft({
    record: makeOrganization("org:no-policy", 1, {
      policy: {
        rights: { holders: [], usages: [], prohibitions: [] },
        privacy: { visibility: "tenant", exportableFields: [] },
        retention: { disposition: "retain" },
      },
    }),
  });
  await assert.rejects(
    registry.rejectCandidate({ organizationId: "org:no-policy", version: 1 }),
    (error: unknown) =>
      error instanceof OrganizationDecisionError && /policy-defined/.test(error.message),
  );
  // Evidence can come from the input when the record has none (promotion parity).
  const rejected = await registry.rejectCandidate({
    organizationId: "org:no-evidence",
    version: 1,
    evidence: ["ev:input"],
  });
  assert.deepEqual(rejected.evidence, ["ev:input"]);
});

test("rejecting an unknown version is a typed error", async () => {
  const registry = makeRegistry();
  await assert.rejects(
    registry.rejectCandidate({ organizationId: "org:ghost", version: 1 }),
    (error: unknown) => error instanceof OrganizationVersionNotFoundError,
  );
});

test("rejection is terminal: promote after reject is a typed immutability refusal", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  await assert.rejects(
    registry.promote({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
  // The registry stays append-only: a NEW version of the same
  // organization is still promotable (the escape hatch the error names).
  await registry.registerDraft({ record: makeOrganization("org:alpha", 2) });
  const promotion = await registry.promote({ organizationId: "org:alpha", version: 2 });
  assert.equal(promotion.decision, "promoted");
});

test("rejecting a promoted or rolled-back candidate is a typed immutability refusal (rollback is the retraction path)", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.promote({ organizationId: "org:alpha", version: 1 });
  await assert.rejects(
    registry.rejectCandidate({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
  await registry.rollbackPromotion({ organizationId: "org:alpha", version: 1 });
  await assert.rejects(
    registry.rejectCandidate({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
});

test("a decided (rejected) version keeps draft-conflict semantics for content changes: register a new version", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  // Identical re-registration stays idempotent (no state change).
  const retry = await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  assert.deepEqual(retry, makeOrganization("org:alpha", 1));
  // Different content is the append-only conflict (a new version is the path).
  await assert.rejects(
    registry.registerDraft({
      record: makeOrganization("org:alpha", 1, { intentProfile: "mutated" }),
    }),
    (error: unknown) =>
      error.constructor.name === "OrganizationDraftConflictError",
  );
});

test("rollbackPromotion retracts a granted promotion: typed record, promoted flag flipped, history kept", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.promote({ organizationId: "org:alpha", version: 1 });
  const rollback = await registry.rollbackPromotion({ organizationId: "org:alpha", version: 1 });
  assert.equal(rollback.decision, "rolled-back");
  assert.equal(rollback.candidateId, "org:alpha:1");
  assert.equal(rollback.promotionId, "rollback:org:alpha:1");
  assert.deepEqual(rollback.gates, [
    { gate: "version-registered", passed: true },
    { gate: "prior-promotion", passed: true },
    { gate: "evidence-present", passed: true },
    { gate: "policy-defined", passed: true },
  ]);
  assert.equal(rollback.decidedAt, NOW);
  // The catalog no longer offers the version as promoted...
  const catalog = await registry.listVersions();
  assert.equal(catalog[0]?.promoted, false);
  // ...and the resolver no longer selects it (the only promoted version
  // was retracted): resolution is a typed error again.
  const resolver = makeResolverFixture(registry);
  await assert.rejects(
    resolver.resolve({
      intent: {
        goal: "produce a tactical replay",
        constraints: [],
        artifactRequirements: ["reel"],
        learningPolicy: { scopes: [], requireConsent: true },
        policy: makeOrganization("org:alpha", 1).policy,
      },
      workGraph: {
        workGraphId: "wg:fixture",
        intent: {
          goal: "produce a tactical replay",
          constraints: [],
          artifactRequirements: ["reel"],
          learningPolicy: { scopes: [], requireConsent: true },
          policy: makeOrganization("org:alpha", 1).policy,
        },
        nodes: [],
        createdAt: NOW,
        updatedAt: NOW,
        status: "open",
      },
      environmentProfile: "local",
      constraints: [],
    }),
    (error: unknown) => error instanceof OrganizationResolutionError,
  );
  // The history port keeps BOTH records in grant order (append-only).
  const records = await registry.listPromotionRecords();
  assert.deepEqual(
    records.map((record: PromotionRecord) => [record.promotionId, record.decision]),
    [
      ["promotion:org:alpha:1", "promoted"],
      ["rollback:org:alpha:1", "rolled-back"],
    ],
  );
});

test("rollbackPromotion is idempotent per candidate+decision for identical effective evidence", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.promote({ organizationId: "org:alpha", version: 1 });
  const first = await registry.rollbackPromotion({ organizationId: "org:alpha", version: 1 });
  const retry = await registry.rollbackPromotion({ organizationId: "org:alpha", version: 1 });
  assert.deepEqual(retry, first);
  await assert.rejects(
    registry.rollbackPromotion({
      organizationId: "org:alpha",
      version: 1,
      evidence: ["ev:different"],
    }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
  // The history is unchanged by idempotent retries.
  const records = await registry.listPromotionRecords();
  assert.equal(records.length, 2);
});

test("rollback requires a prior promotion of the SAME candidate: drafts and rejected candidates are typed refusals", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:draft", 1) });
  await assert.rejects(
    registry.rollbackPromotion({ organizationId: "org:draft", version: 1 }),
    (error: unknown) =>
      error instanceof OrganizationDecisionError && /prior-promotion/.test(error.message),
  );
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  await assert.rejects(
    registry.rollbackPromotion({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) =>
      error instanceof OrganizationDecisionError && /prior-promotion/.test(error.message),
  );
  // Cross-candidate prior promotion does not satisfy the gate.
  await registry.registerDraft({ record: makeOrganization("org:beta", 1) });
  await registry.promote({ organizationId: "org:beta", version: 1 });
  await assert.rejects(
    registry.rollbackPromotion({ organizationId: "org:draft", version: 1 }),
    (error: unknown) => error instanceof OrganizationDecisionError,
  );
});

test("rollbackPromotion is evidence/policy gated (typed refusals) and promote-after-rollback is immutable", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({
    record: makeOrganization("org:alpha", 1, { evidence: [] }),
  });
  await registry.promote({ organizationId: "org:alpha", version: 1, evidence: ["ev:input"] });
  await assert.rejects(
    registry.rollbackPromotion({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) =>
      error instanceof OrganizationDecisionError && /evidence-present/.test(error.message),
  );
  // Re-promotion after rollback must not silently re-grant the promotion.
  await registry.rollbackPromotion({
    organizationId: "org:alpha",
    version: 1,
    evidence: ["ev:rollback-reason"],
  });
  await assert.rejects(
    registry.promote({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
});

test("rolling back an unknown version is a typed error", async () => {
  const registry = makeRegistry();
  await assert.rejects(
    registry.rollbackPromotion({ organizationId: "org:ghost", version: 1 }),
    (error: unknown) => error instanceof OrganizationVersionNotFoundError,
  );
});

test("listPromotionRecords surfaces the full decision ledger in deterministic store order", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.registerDraft({ record: makeOrganization("org:beta", 1) });
  await registry.registerDraft({ record: makeOrganization("org:beta", 2) });
  await registry.promote({ organizationId: "org:beta", version: 1 });
  await registry.rejectCandidate({ organizationId: "org:alpha", version: 1 });
  await registry.rollbackPromotion({ organizationId: "org:beta", version: 1 });
  const records = await registry.listPromotionRecords();
  assert.deepEqual(
    records.map((record: PromotionRecord) => [record.promotionId, record.candidateId, record.decision]),
    [
      ["rejection:org:alpha:1", "org:alpha:1", "rejected"],
      ["promotion:org:beta:1", "org:beta:1", "promoted"],
      ["rollback:org:beta:1", "org:beta:1", "rolled-back"],
    ],
  );
  // Undecided drafts (org:beta v2) contribute nothing; determinism.
  assert.deepEqual(await registry.listPromotionRecords(), records);
});

test("the resolver selects promoted-only candidates after mixed decisions (rollback retracts, rejection never selects)", async () => {
  const registry = makeRegistry();
  const resolver = makeResolverFixture(registry);
  const intent = {
    goal: "produce a tactical replay",
    constraints: [],
    artifactRequirements: ["reel"],
    learningPolicy: { scopes: [], requireConsent: true },
    policy: makeOrganization("org:x", 1).policy,
  };
  const context = {
    intent,
    workGraph: {
      workGraphId: "wg:fixture",
      intent,
      nodes: [],
      createdAt: NOW,
      updatedAt: NOW,
      status: "open" as const,
    },
    environmentProfile: "local",
    constraints: [],
  };
  await registry.registerDraft({ record: makeOrganization("org:live", 1) });
  await registry.registerDraft({ record: makeOrganization("org:dead", 1) });
  await registry.registerDraft({ record: makeOrganization("org:retired", 1) });
  await registry.promote({ organizationId: "org:live", version: 1 });
  await registry.promote({ organizationId: "org:retired", version: 1 });
  await registry.rejectCandidate({ organizationId: "org:dead", version: 1 });
  await registry.rollbackPromotion({ organizationId: "org:retired", version: 1 });
  const selection = await resolver.resolve(context);
  assert.deepEqual(
    selection.candidates.map((candidate) => candidate.organization.organizationId),
    ["org:live"],
  );
});
