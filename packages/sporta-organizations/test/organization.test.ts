import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryOrganizationStore,
  InMemoryUserPreferenceStore,
  OrganizationDraftConflictError,
  OrganizationImmutableError,
  OrganizationPromotionError,
  OrganizationRegistryService,
  OrganizationResolutionError,
  OrganizationResolverService,
  OrganizationUserPreference,
  OrganizationVersionMonotonicError,
  OrganizationVersionNotFoundError,
  UserPreferenceService,
} from "../src/contract.js";
import type {
  OrganizationSelectionContext,
  OrganizationVersionRecord,
  WorkGraphRecord,
} from "@sporta/contracts/contract";
import type { IntentSpec } from "@sporta/contracts/contract";

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
    evidence: ["ev:1", "ev:2", "ev:3"],
    policy: makeIntent("goal").policy,
    ...overrides,
  };
}

function makeWorkGraph(): WorkGraphRecord {
  return {
    workGraphId: "wg:fixture",
    intent: makeIntent("produce a tactical replay"),
    nodes: [],
    createdAt: NOW,
    updatedAt: NOW,
    status: "open",
  };
}

function makeContext(
  overrides: Partial<OrganizationSelectionContext> = {},
): OrganizationSelectionContext {
  return {
    intent: makeIntent("produce a tactical replay"),
    workGraph: makeWorkGraph(),
    environmentProfile: "local",
    constraints: [],
    ...overrides,
  };
}

function makeRegistry(): OrganizationRegistryService {
  return new OrganizationRegistryService({ store: new InMemoryOrganizationStore(), now });
}

test("registerDraft registers v1 and readVersion returns it", async () => {
  const registry = makeRegistry();
  const record = makeOrganization("org:alpha", 1);
  const registered = await registry.registerDraft({ record });
  assert.deepEqual(registered, record);
  assert.deepEqual(await registry.readVersion("org:alpha", 1), record);
  assert.equal(await registry.readVersion("org:alpha", 9), null);
});

test("registerDraft is idempotent: identical retry returns the same record, no duplicate", async () => {
  const registry = makeRegistry();
  const record = makeOrganization("org:alpha", 1);
  const first = await registry.registerDraft({ record });
  const retry = await registry.registerDraft({ record });
  assert.deepEqual(retry, first);
  const catalog = await registry.listVersions();
  assert.equal(catalog.length, 1);
});

test("version numbers are contiguous-monotonic per organizationId", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.registerDraft({ record: makeOrganization("org:alpha", 2) });
  await assert.rejects(
    registry.registerDraft({ record: makeOrganization("org:alpha", 4) }),
    (error: unknown) => error instanceof OrganizationVersionMonotonicError,
  );
  await assert.rejects(
    registry.registerDraft({ record: makeOrganization("org:beta", 2) }),
    (error: unknown) => error instanceof OrganizationVersionMonotonicError,
  );
});

test("registering an existing draft with different content is a typed conflict", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await assert.rejects(
    registry.registerDraft({
      record: makeOrganization("org:alpha", 1, { intentProfile: "different" }),
    }),
    (error: unknown) => error instanceof OrganizationDraftConflictError,
  );
});

test("promotion is gated: refuses a draft without evidence or policy", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({
    record: makeOrganization("org:alpha", 1, { evidence: [] }),
  });
  await assert.rejects(
    registry.promote({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) => error instanceof OrganizationPromotionError,
  );
});

test("promote marks the version promoted and is idempotent for identical evidence", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  const promotion = await registry.promote({ organizationId: "org:alpha", version: 1 });
  assert.equal(promotion.decision, "promoted");
  assert.equal(promotion.candidateId, "org:alpha:1");
  assert.ok(promotion.gates.every((gate) => gate.passed));
  const retry = await registry.promote({ organizationId: "org:alpha", version: 1 });
  assert.deepEqual(retry, promotion);
  const catalog = await registry.listVersions();
  assert.equal(catalog[0]?.promoted, true);
});

test("promoting an unknown version is a typed error", async () => {
  const registry = makeRegistry();
  await assert.rejects(
    registry.promote({ organizationId: "org:alpha", version: 1 }),
    (error: unknown) => error instanceof OrganizationVersionNotFoundError,
  );
});

test("PROMOTION MAKES THE VERSION IMMUTABLE: mutation attempt is a typed error", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.promote({ organizationId: "org:alpha", version: 1 });
  await assert.rejects(
    registry.registerDraft({
      record: makeOrganization("org:alpha", 1, { intentProfile: "mutated" }),
    }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
  await assert.rejects(
    registry.promote({
      organizationId: "org:alpha",
      version: 1,
      evidence: ["ev:other"],
    }),
    (error: unknown) => error instanceof OrganizationImmutableError,
  );
});

test("promotion evidence can come from the input when the record has none", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({
    record: makeOrganization("org:alpha", 1, { evidence: [] }),
  });
  const promotion = await registry.promote({
    organizationId: "org:alpha",
    version: 1,
    evidence: ["ev:input"],
  });
  assert.deepEqual(promotion.evidence, ["ev:input"]);
});

test("listVersions is sorted and deterministic", async () => {
  const registry = makeRegistry();
  await registry.registerDraft({ record: makeOrganization("org:beta", 1) });
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.registerDraft({ record: makeOrganization("org:alpha", 2) });
  const catalog = await registry.listVersions();
  assert.deepEqual(
    catalog.map((entry) => `${entry.record.organizationId}#${entry.record.version}`),
    ["org:alpha#1", "org:alpha#2", "org:beta#1"],
  );
  assert.deepEqual(await registry.listVersions(), catalog);
});

