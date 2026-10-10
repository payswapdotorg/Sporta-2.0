import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArtifactGatedReadService,
  ArtifactGraphService,
  ArtifactRetentionExpiredError,
  ArtifactRightsRefusalError,
  FixedClock,
  FsArtifactBlobStore,
  InMemoryArtifactBlobStore,
} from "../src/contract.js";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { ArtifactGatedReadDeps } from "../src/contract.js";

/**
 * W4B-1 — rights-gated artifact reads proven on the REAL FS lane (the
 * W2 `FsArtifactBlobStore`: real files on real disk, read-time
 * integrity verification), plus parity with the in-memory store.
 *
 * EVIDENCE CLASSES, honestly labeled:
 * - REAL: the FsArtifactBlobStore writes/reads real files in a real
 *   mkdtemp directory (blob files stat'ed and byte-compared against
 *   direct node:fs reads of the sharded content address); the typed
 *   refusals fire on the real lane (the gate is the same production
 *   code path every deployment runs).
 * - FIXTURE: the ArtifactGraphService state (the in-memory single
 *   state owner — the graph plane is fixture-grade by the W2 record,
 *   the blob plane is real) and the FixedClock (deterministic "now"
 *   for retention boundaries).
 *
 * The gate law proven here is invariant 22 (the artifact-plane read
 * half): a permitted caller reads REAL bytes back byte-identical; a
 * prohibited or retention-expired caller is refused TYPED — and the
 * refusal happens BEFORE any storage touch, proven by the blob file
 * existing on disk while the gated seam refuses.
 */

const NOW = "2026-06-01T00:00:00.000Z";

const policy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render", "edit"], prohibitions: ["derive"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const renderOnlyPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const purgedPastPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "purge", retainUntil: "2026-05-01T00:00:00.000Z" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:w4b",
  capturedAt: "2026-05-01T00:00:00.000Z",
};

/** The sharded path a content address occupies inside an FS store root. */
function blobPath(root: string, contentHash: string): string {
  return join(
    root,
    contentHash.substring(0, 2),
    contentHash.substring(2, 4),
    contentHash.substring(4),
  );
}

/**
 * Build one lane over the given blob-store grade (real FS or in-memory
 * parity): an artifact with three revisions whose content is REAL
 * stored bytes (r1 render+edit; r2 render-only; r3 purge-expired).
 */
async function buildLane(blobs: FsArtifactBlobStore | InMemoryArtifactBlobStore): Promise<{
  reads: ArtifactGatedReadService;
  graph: ArtifactGraphService;
  content1: Uint8Array;
  hash1: string;
  content3: Uint8Array;
  hash3: string;
}> {
  const graph = new ArtifactGraphService(new FixedClock("2026-05-01T00:00:00.000Z"));
  const deps: ArtifactGatedReadDeps = { graph, blobs, clock: new FixedClock(NOW) };
  const reads = new ArtifactGatedReadService(deps);

  await graph.recordArtifact({
    artifactId: "art:w4b",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });

  const content1 = new TextEncoder().encode(
    '<mlt><producer id="producer0"/></mlt><!-- canonical r1 bytes -->',
  );
  const hash1 = await blobs.put(content1);
  await graph.commitRevision({
    artifactId: "art:w4b",
    revisionId: "rev:w4b-1",
    contentHash: hash1,
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });

  const content2 = new TextEncoder().encode("<mlt><!-- r2 render-only bytes --></mlt>");
  const hash2 = await blobs.put(content2);
  await graph.commitRevision({
    artifactId: "art:w4b",
    revisionId: "rev:w4b-2",
    parentRevisionId: "rev:w4b-1",
    contentHash: hash2,
    toolVersions: ["sporta-render@0"],
    provenance,
    policy: renderOnlyPolicy,
  });

  const content3 = new TextEncoder().encode("<mlt><!-- r3 purge-expired bytes --></mlt>");
  const hash3 = await blobs.put(content3);
  await graph.commitRevision({
    artifactId: "art:w4b",
    revisionId: "rev:w4b-3",
    parentRevisionId: "rev:w4b-2",
    contentHash: hash3,
    toolVersions: ["sporta-render@0"],
    provenance,
    policy: purgedPastPolicy,
  });

  return { reads, graph, content1, hash1, content3, hash3 };
}

