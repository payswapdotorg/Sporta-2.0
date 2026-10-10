import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTIFACT_LINEAGE_DEFAULT_LIMIT,
  ARTIFACT_LINEAGE_MAX_LIMIT,
  ArtifactGatedReadService,
  ArtifactReadQueryError,
  ArtifactReadUnavailableError,
  ArtifactRetentionExpiredError,
  ArtifactRightsRefusalError,
  ArtifactGraphService,
  FixedClock,
  InMemoryArtifactBlobStore,
  artifactRetentionExpired,
  artifactVisibleToUsage,
  resolveArtifactLineageLimit,
  sha256Content,
} from "../src/contract.js";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { ArtifactGatedReadDeps } from "../src/contract.js";

/**
 * W4B-1 — the artifact-plane rights/retention read gate (invariant 22;
 * ADR: docs/architecture/adr-wave4-c6-host.md, decisions 1+2). The gate
 * law itself is unit-tested on the pure functions; the gated read
 * surfaces (direct reads → typed refusals; lineage listing → honest
 * absence) are exercised over the in-memory graph (fixture-grade
 * single-owner state — the REAL durable FS lane is proven in
 * rightsReadGateFs.integration.test.ts). The frozen v1 port surfaces
 * are proven UNCHANGED (the additive law).
 */

const now = "2026-06-01T00:00:00.000Z";

const policy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const renderOnlyPolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const editOnlyPolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const renderProhibitedPolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["edit"], prohibitions: ["render"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const deriveProhibitedPolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["render", "edit"], prohibitions: ["derive"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const purgedPastPolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "purge", retainUntil: "2026-05-01T00:00:00.000Z" },
};

const purgedFuturePolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "purge", retainUntil: "2027-01-01T00:00:00.000Z" },
};

