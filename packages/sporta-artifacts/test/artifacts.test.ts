import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ArtifactBlobNotFoundError,
  ArtifactError,
  ArtifactGraphService,
  ArtifactIntegrityError,
  FixedClock,
  InMemoryArtifactBlobStore,
  LineageIntegrityError,
  UnknownArtifactError,
  sha256Content,
} from "../src/contract.js";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";

const policy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:test",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

function fixtureGraph(): ArtifactGraphService {
  return new ArtifactGraphService(new FixedClock("2026-02-01T00:00:00.000Z"));
}

test("recordArtifact is idempotent per artifactId (first write wins)", async () => {
  const graph = fixtureGraph();
  const first = await graph.recordArtifact({
    artifactId: "art:t1",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const retry = await graph.recordArtifact({
    artifactId: "art:t1",
    kind: "changed-kind-on-retry",
    editability: "opaque",
    policy,
  });
  assert.deepEqual(retry, first);
  assert.equal(first.kind, "tactical-board-video");
});

test("recordArtifact mints distinct ids when no artifactId is given", async () => {
  const graph = fixtureGraph();
  const a = await graph.recordArtifact({ kind: "k", editability: "editable", policy });
  const b = await graph.recordArtifact({ kind: "k", editability: "editable", policy });
  assert.notEqual(a.artifactId, b.artifactId);
});

test("commitRevision retry returns the SAME revision and never duplicates", async () => {
  const graph = fixtureGraph();
  await graph.recordArtifact({ artifactId: "art:t2", kind: "k", editability: "editable", policy });
  const first = await graph.commitRevision({
    artifactId: "art:t2",
    revisionId: "rev:t2-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: ["tool@1"],
    provenance,
    policy,
  });
  const retry = await graph.commitRevision({
    artifactId: "art:t2",
    revisionId: "rev:t2-1",
    contentHash: "ff" + "00".repeat(31), // different payload on retry
    toolVersions: ["tool@2"],
    provenance,
    policy,
  });
  assert.deepEqual(retry, first);
  assert.equal((await graph.lineage("art:t2")).length, 1);
});

test("commitRevision refuses an unknown artifact (typed)", async () => {
  const graph = fixtureGraph();
  await assert.rejects(
    () =>
      graph.commitRevision({
        artifactId: "art:missing",
        contentHash: "ab" + "00".repeat(31),
        toolVersions: [],
        provenance,
        policy,
      }),
    (error: unknown) => error instanceof UnknownArtifactError,
  );
});

test("parent-chain integrity: unknown parent is refused", async () => {
  const graph = fixtureGraph();
  await graph.recordArtifact({ artifactId: "art:t3", kind: "k", editability: "editable", policy });
  await assert.rejects(
    () =>
      graph.commitRevision({
        artifactId: "art:t3",
        parentRevisionId: "rev:does-not-exist",
        contentHash: "ab" + "00".repeat(31),
        toolVersions: [],
        provenance,
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof LineageIntegrityError);
      assert.equal(error.reason, "parent-not-found");
      return true;
    },
  );
  assert.equal((await graph.lineage("art:t3")).length, 0); // failed commit left no trace
});

test("parent-chain integrity: parent of a foreign artifact is refused", async () => {
  const graph = fixtureGraph();
  await graph.recordArtifact({ artifactId: "art:t4a", kind: "k", editability: "editable", policy });
  await graph.recordArtifact({ artifactId: "art:t4b", kind: "k", editability: "editable", policy });
  await graph.commitRevision({
    artifactId: "art:t4a",
    revisionId: "rev:t4a-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  await assert.rejects(
    () =>
      graph.commitRevision({
        artifactId: "art:t4b",
        revisionId: "rev:t4b-1",
        parentRevisionId: "rev:t4a-1",
        contentHash: "cd" + "00".repeat(31),
        toolVersions: [],
        provenance,
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof LineageIntegrityError);
      assert.equal(error.reason, "parent-foreign-artifact");
      return true;
    },
  );
});

test("parent-chain integrity: non-first revision without parent is refused", async () => {
  const graph = fixtureGraph();
  await graph.recordArtifact({ artifactId: "art:t5", kind: "k", editability: "editable", policy });
  await graph.commitRevision({
    artifactId: "art:t5",
    revisionId: "rev:t5-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  await assert.rejects(
    () =>
      graph.commitRevision({
        artifactId: "art:t5",
        revisionId: "rev:t5-2",
        contentHash: "cd" + "00".repeat(31),
        toolVersions: [],
        provenance,
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof LineageIntegrityError);
      assert.equal(error.reason, "artifact-has-revisions");
      return true;
    },
  );
});

test("parent-chain integrity: lineage forks are refused (chain, not tree)", async () => {
  const graph = fixtureGraph();
  await graph.recordArtifact({ artifactId: "art:t6", kind: "k", editability: "editable", policy });
  await graph.commitRevision({
    artifactId: "art:t6",
    revisionId: "rev:t6-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  await graph.commitRevision({
    artifactId: "art:t6",
    revisionId: "rev:t6-2",
    parentRevisionId: "rev:t6-1",
    contentHash: "cd" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  await assert.rejects(
    () =>
      graph.commitRevision({
        artifactId: "art:t6",
        revisionId: "rev:t6-3",
        parentRevisionId: "rev:t6-1", // second child of the same parent
        contentHash: "ef" + "00".repeat(31),
        toolVersions: [],
        provenance,
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof LineageIntegrityError);
      assert.equal(error.reason, "parent-already-has-child");
      return true;
    },
  );
});

test("lineage returns revisions in chain order across three revisions", async () => {
  const graph = fixtureGraph();
  await graph.recordArtifact({ artifactId: "art:t7", kind: "k", editability: "editable", policy });
  const r1 = await graph.commitRevision({
    artifactId: "art:t7",
    revisionId: "rev:t7-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  const r2 = await graph.commitRevision({
    artifactId: "art:t7",
    revisionId: "rev:t7-2",
    parentRevisionId: "rev:t7-1",
    contentHash: "cd" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  const r3 = await graph.commitRevision({
    artifactId: "art:t7",
    revisionId: "rev:t7-3",
    parentRevisionId: "rev:t7-2",
    contentHash: "ef" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  const lineage = await graph.lineage("art:t7");
  assert.deepEqual(
    lineage.map((revision) => revision.revisionId),
    ["rev:t7-1", "rev:t7-2", "rev:t7-3"],
  );
  assert.deepEqual(lineage, [r1, r2, r3]);
  // history is preserved: the old revision is still readable
  assert.deepEqual(await graph.readRevision("rev:t7-1"), r1);
  assert.equal(await graph.readRevision("rev:nope"), null);
  assert.deepEqual(await graph.lineage("art:unknown"), []);
});

test("committedAt comes from the injected clock", async () => {
  const clock = new FixedClock("2026-03-01T12:00:00.000Z");
  const graph = new ArtifactGraphService(clock);
  await graph.recordArtifact({ artifactId: "art:t8", kind: "k", editability: "editable", policy });
  await graph.commitRevision({
    artifactId: "art:t8",
    revisionId: "rev:t8-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  assert.equal(graph.committedAt("rev:t8-1"), "2026-03-01T12:00:00.000Z");
  clock.advance(5_000);
  await graph.commitRevision({
    artifactId: "art:t8",
    revisionId: "rev:t8-2",
    parentRevisionId: "rev:t8-1",
    contentHash: "cd" + "00".repeat(31),
    toolVersions: [],
    provenance,
    policy,
  });
  assert.equal(graph.committedAt("rev:t8-2"), "2026-03-01T12:00:05.000Z");
});

test("blob store: content-addressed put/read round-trip", async () => {
  const blobs = new InMemoryArtifactBlobStore();
  const content = new TextEncoder().encode("hello sporta");
  const contentHash = await blobs.put(content);
  assert.equal(contentHash, sha256Content(content));
  assert.deepEqual(await blobs.read(contentHash), content);
  // dedup: same bytes map to the same address
  assert.equal(await blobs.put(new TextEncoder().encode("hello sporta")), contentHash);
});

test("blob store: missing blob is a typed not-found error", async () => {
  const blobs = new InMemoryArtifactBlobStore();
  await assert.rejects(
    () => blobs.read("ee" + "00".repeat(31)),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactBlobNotFoundError);
      assert.ok(error instanceof ArtifactError);
      return true;
    },
  );
});

test("blob store: corrupted content fails the read-time integrity check (typed, no silent pass)", async () => {
  const blobs = new InMemoryArtifactBlobStore();
  const good = new TextEncoder().encode("canonical bytes");
  const contentHash = await blobs.put(good);
  // fixture persistence seam: an external process persisted different bytes
  // under the same content address (simulated tampering/corruption)
  await blobs.restore(contentHash, new TextEncoder().encode("tampered bytes"));
  await assert.rejects(
    () => blobs.read(contentHash),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactIntegrityError);
      assert.ok(error instanceof ArtifactError);
      assert.match(error.detail, /^integrity:/);
      return true;
    },
  );
});

test("blob store: a put colliding with different stored bytes is refused", async () => {
  const blobs = new InMemoryArtifactBlobStore();
  const good = new TextEncoder().encode("first");
  const contentHash = await blobs.put(good);
  await blobs.restore(contentHash, new TextEncoder().encode("other"));
  await assert.rejects(
    () => blobs.put(good),
    (error: unknown) => error instanceof ArtifactIntegrityError,
  );
});