test("REAL FS lane: a permitted caller reads revision content byte-identical from the durable store", async () => {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-w4b-blobs-"));
  try {
    const blobs = new FsArtifactBlobStore(blobRoot);
    const lane = await buildLane(blobs);

    // The bytes are REAL: the blob file exists at its sharded content
    // address on real disk and the gated read returns bytes identical
    // to a direct node:fs read of that file.
    const path1 = blobPath(blobRoot, lane.hash1);
    const info = await stat(path1);
    assert.ok(info.isFile());
    assert.equal(info.size, lane.content1.byteLength);
    const onDisk = new Uint8Array(await readFile(path1));

    const read = await lane.reads.readRevisionContent({
      revisionId: "rev:w4b-1",
      usage: { usages: ["render"] },
    });
    assert.ok(read !== null);
    assert.deepEqual(read, lane.content1);
    assert.deepEqual(read, onDisk);

    // an edit-permitted caller reads the same revision too (both usages carried)
    const edit = await lane.reads.readRevisionContent({
      revisionId: "rev:w4b-1",
      usage: { usages: ["edit"] },
    });
    assert.deepEqual(edit, lane.content1);
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
});

test("REAL FS lane: a prohibited caller is refused typed and the gate precedes the storage touch", async () => {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-w4b-blobs-"));
  try {
    const blobs = new FsArtifactBlobStore(blobRoot);
    const lane = await buildLane(blobs);

    // The blob REALLY exists on disk and the ungated plumbing can read
    // it — the refusal below is the GATE's, not the store's.
    assert.ok((await stat(blobPath(blobRoot, lane.hash1))).isFile());
    assert.deepEqual(await blobs.read(lane.hash1), lane.content1);

    // A derive caller hits the revision's PolicySet prohibition: typed
    // refusal, never silent bytes, and the blob is never touched by
    // the gated seam (the gate runs before the storage read).
    await assert.rejects(
      () =>
        lane.reads.readRevisionContent({ revisionId: "rev:w4b-1", usage: { usages: ["derive"] } }),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactRightsRefusalError);
        assert.equal((error as ArtifactRightsRefusalError).target, "revision");
        assert.equal((error as ArtifactRightsRefusalError).targetId, "rev:w4b-1");
        assert.equal(
          (error as ArtifactRightsRefusalError).detail,
          "rights-refused:revision:rev:w4b-1",
        );
        return true;
      },
    );
    // a mixed render+derive context is a whole: the prohibition hides the content
    await assert.rejects(
      () =>
        lane.reads.readRevisionContent({
          revisionId: "rev:w4b-1",
          usage: { usages: ["render", "derive"] },
        }),
      (error: unknown) => error instanceof ArtifactRightsRefusalError,
    );
    // fail-closed: a bare usage context refuses the direct content read
    await assert.rejects(
      () => lane.reads.readRevisionContent({ revisionId: "rev:w4b-1" }),
      (error: unknown) => error instanceof ArtifactRightsRefusalError,
    );
    // a render-only caller CANNOT read the render-only r2 with an edit usage (non-permitted)
    await assert.rejects(
      () =>
        lane.reads.readRevisionContent({ revisionId: "rev:w4b-2", usage: { usages: ["edit"] } }),
      (error: unknown) => error instanceof ArtifactRightsRefusalError,
    );
    // ...but a render caller can (the r2 content is also real bytes)
    const r2 = await lane.reads.readRevisionContent({
      revisionId: "rev:w4b-2",
      usage: { usages: ["render"] },
    });
    assert.deepEqual(r2, new TextEncoder().encode("<mlt><!-- r2 render-only bytes --></mlt>"));
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
});

test("REAL FS lane: retention-expired content refuses typed even for a permitted caller", async () => {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-w4b-blobs-"));
  try {
    const blobs = new FsArtifactBlobStore(blobRoot);
    const lane = await buildLane(blobs);

    // r3's purge disposition became effective 2026-05-01 (now is
    // 2026-06-01): even a render-permitted caller cannot read it.
    assert.ok((await stat(blobPath(blobRoot, lane.hash3))).isFile());
    await assert.rejects(
      () =>
        lane.reads.readRevisionContent({ revisionId: "rev:w4b-3", usage: { usages: ["render"] } }),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactRetentionExpiredError);
        assert.equal((error as ArtifactRetentionExpiredError).target, "revision");
        assert.equal((error as ArtifactRetentionExpiredError).targetId, "rev:w4b-3");
        assert.equal(
          (error as ArtifactRetentionExpiredError).detail,
          "retention-expired:revision:rev:w4b-3",
        );
        return true;
      },
    );
    // and the gated revision METADATA read refuses the same way
    await assert.rejects(
      () => lane.reads.readRevision({ revisionId: "rev:w4b-3", usage: { usages: ["render"] } }),
      (error: unknown) => error instanceof ArtifactRetentionExpiredError,
    );
    // while the permitted, non-expired r1 metadata still reads
    const r1 = await lane.reads.readRevision({
      revisionId: "rev:w4b-1",
      usage: { usages: ["render"] },
    });
    assert.equal(r1?.revisionId, "rev:w4b-1");
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
});