const archivedPastPolicy: PolicySet = {
  rights: { holders: ["holder:gate"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "archive", retainUntil: "2026-01-01T00:00:00.000Z" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:gate",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

function fixtureWiring(): {
  graph: ArtifactGraphService;
  reads: ArtifactGatedReadService;
  blobs: InMemoryArtifactBlobStore;
} {
  const graph = new ArtifactGraphService(new FixedClock("2026-06-01T00:00:00.000Z"));
  const blobs = new InMemoryArtifactBlobStore();
  const deps: ArtifactGatedReadDeps = {
    graph,
    blobs,
    clock: new FixedClock(now),
  };
  return { graph, reads: new ArtifactGatedReadService(deps), blobs };
}

async function seedArtifact(
  graph: ArtifactGraphService,
  artifactId: string,
  artifactPolicy: PolicySet,
): Promise<void> {
  await graph.recordArtifact({
    artifactId,
    kind: "tactical-board-video",
    editability: "editable",
    policy: artifactPolicy,
  });
}

async function seedRevision(
  graph: ArtifactGraphService,
  artifactId: string,
  revisionId: string,
  revisionPolicy: PolicySet,
  parentRevisionId?: string,
): Promise<string> {
  const revision = await graph.commitRevision({
    artifactId,
    revisionId,
    ...(parentRevisionId !== undefined ? { parentRevisionId } : {}),
    contentHash: sha256Content(new TextEncoder().encode(revisionId)),
    toolVersions: ["sporta-render@0"],
    provenance,
    policy: revisionPolicy,
  });
  return revision.revisionId;
}

test("artifactVisibleToUsage: the pure invariant-22 gate law (mirrors sessionVisibleToUsage)", () => {
  const rights = { holders: ["h"], usages: ["render", "edit"], prohibitions: ["derive"] };
  assert.equal(artifactVisibleToUsage(rights, { usages: ["render"] }), true);
  assert.equal(artifactVisibleToUsage(rights, { usages: ["edit"] }), true);
  assert.equal(artifactVisibleToUsage(rights, { usages: ["render", "edit"] }), true);
  assert.equal(artifactVisibleToUsage(rights, { usages: ["derive"] }), false); // prohibited
  assert.equal(artifactVisibleToUsage(rights, { usages: ["render", "derive"] }), false); // any prohibition hides
  assert.equal(artifactVisibleToUsage(rights, { usages: ["compute"] }), false); // not permitted
  assert.equal(artifactVisibleToUsage(rights, { usages: [] }), false); // fail-closed
  assert.equal(artifactVisibleToUsage(rights, undefined), false); // fail-closed
  // an empty rights scope permits nothing (fail-closed on the record side too)
  const empty = { holders: [], usages: [], prohibitions: [] };
  assert.equal(artifactVisibleToUsage(empty, { usages: ["render"] }), false);
});

test("artifactRetentionExpired: typed exactly by the @sporta/policy vocabulary", () => {
  // retain and archive never expire at the read boundary — the policy
  // vocabulary types no read refusal for them.
  assert.equal(artifactRetentionExpired({ disposition: "retain" }, now), false);
  assert.equal(
    artifactRetentionExpired(
      { disposition: "archive", retainUntil: "2026-01-01T00:00:00.000Z" },
      now,
    ),
    false,
  );
  // purge applies strictly AFTER retainUntil: past ⇒ expired, future ⇒ not yet.
  assert.equal(
    artifactRetentionExpired(
      { disposition: "purge", retainUntil: "2026-05-01T00:00:00.000Z" },
      now,
    ),
    true,
  );
  assert.equal(
    artifactRetentionExpired(
      { disposition: "purge", retainUntil: "2027-01-01T00:00:00.000Z" },
      now,
    ),
    false,
  );
  // at the exact boundary instant the disposition has not yet applied.
  assert.equal(artifactRetentionExpired({ disposition: "purge", retainUntil: now }, now), false);
  // fail-closed: a purge decision with no affirmable deferral date is
  // already effective — the seam must not resurrect purged content on
  // a technicality.
  assert.equal(artifactRetentionExpired({ disposition: "purge" }, now), true);
  assert.equal(
    artifactRetentionExpired({ disposition: "purge", retainUntil: "not-a-date" }, now),
    true,
  );
  // retainRuns is carried but NOT evaluated (no run ledger at this
  // plane — typed in NEXT DEPENDENCIES; this assertion pins that it
  // changes nothing on its own).
  assert.equal(artifactRetentionExpired({ disposition: "retain", retainRuns: 3 }, now), false);
  assert.equal(
    artifactRetentionExpired(
      { disposition: "purge", retainUntil: "2027-01-01T00:00:00.000Z", retainRuns: 3 },
      now,
    ),
    false,
  );
});

test("resolveArtifactLineageLimit: default 50, cap 500, malformed refused typed", () => {
  assert.equal(resolveArtifactLineageLimit(undefined), ARTIFACT_LINEAGE_DEFAULT_LIMIT);
  assert.equal(resolveArtifactLineageLimit(500), 500);
  assert.equal(resolveArtifactLineageLimit(10_000), ARTIFACT_LINEAGE_MAX_LIMIT);
  for (const malformed of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => resolveArtifactLineageLimit(malformed),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactReadQueryError);
        assert.equal((error as ArtifactReadQueryError).detail, `read-query:${String(malformed)}`);
        return true;
      },
      `expected typed refusal for limit ${malformed}`,
    );
  }
});