function makeResolverFixture() {
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now,
  });
  const preferences = new UserPreferenceService({
    store: new InMemoryUserPreferenceStore(),
    now,
  });
  const resolver = new OrganizationResolverService({ catalog: registry, preferences });
  return { registry, preferences, resolver };
}

test("resolution is deterministic: equal context twice -> deep-equal selection", async () => {
  const { registry, resolver } = makeResolverFixture();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await registry.registerDraft({ record: makeOrganization("org:beta", 1) });
  await registry.promote({ organizationId: "org:alpha", version: 1 });
  await registry.promote({ organizationId: "org:beta", version: 1 });
  const context = makeContext();
  const first = await resolver.resolve(context);
  const second = await resolver.resolve(context);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test("resolution ranks multiple candidates and explains the winner with weighted factors", async () => {
  const { registry, resolver } = makeResolverFixture();
  await registry.registerDraft({
    record: makeOrganization("org:weak", 1, { intentProfile: "unrelated" }),
  });
  await registry.registerDraft({
    record: makeOrganization("org:strong", 1, { intentProfile: "tactical replay production" }),
  });
  await registry.promote({ organizationId: "org:weak", version: 1 });
  await registry.promote({ organizationId: "org:strong", version: 1 });
  const selection = await resolver.resolve(makeContext());
  assert.equal(selection.candidates.length, 2);
  assert.equal(selection.selected.organization.organizationId, "org:strong");
  assert.equal(
    selection.selected.organization.organizationId,
    selection.candidates[0]?.organization.organizationId,
  );
  assert.ok(selection.explanation.length >= 4);
  assert.ok(selection.explanation.every((factor) => factor.weight > 0 && factor.detail.length > 0));
  assert.ok(selection.explanation.some((factor) => factor.factor === "environment-match"));
  const environmentFactor = selection.explanation.find(
    (factor) => factor.factor === "environment-match",
  );
  assert.equal(environmentFactor?.weight, 0.3);
});

test("resolution without promoted candidates is a typed error", async () => {
  const { registry, resolver } = makeResolverFixture();
  await registry.registerDraft({ record: makeOrganization("org:alpha", 1) });
  await assert.rejects(
    resolver.resolve(makeContext()),
    (error: unknown) => error instanceof OrganizationResolutionError,
  );
});

test("environment mismatch scores zero and can lose the ranking", async () => {
  const { registry, resolver } = makeResolverFixture();
  await registry.registerDraft({
    record: makeOrganization("org:cloud", 1, { environmentProfile: "cloud" }),
  });
  await registry.registerDraft({ record: makeOrganization("org:local", 1) });
  await registry.promote({ organizationId: "org:cloud", version: 1 });
  await registry.promote({ organizationId: "org:local", version: 1 });
  const selection = await resolver.resolve(makeContext());
  assert.equal(selection.selected.organization.organizationId, "org:local");
});

test("PERSONALIZATION ISOLATION: user A's preference flips only A's selection, never B's", async () => {
  const { registry, preferences, resolver } = makeResolverFixture();
  // Base factors favor org:beta (richer intent profile overlap).
  await registry.registerDraft({
    record: makeOrganization("org:alpha", 1, { intentProfile: "replay" }),
  });
  await registry.registerDraft({
    record: makeOrganization("org:beta", 1, { intentProfile: "tactical replay production" }),
  });
  await registry.promote({ organizationId: "org:alpha", version: 1 });
  await registry.promote({ organizationId: "org:beta", version: 1 });

  const contextFor = (userRef: string): OrganizationSelectionContext => makeContext({ userRef });

  // Baseline (both users, no preferences): org:beta wins for both.
  const aliceBefore = await resolver.resolve(contextFor("user:alice"));
  const bobBefore = await resolver.resolve(contextFor("user:bob"));
  assert.equal(aliceBefore.selected.organization.organizationId, "org:beta");
  assert.equal(bobBefore.selected.organization.organizationId, "org:beta");

  // Alice prefers org:alpha; the preference factor flips only her selection.
  const stored: OrganizationUserPreference = await preferences.setPreference({
    userRef: "user:alice",
    preferredOrganizationId: "org:alpha",
  });
  assert.equal(stored.userRef, "user:alice");
  const aliceAfter = await resolver.resolve(contextFor("user:alice"));
  assert.equal(aliceAfter.selected.organization.organizationId, "org:alpha");
  assert.ok(aliceAfter.explanation.some((factor) => factor.factor === "preference-fit"));

  // Bob's selection is byte-identical to before: A's preference never leaks.
  const bobAfter = await resolver.resolve(contextFor("user:bob"));
  assert.deepEqual(bobAfter, bobBefore);
  assert.ok(!bobAfter.explanation.some((factor) => factor.factor === "preference-fit"));
  assert.equal(JSON.stringify(bobAfter), JSON.stringify(bobBefore));
});

test("setPreference is idempotent per userRef and getPreference is scoped", async () => {
  const preferences = new UserPreferenceService({
    store: new InMemoryUserPreferenceStore(),
    now,
  });
  assert.equal(await preferences.getPreference("user:alice"), null);
  const first = await preferences.setPreference({
    userRef: "user:alice",
    preferredOrganizationId: "org:alpha",
  });
  const retry = await preferences.setPreference({
    userRef: "user:alice",
    preferredOrganizationId: "org:alpha",
  });
  assert.deepEqual(retry, first);
  assert.equal(await preferences.getPreference("user:bob"), null);
  const updated = await preferences.setPreference({
    userRef: "user:alice",
    preferredOrganizationId: "org:beta",
  });
  assert.equal(updated.preferredOrganizationId, "org:beta");
  assert.equal(
    (await preferences.getPreference("user:alice"))?.preferredOrganizationId,
    "org:beta",
  );
});