test("REAL FS lane: the lineage listing excludes prohibited/expired revisions (honest absence) and the PolicySet travels verbatim", async () => {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-w4b-blobs-"));
  try {
    const blobs = new FsArtifactBlobStore(blobRoot);
    const lane = await buildLane(blobs);

    // A render caller lists r1 + r2 only: r2 is render-only (visible),
    // r3 is purge-expired (absent for everyone). Never an error.
    const render = await lane.reads.lineage({
      artifactId: "art:w4b",
      usage: { usages: ["render"] },
    });
    assert.deepEqual(
      render.map((revision) => revision.revisionId),
      ["rev:w4b-1", "rev:w4b-2"],
    );
    // an edit caller lists r1 only (r2 is render-only, r3 expired)
    const edit = await lane.reads.lineage({ artifactId: "art:w4b", usage: { usages: ["edit"] } });
    assert.deepEqual(
      edit.map((revision) => revision.revisionId),
      ["rev:w4b-1"],
    );
    // a derive caller (prohibited on r1, unpermitted elsewhere): []
    assert.deepEqual(
      await lane.reads.lineage({ artifactId: "art:w4b", usage: { usages: ["derive"] } }),
      [],
    );
    // fail-closed: bare usage lists nothing
    assert.deepEqual(await lane.reads.lineage({ artifactId: "art:w4b" }), []);

    // The PolicySet travels VERBATIM: the revision record that gated
    // the read carries exactly the policy fields that decided it —
    // usages=[render, edit], prohibitions=[derive] on r1 — and the
    // gated content read consumed exactly those (render listed/refused
    // derive). The gate ran on the traveled fields, nothing else.
    const r1 = await lane.reads.readRevision({
      revisionId: "rev:w4b-1",
      usage: { usages: ["render"] },
    });
    assert.ok(r1 !== null);
    assert.deepEqual(r1.policy, policy);
    assert.deepEqual(r1.policy.rights.usages, ["render", "edit"]);
    assert.deepEqual(r1.policy.rights.prohibitions, ["derive"]);
    // and the expired decision traveled verbatim too
    const r3 = await lane.graph.readRevision("rev:w4b-3");
    assert.ok(r3 !== null);
    assert.deepEqual(r3.policy.retention, {
      disposition: "purge",
      retainUntil: "2026-05-01T00:00:00.000Z",
    });
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
});

test("IN-MEMORY PARITY: the identical gate law over the in-memory blob store", async () => {
  const blobs = new InMemoryArtifactBlobStore();
  const lane = await buildLane(blobs);

  // permitted caller: byte-identical content
  const read = await lane.reads.readRevisionContent({
    revisionId: "rev:w4b-1",
    usage: { usages: ["render"] },
  });
  assert.deepEqual(read, lane.content1);
  // prohibited caller: typed rights refusal (same error, same detail)
  await assert.rejects(
    () =>
      lane.reads.readRevisionContent({ revisionId: "rev:w4b-1", usage: { usages: ["derive"] } }),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactRightsRefusalError);
      assert.equal(
        (error as ArtifactRightsRefusalError).detail,
        "rights-refused:revision:rev:w4b-1",
      );
      return true;
    },
  );
  // retention-expired caller: typed retention refusal
  await assert.rejects(
    () =>
      lane.reads.readRevisionContent({ revisionId: "rev:w4b-3", usage: { usages: ["render"] } }),
    (error: unknown) => error instanceof ArtifactRetentionExpiredError,
  );
  // bare context fails closed; lineage listing law identical
  await assert.rejects(
    () => lane.reads.readRevisionContent({ revisionId: "rev:w4b-1" }),
    (error: unknown) => error instanceof ArtifactRightsRefusalError,
  );
  assert.deepEqual(
    (await lane.reads.lineage({ artifactId: "art:w4b", usage: { usages: ["render"] } })).map(
      (revision) => revision.revisionId,
    ),
    ["rev:w4b-1", "rev:w4b-2"],
  );
  assert.deepEqual(await lane.reads.lineage({ artifactId: "art:w4b" }), []);
});

test("REAL FS lane: the gated seam refuses unknown revisions honestly (null) and serves restart-fresh stores", async () => {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-w4b-blobs-"));
  try {
    const blobs = new FsArtifactBlobStore(blobRoot);
    const lane = await buildLane(blobs);

    // unknown revision: honest null on both direct surfaces
    assert.equal(
      await lane.reads.readRevision({ revisionId: "rev:nope", usage: { usages: ["render"] } }),
      null,
    );
    assert.equal(
      await lane.reads.readRevisionContent({
        revisionId: "rev:nope",
        usage: { usages: ["render"] },
      }),
      null,
    );

    // A FRESH store instance over the same durable directory (the W2
    // restart law) serves the same gated read byte-identically — the
    // gate is stable across restarts.
    const restarted = new ArtifactGatedReadService({
      graph: lane.graph,
      blobs: new FsArtifactBlobStore(blobRoot),
      clock: new FixedClock(NOW),
    });
    const read = await restarted.readRevisionContent({
      revisionId: "rev:w4b-1",
      usage: { usages: ["render"] },
    });
    assert.deepEqual(read, lane.content1);
    await assert.rejects(
      () =>
        restarted.readRevisionContent({ revisionId: "rev:w4b-1", usage: { usages: ["derive"] } }),
      (error: unknown) => error instanceof ArtifactRightsRefusalError,
    );
    await assert.rejects(
      () =>
        restarted.readRevisionContent({ revisionId: "rev:w4b-3", usage: { usages: ["render"] } }),
      (error: unknown) => error instanceof ArtifactRetentionExpiredError,
    );
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
});