test("gated readRevision: permitted usage reads; prohibited/bare usage refuses typed; unknown is honest null", async () => {
  const { graph, reads } = fixtureWiring();
  await seedArtifact(graph, "art:gate", policy);
  const revisionId = await seedRevision(graph, "art:gate", "rev:gate-1", policy);

  // permitted caller reads the record verbatim
  const render = await reads.readRevision({ revisionId, usage: { usages: ["render"] } });
  assert.ok(render !== null);
  assert.equal(render.revisionId, revisionId);
  assert.deepEqual(render.policy, policy);

  // a caller hitting a PROHIBITION is a typed refusal (direct read — never silent)
  await assert.rejects(
    () => reads.readRevision({ revisionId, usage: { usages: ["derive"] } }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactRightsRefusalError);
      assert.equal((error as ArtifactRightsRefusalError).target, "revision");
      assert.equal((error as ArtifactRightsRefusalError).targetId, revisionId);
      assert.match((error as ArtifactRightsRefusalError).detail, /^rights-refused:revision:/);
      return true;
    },
  );
  // mixed context is judged as a whole on a PROHIBITING record: a
  // render+derive caller is hidden even though render alone is permitted
  // (the derive prohibition wins).
  const sealed = await seedRevision(
    graph,
    "art:gate",
    "rev:gate-2",
    deriveProhibitedPolicy,
    "rev:gate-1",
  );
  await assert.rejects(
    () => reads.readRevision({ revisionId: sealed, usage: { usages: ["render", "derive"] } }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  // a render-only caller still reads the prohibiting record (render is permitted, not prohibited)
  const sealedRead = await reads.readRevision({
    revisionId: sealed,
    usage: { usages: ["render"] },
  });
  assert.equal(sealedRead?.revisionId, sealed);
  // fail-closed: bare and empty usage contexts refuse a direct read
  await assert.rejects(
    () => reads.readRevision({ revisionId }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  await assert.rejects(
    () => reads.readRevision({ revisionId, usage: { usages: [] } }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  // usage the record simply does not carry (render-only record, edit caller)
  const renderOnly = await seedRevision(
    graph,
    "art:gate",
    "rev:gate-3",
    renderOnlyPolicy,
    "rev:gate-2",
  );
  await assert.rejects(
    () => reads.readRevision({ revisionId: renderOnly, usage: { usages: ["edit"] } }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  // unknown revision id: honest null (not a refusal — the id does not exist)
  assert.equal(
    await reads.readRevision({ revisionId: "rev:nope", usage: { usages: ["render"] } }),
    null,
  );
});

test("gated readRevision: retention-expired revisions refuse typed (purge past its date)", async () => {
  const { graph, reads } = fixtureWiring();
  await seedArtifact(graph, "art:gate", policy);
  const expiredId = await seedRevision(graph, "art:gate", "rev:purged-1", purgedPastPolicy);
  const futurePurgeId = await seedRevision(
    graph,
    "art:gate",
    "rev:purged-2",
    purgedFuturePolicy,
    "rev:purged-1",
  );
  const archivedId = await seedRevision(
    graph,
    "art:gate",
    "rev:archived-1",
    archivedPastPolicy,
    "rev:purged-2",
  );

  // a permitted caller still cannot read purge-expired content
  await assert.rejects(
    () => reads.readRevision({ revisionId: expiredId, usage: { usages: ["render"] } }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactRetentionExpiredError);
      assert.equal((error as ArtifactRetentionExpiredError).target, "revision");
      assert.equal((error as ArtifactRetentionExpiredError).targetId, expiredId);
      assert.match((error as ArtifactRetentionExpiredError).detail, /^retention-expired:revision:/);
      return true;
    },
  );
  // a purge not yet past its date reads normally
  const future = await reads.readRevision({
    revisionId: futurePurgeId,
    usage: { usages: ["render"] },
  });
  assert.equal(future?.revisionId, futurePurgeId);
  // an archived record (even past its archive date) is NOT read-refused
  const archived = await reads.readRevision({
    revisionId: archivedId,
    usage: { usages: ["render"] },
  });
  assert.equal(archived?.revisionId, archivedId);
});

test("gated readArtifact (manifest read): gates on the artifact record's own policy", async () => {
  const { graph, reads } = fixtureWiring();
  await seedArtifact(graph, "art:visible", policy);
  await seedArtifact(graph, "art:sealed", deriveProhibitedPolicy);

  const visible = await reads.readArtifact({
    artifactId: "art:visible",
    usage: { usages: ["render"] },
  });
  assert.ok(visible !== null);
  assert.equal(visible.artifactId, "art:visible");
  assert.deepEqual(visible.policy, policy);

  await assert.rejects(
    () => reads.readArtifact({ artifactId: "art:sealed", usage: { usages: ["derive"] } }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactRightsRefusalError);
      assert.equal((error as ArtifactRightsRefusalError).target, "artifact");
      assert.equal((error as ArtifactRightsRefusalError).targetId, "art:sealed");
      return true;
    },
  );
  // fail-closed bare context; honest null for unknown id
  await assert.rejects(
    () => reads.readArtifact({ artifactId: "art:visible" }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  assert.equal(
    await reads.readArtifact({ artifactId: "art:unknown", usage: { usages: ["render"] } }),
    null,
  );

  // retention also gates the manifest read (purge-past-date artifact)
  await seedArtifact(graph, "art:purged", purgedPastPolicy);
  await assert.rejects(
    () => reads.readArtifact({ artifactId: "art:purged", usage: { usages: ["render"] } }),
    (error: unknown) => error instanceof ArtifactRetentionExpiredError,
  );
});

test("gated readArtifact: an unwired manifest capability is a typed refusal, never a silent pass", async () => {
  // A minimal graph that implements the frozen port WITHOUT the
  // optional wave-4 readArtifact capability (the optional-deps law:
  // minimal implementations keep compiling).
  const graph: ArtifactGatedReadDeps["graph"] = {
    recordArtifact: async (input) => ({
      artifactId: input.artifactId ?? "art:min",
      kind: input.kind,
      editability: input.editability,
      policy: input.policy,
    }),
    commitRevision: async () => {
      throw new Error("not used");
    },
    readRevision: async () => null,
    lineage: async () => [],
  };
  const reads = new ArtifactGatedReadService({ graph, clock: new FixedClock(now) });
  await assert.rejects(
    () => reads.readArtifact({ artifactId: "art:min", usage: { usages: ["render"] } }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactReadUnavailableError);
      assert.equal((error as ArtifactReadUnavailableError).capability, "manifest");
      assert.equal((error as ArtifactReadUnavailableError).detail, "read-unavailable:manifest");
      return true;
    },
  );
});

test("gated lineage: honest absence — prohibited/expired revisions excluded, never an error", async () => {
  const { graph, reads } = fixtureWiring();
  await seedArtifact(graph, "art:chain", policy);
  // r1 render+edit; r2 edit-only (absent for render callers); r3 render-only
  // (absent for edit callers); r4 purge-expired (absent for everyone)
  await seedRevision(graph, "art:chain", "rev:chain-1", policy);
  await seedRevision(graph, "art:chain", "rev:chain-2", editOnlyPolicy, "rev:chain-1");
  await seedRevision(graph, "art:chain", "rev:chain-3", renderOnlyPolicy, "rev:chain-2");
  await seedRevision(graph, "art:chain", "rev:chain-4", purgedPastPolicy, "rev:chain-3");

  // a render caller sees r1 and r3 only (r2 edit-only, r4 purge-expired)
  const render = await reads.lineage({ artifactId: "art:chain", usage: { usages: ["render"] } });
  assert.deepEqual(
    render.map((revision) => revision.revisionId),
    ["rev:chain-1", "rev:chain-3"],
  );
  // the chain-gap tradeoff, honestly visible: r3's parentRevisionId
  // references the EXCLUDED r2 (absence is the only signal).
  assert.equal(render[1]?.parentRevisionId, "rev:chain-2");
  // an edit caller sees r1 and r2 (r3 is render-only; r4 expired)
  const edit = await reads.lineage({ artifactId: "art:chain", usage: { usages: ["edit"] } });
  assert.deepEqual(
    edit.map((revision) => revision.revisionId),
    ["rev:chain-1", "rev:chain-2"],
  );
  // a derive caller is permitted on no revision: [] (honest absence)
  assert.deepEqual(
    await reads.lineage({ artifactId: "art:chain", usage: { usages: ["derive"] } }),
    [],
  );
  // fail-closed: bare and empty usage contexts list nothing; unknown artifact []
  assert.deepEqual(await reads.lineage({ artifactId: "art:chain" }), []);
  assert.deepEqual(await reads.lineage({ artifactId: "art:chain", usage: { usages: [] } }), []);
  assert.deepEqual(
    await reads.lineage({ artifactId: "art:unknown", usage: { usages: ["render"] } }),
    [],
  );
  // malformed limit is a typed query error even on the listing surface
  await assert.rejects(
    () => reads.lineage({ artifactId: "art:chain", usage: { usages: ["render"] }, limit: 0 }),
    (error: unknown) => error instanceof ArtifactReadQueryError,
  );
});

test("gated lineage: bounded — head-anchored window, default 50, explicit limit honored", async () => {
  const { graph, reads } = fixtureWiring();
  await seedArtifact(graph, "art:long", policy);
  let parent: string | undefined;
  for (let index = 1; index <= 55; index += 1) {
    const revisionId = `rev:long-${index}`;
    await graph.commitRevision({
      artifactId: "art:long",
      revisionId,
      ...(parent !== undefined ? { parentRevisionId: parent } : {}),
      contentHash: sha256Content(new TextEncoder().encode(revisionId)),
      toolVersions: [],
      provenance,
      policy,
    });
    parent = revisionId;
  }
  // no limit: the default page (50) of the 55-revision chain, head-anchored
  const defaultPage = await reads.lineage({
    artifactId: "art:long",
    usage: { usages: ["render"] },
  });
  assert.equal(defaultPage.length, ARTIFACT_LINEAGE_DEFAULT_LIMIT);
  assert.equal(defaultPage[0]?.revisionId, "rev:long-6"); // oldest revision on the page
  assert.equal(defaultPage[49]?.revisionId, "rev:long-55"); // the head (newest)
  // explicit smaller limit keeps the newest tail
  const small = await reads.lineage({
    artifactId: "art:long",
    usage: { usages: ["render"] },
    limit: 3,
  });
  assert.deepEqual(
    small.map((revision) => revision.revisionId),
    ["rev:long-53", "rev:long-54", "rev:long-55"],
  );
  // the window then gate: render-prohibited revisions inside the window
  // make the result shorter than the limit (documented tradeoff)
  await graph.commitRevision({
    artifactId: "art:long",
    revisionId: "rev:long-56",
    parentRevisionId: "rev:long-55",
    contentHash: sha256Content(new TextEncoder().encode("rev:long-56")),
    toolVersions: [],
    provenance,
    policy: renderProhibitedPolicy,
  });
  const mixed = await reads.lineage({
    artifactId: "art:long",
    usage: { usages: ["render"] },
    limit: 2,
  });
  assert.deepEqual(
    mixed.map((revision) => revision.revisionId),
    ["rev:long-55"], // rev:long-56 occupies a window slot but is render-prohibited
  );
});

test("gated readRevisionContent: the revision's PolicySet gates the blob read; unwired store refuses typed", async () => {
  const { graph, reads, blobs } = fixtureWiring();
  await seedArtifact(graph, "art:content", policy);
  const content = new TextEncoder().encode("canonical board bytes");
  const contentHash = await blobs.put(content);
  await graph.commitRevision({
    artifactId: "art:content",
    revisionId: "rev:content-1",
    contentHash,
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });

  // permitted caller reads the real bytes back
  const read = await reads.readRevisionContent({
    revisionId: "rev:content-1",
    usage: { usages: ["render"] },
  });
  assert.deepEqual(read, content);
  // prohibited caller: typed refusal (gate precedes the storage touch)
  await assert.rejects(
    () => reads.readRevisionContent({ revisionId: "rev:content-1", usage: { usages: ["derive"] } }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  // bare context fails closed
  await assert.rejects(
    () => reads.readRevisionContent({ revisionId: "rev:content-1" }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  // retention-expired content refuses typed
  await graph.commitRevision({
    artifactId: "art:content",
    revisionId: "rev:content-2",
    parentRevisionId: "rev:content-1",
    contentHash,
    toolVersions: [],
    provenance,
    policy: purgedPastPolicy,
  });
  await assert.rejects(
    () => reads.readRevisionContent({ revisionId: "rev:content-2", usage: { usages: ["render"] } }),
    (error: unknown) => error instanceof ArtifactRetentionExpiredError,
  );
  // unknown revision: honest null
  assert.equal(
    await reads.readRevisionContent({ revisionId: "rev:unknown", usage: { usages: ["render"] } }),
    null,
  );

  // no blob store wired: typed unavailability, never a silent pass
  const bare = new ArtifactGatedReadService({ graph, clock: new FixedClock(now) });
  await assert.rejects(
    () => bare.readRevisionContent({ revisionId: "rev:content-1", usage: { usages: ["render"] } }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactReadUnavailableError);
      assert.equal((error as ArtifactReadUnavailableError).capability, "content");
      assert.equal((error as ArtifactReadUnavailableError).detail, "read-unavailable:content");
      return true;
    },
  );
});

test("the frozen v1 port surfaces behave identically without a usage context (the additive law)", async () => {
  const { graph, blobs } = fixtureWiring();
  await seedArtifact(graph, "art:legacy", deriveProhibitedPolicy);
  const revisionId = await seedRevision(
    graph,
    "art:legacy",
    "rev:legacy-1",
    deriveProhibitedPolicy,
  );
  const content = new TextEncoder().encode("legacy bytes");
  const contentHash = await blobs.put(content);

  // the frozen port reads WITHOUT any usage context — exactly as before
  const revision = await graph.readRevision(revisionId);
  assert.equal(revision?.revisionId, revisionId);
  const lineage = await graph.lineage("art:legacy");
  assert.equal(lineage.length, 1);
  // the blob store reads content-addressed bytes — exactly as before
  assert.deepEqual(await blobs.read(contentHash), content);
  // and the service's additive manifest accessor is unchanged (sync)
  const record = graph.readArtifact("art:legacy");
  assert.equal(record?.artifactId, "art:legacy");
});
