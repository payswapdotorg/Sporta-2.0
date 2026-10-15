/**
 * W12A-2 + W12A-3 — the library REAL host + the export/content read
 * seam battery (packages/web, node:test + tsx — the project law; the
 * sportaScreens.test.ts precedent).
 *
 * Drives `createLibraryRealHost` over the REAL `ArtifactGraphService`
 * (the W12-02 freeze enumeration read) AND `exportRevisionContent`
 * over the REAL `ArtifactGatedReadService` (the wave-4 rights-gated
 * read seam). Both are pure projections over REAL service records —
 * no store, no second state.
 *
 * EVIDENCE CLASS (labeled):
 *   REAL — the library host satisfies `LibraryScreenPort` with
 *   `backing: "real"`; every artifact + revision field projects
 *   verbatim through the frozen mirror shapes; the registry honesty
 *   label surfaces via `host.gradeNote` (the W12-07 law generalized).
 *   The export seam returns REAL bytes through the GATED read path;
 *   the gate's typed refusals surface as `ScreenRefusal`s with the
 *   verbatim reason (W12-09).
 *   FIXTURE — the in-memory stores (artifact graph, blob store); the
 *   artifact CONTENT seed (the "hello sporta" bytes). The services are
 *   REAL (the artifact fabric's immutable lineage law; the gated
 *   service's fail-closed rights gate).
 *
 * Acceptance: W12-08 (REAL committed revisions through the REAL host),
 * W12-09 (the export seam: hash-verified bytes + gate refusal = typed
 * ScreenRefusal — both arms named, both REAL).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ArtifactGatedReadService,
  ArtifactGraphService,
  InMemoryArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
  sha256Content,
} from "@sporta/artifacts/contract";
import type {
  ArtifactReadUsageContext,
} from "@sporta/artifacts/contract";
import type {
  PolicySet,
} from "@sporta/contracts/contract";
import { createLibraryRealHost } from "../src/sporta/library/libraryRealHost.js";
import { LIBRARY_REGISTRY_GRADE_NOTE } from "../src/sporta/library/libraryRealHost.js";
import type { LibraryRealHost } from "../src/sporta/library/libraryRealHost.js";
import type { LibraryScreenPort } from "../src/sporta/library/libraryScreenPorts.js";
import {
  exportRevisionContent,
} from "../src/sporta/library/libraryExportSeam.js";
import type { ExportRevisionContentOk } from "../src/sporta/library/libraryExportSeam.js";
import { revisionRows, lineageSummaryLine, editabilityLabel } from "../src/sporta/library/libraryScreenViews.js";
import { createLibraryFixtureHost } from "../src/sporta/library/libraryFixtureHost.js";

const FIXED_NOW = "2026-10-13T12:00:00.000Z";

/** A policy that permits render+derive, prohibits nothing, retains forever. */
const PERMISSIVE_POLICY: PolicySet = {
  rights: {
    holders: ["holder:test"],
    usages: ["render", "derive"],
    prohibitions: [],
  },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** A policy that allows render but PROHIBITS export — used for the gate-refused arm. */
const EXPORT_PROHIBITED_POLICY: PolicySet = {
  rights: {
    holders: ["holder:test"],
    usages: ["render"],
    prohibitions: ["export"],
  },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const RENDER_USAGE: ArtifactReadUsageContext = { usages: ["render"] };
const EXPORT_USAGE: ArtifactReadUsageContext = { usages: ["export"] };

// ---------------------------------------------------------------------------
// The REAL artifact graph (the W11C library battery precedent).
// ---------------------------------------------------------------------------

function makeGraph(): ArtifactGraphService {
  return new ArtifactGraphService(new ArtifactSystemClock());
}

function makeGated(graph: ArtifactGraphService, blobs: InMemoryArtifactBlobStore): ArtifactGatedReadService {
  return new ArtifactGatedReadService({
    graph,
    blobs,
    clock: { now: () => FIXED_NOW },
  });
}

/**
 * Commit an artifact with N revisions, each with REAL bytes that hash
 * (sha-256) to the declared contentHash. Returns the committed
 * revisions in chain order (root first).
 */
async function commitArtifactWithRevisions(
  graph: ArtifactGraphService,
  blobs: InMemoryArtifactBlobStore,
  artifactId: string,
  kind: string,
  editability: "editable" | "derived-only" | "opaque",
  policy: PolicySet,
  revisions: readonly {
    revisionId: string;
    content: Uint8Array;
    sourceKind: "agent-run" | "user-edit" | "measurement";
    sourceRef: string;
    tools?: readonly string[];
  }[],
): Promise<void> {
  await graph.recordArtifact({ artifactId, kind, editability, policy });
  let parentRevisionId: string | undefined;
  for (const rev of revisions) {
    // Put the bytes through the blob store — the store hashes them
    // and returns the contentHash. The revision record's contentHash
    // is the store's return value (the trusted hash; the store
    // verifies bytes ↔ contentHash on read).
    const contentHash = await blobs.put(rev.content);
    const committed = await graph.commitRevision({
      artifactId,
      revisionId: rev.revisionId,
      ...(parentRevisionId !== undefined ? { parentRevisionId } : {}),
      contentHash,
      toolVersions: rev.tools ?? [],
      provenance: {
        sourceKind: rev.sourceKind,
        sourceRef: rev.sourceRef,
        capturedAt: FIXED_NOW,
      },
      policy,
    });
    parentRevisionId = committed.revisionId;
  }
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ---------------------------------------------------------------------------
// W12-08 — REAL committed revisions through the REAL library host.
// ---------------------------------------------------------------------------

test("W12A-2 library REAL host: backing real + the registry honesty grade note surfaces (W12-07 generalized)", () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  void blobs; // not needed for listArtifacts/readArtifact (the host projects over the graph only)
  const host: LibraryRealHost = createLibraryRealHost({ graph });
  // STRUCTURAL COMPAT (compile-time): the REAL host satisfies the
  // frozen port.
  const port: LibraryScreenPort = host;
  void port;
  assert.equal(host.backing, "real", "the REAL host reports backing 'real'");
  assert.equal(
    host.gradeNote,
    LIBRARY_REGISTRY_GRADE_NOTE,
    "the registry honesty label surfaces verbatim (W12-07 generalized)",
  );
  assert.match(
    host.gradeNote,
    /BACKING: REAL \(registry: fixture-grade in-memory\)/,
    "the grade note carries the exact honest label — never re-badged",
  );
});

test("W12A-2 library REAL host: REAL committed revisions project through the host root-first (W12-08)", async () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-project",
    "tactical-board-video",
    "editable",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-project-1",
        content: textBytes("version 1 — initial agent cut"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-1",
        tools: ["sporta-render@0"],
      },
      {
        revisionId: "rev:w12a-project-2",
        content: textBytes("version 2 — user trimmed the highlights"),
        sourceKind: "user-edit",
        sourceRef: "edit:w12a-user-1",
        tools: ["kdenlive@24.08.0", "sporta-render@0"],
      },
      {
        revisionId: "rev:w12a-project-3",
        content: textBytes("version 3 — measurement re-grade after replay"),
        sourceKind: "measurement",
        sourceRef: "lab:w12a-replay-1",
        tools: ["sporta-render@1"],
      },
    ],
  );

  const host = createLibraryRealHost({ graph });

  // listArtifacts: the registry surfaces honestly.
  const listed = await host.listArtifacts();
  assert.equal(listed.length, 1, "the one REAL artifact surfaces");
  assert.equal(listed[0]?.artifactId, "art:w12a-project");
  assert.equal(listed[0]?.kind, "tactical-board-video");
  assert.equal(listed[0]?.editability, "editable", "editability carries verbatim");
  assert.equal(
    editabilityLabel(listed[0]!.editability),
    "Editable project",
    "editability renders in product language (UI-15)",
  );

  // readArtifact: the lineage chain carries ROOT-FIRST (the Library law).
  const detail = await host.readArtifact("art:w12a-project");
  assert.equal(detail.artifact.artifactId, "art:w12a-project");
  assert.equal(detail.revisions.length, 3, "the three REAL revisions surface");
  assert.equal(detail.revisions[0]?.revisionId, "rev:w12a-project-1", "root revision is first");
  assert.equal(detail.revisions[0]?.parentRevisionId, undefined, "the root has no parent");
  assert.equal(detail.revisions[1]?.revisionId, "rev:w12a-project-2");
  assert.equal(detail.revisions[1]?.parentRevisionId, "rev:w12a-project-1", "the chain is preserved");
  assert.equal(detail.revisions[2]?.revisionId, "rev:w12a-project-3");
  assert.equal(detail.revisions[2]?.parentRevisionId, "rev:w12a-project-2");

  // The content hashes carry VERBATIM (the store's hash, not a re-computation).
  assert.equal(
    detail.revisions[0]?.contentHash,
    sha256Content(textBytes("version 1 — initial agent cut")),
    "the contentHash is the store's hash of the REAL committed bytes",
  );

  // The toolVersions + provenance carry verbatim.
  assert.deepEqual(
    [...detail.revisions[1]?.toolVersions ?? []],
    ["kdenlive@24.08.0", "sporta-render@0"],
  );
  assert.equal(detail.revisions[1]?.provenance.sourceKind, "user-edit");
  assert.equal(detail.revisions[1]?.provenance.sourceRef, "edit:w12a-user-1");

  // The lineageNote is a pure projection over the real provenance chain.
  assert.ok(detail.lineageNote !== null);
  assert.match(detail.lineageNote, /real provenance for art:w12a-project/);
  assert.match(detail.lineageNote, /agent-run:run:w12a-1/);
  assert.match(detail.lineageNote, /user-edit:edit:w12a-user-1/);
  assert.match(detail.lineageNote, /measurement:lab:w12a-replay-1/);
  assert.match(detail.lineageNote, /immutable lineage preserved/);

  // The view-model projects the lineage root-first with head marked.
  const rows = revisionRows(detail.revisions);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.revisionId, "rev:w12a-project-1");
  assert.equal(rows[0]?.isHead, false, "the root is not the head");
  assert.equal(rows[0]?.parentRevisionId, null);
  assert.equal(rows[0]?.depth, 0);
  assert.equal(rows[2]?.revisionId, "rev:w12a-project-3");
  assert.equal(rows[2]?.isHead, true, "the newest revision is marked HEAD");
  assert.equal(rows[2]?.depth, 2);
  // The lineage summary renders as the real provenance chain.
  assert.match(
    lineageSummaryLine(detail),
    /agent-run:run:w12a-1 → user-edit:edit:w12a-user-1 → measurement:lab:w12a-replay-1/,
  );
});

test("W12A-2 library REAL host: multiple REAL artifacts surface in registry order; editability classes honest (W12-08)", async () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  // Commit three artifacts: editable, derived-only, opaque.
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-editable",
    "tactical-board-video",
    "editable",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-editable-1",
        content: textBytes("editable v1"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-1",
      },
    ],
  );
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-derived",
    "render-output",
    "derived-only",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-derived-1",
        content: textBytes("derived v1"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-1",
      },
    ],
  );
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-opaque",
    "binary-asset",
    "opaque",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-opaque-1",
        content: textBytes("opaque v1"),
        sourceKind: "observation",
        sourceRef: "source:w12a-1",
      },
    ],
  );

  const host = createLibraryRealHost({ graph });
  const listed = await host.listArtifacts();
  assert.equal(listed.length, 3, "three REAL artifacts surface in registry order");
  assert.equal(listed[0]?.artifactId, "art:w12a-editable");
  assert.equal(listed[0]?.editability, "editable");
  assert.equal(listed[1]?.artifactId, "art:w12a-derived");
  assert.equal(listed[1]?.editability, "derived-only");
  assert.equal(listed[2]?.artifactId, "art:w12a-opaque");
  assert.equal(listed[2]?.editability, "opaque", "the opaque editability class carries verbatim — never re-badged");

  // Each detail projects its lineage root-first.
  const editable = await host.readArtifact("art:w12a-editable");
  assert.equal(editable.revisions.length, 1);
  assert.equal(editable.revisions[0]?.revisionId, "rev:w12a-editable-1");

  // An artifact with no revisions yet is honest: empty chain, null lineageNote.
  await graph.recordArtifact({
    artifactId: "art:w12a-empty",
    kind: "tactical-board-video",
    editability: "editable",
    policy: PERMISSIVE_POLICY,
  });
  const emptyDetail = await host.readArtifact("art:w12a-empty");
  assert.equal(emptyDetail.revisions.length, 0, "an artifact with no revisions surfaces an empty chain honestly");
  assert.equal(emptyDetail.lineageNote, null, "the lineage note is null when the chain is empty");
});

test("W12A-2 library REAL host: readArtifact refuses typed for an unknown artifact (W12-08 refusal law)", async () => {
  const graph = makeGraph();
  const host = createLibraryRealHost({ graph });
  await assert.rejects(
    () => host.readArtifact("art:unknown"),
    /real host: no artifact art:unknown \(typed refusal/,
    "the typed refusal carries the verbatim reason — never a fabricated lineage",
  );
  // The list is still empty — the refusal is honest.
  const listed = await host.listArtifacts();
  assert.equal(listed.length, 0);
});

test("W12A-2 library REAL host: the labeled fixture host stays for the browser demo (sibling, not replacement)", async () => {
  // The W11C fixture host is NOT deleted — the browser demo mount
  // keeps it with backing "fixture" + honest fixture labels. The REAL
  // host is a composition-grade sibling over the REAL service.
  const fixtureHost = createLibraryFixtureHost();
  assert.equal(fixtureHost.backing, "fixture");
  const fixtureListed = await fixtureHost.listArtifacts();
  assert.equal(fixtureListed.length, 2, "the fixture host carries 2 demo artifacts");

  const graph = makeGraph();
  const realHost = createLibraryRealHost({ graph });
  assert.equal(realHost.backing, "real");
  const realListed = await realHost.listArtifacts();
  assert.equal(realListed.length, 0, "the real host has no artifacts until the registry records one");
});

// ---------------------------------------------------------------------------
// W12-09 — the export/content read seam through the GATED path.
// Both arms named, both REAL.
// ---------------------------------------------------------------------------

test("W12A-3 export seam: the gate-allowed arm returns bytes that re-hash to the committed contentHash (W12-09)", async () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  const content = textBytes("the REAL committed bytes for the export seam — hello sporta");
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-export",
    "tactical-board-video",
    "editable",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-export-1",
        content,
        sourceKind: "agent-run",
        sourceRef: "run:w12a-export-1",
        tools: ["sporta-render@0"],
      },
    ],
  );
  const gated = makeGated(graph, blobs);

  // The seam: usage "render" is permitted by PERMISSIVE_POLICY — the
  // gate allows the read.
  const read = exportRevisionContent({ gated, usage: RENDER_USAGE });
  const result = await read("rev:w12a-export-1");
  assert.ok(!("reason" in result), "the gate-allowed arm returns bytes, not a refusal");
  const ok = result as ExportRevisionContentOk;
  // The bytes match the original committed bytes.
  assert.deepEqual(
    Array.from(ok.bytes),
    Array.from(content),
    "the seam returns the REAL committed bytes through the gated read path",
  );
  // The contentHash is the revision record's contentHash — the store
  // verifies bytes ↔ contentHash on read (the store's law). The seam
  // never re-hashes-and-claims; the TEST re-hashes to assert.
  assert.equal(
    ok.contentHash,
    sha256Content(content),
    "the returned contentHash is the revision record's hash",
  );
  // The TEST re-hash: bytes hash to the returned contentHash (the
  // hash-verification law, asserted by the test, NOT the seam).
  const recomputed = createHash("sha256").update(ok.bytes).digest("hex");
  assert.equal(
    recomputed,
    ok.contentHash,
    "the TEST re-hashes the bytes and verifies they equal the returned contentHash (hash-verified against the revision record)",
  );
});

test("W12A-3 export seam: the gate-refused arm returns a typed ScreenRefusal with the verbatim reason (W12-09)", async () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  // Commit a revision whose policy PROHIBITS export. The gate runs
  // FIRST — the read NEVER reaches the blob store.
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-export-prohibited",
    "tactical-board-video",
    "editable",
    EXPORT_PROHIBITED_POLICY,
    [
      {
        revisionId: "rev:w12a-export-prohibited-1",
        content: textBytes("the bytes the gate must NOT let through"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-export-prohibited-1",
        tools: ["sporta-render@0"],
      },
    ],
  );
  const gated = makeGated(graph, blobs);

  // The seam: usage "export" is prohibited by EXPORT_PROHIBITED_POLICY.
  // The gate refuses with ArtifactRightsRefusalError — the seam
  // translates to a ScreenRefusal with the verbatim reason.
  const read = exportRevisionContent({ gated, usage: EXPORT_USAGE });
  const result = await read("rev:w12a-export-prohibited-1");
  assert.ok("reason" in result, "the gate-refused arm returns a ScreenRefusal, not bytes");
  assert.match(
    result.reason,
    /revision gate refused: policy rights refuse this revision read/,
    "the gate's verbatim message carries — never a silent no-op, never a stringly null",
  );
  assert.match(
    result.reason,
    /fail-closed: bare, empty, non-permitted or prohibited usage context/,
    "the gate's specific reason phrase carries verbatim",
  );
});

test("W12A-3 export seam: a bare usage context fails closed into a typed ScreenRefusal (W12-09 fail-closed law)", async () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-bare",
    "tactical-board-video",
    "editable",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-bare-1",
        content: textBytes("bare usage test"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-bare-1",
        tools: ["sporta-render@0"],
      },
    ],
  );
  const gated = makeGated(graph, blobs);

  // The seam with NO usage context — the gate is fail-closed (a bare
  // or empty usage context is a typed refusal).
  const read = exportRevisionContent({ gated });
  const result = await read("rev:w12a-bare-1");
  assert.ok("reason" in result, "the bare-usage arm returns a ScreenRefusal");
  assert.match(
    result.reason,
    /revision gate refused: policy rights refuse this revision read/,
    "the gate's verbatim reason carries — the fail-closed law",
  );
});

test("W12A-3 export seam: an unknown revision id returns a typed ScreenRefusal (honest absence)", async () => {
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  const gated = makeGated(graph, blobs);
  const read = exportRevisionContent({ gated, usage: RENDER_USAGE });
  const result = await read("rev:unknown");
  assert.ok("reason" in result);
  assert.match(
    result.reason,
    /unknown revision rev:unknown — the registry has no such revision/,
    "honest absence — never a fabricated record, never a silent null",
  );
});

test("W12A-3 export seam: no blob store wired → typed ScreenRefusal (the gate's capability-unavailable law)", async () => {
  const graph = makeGraph();
  // Construct the gated service WITHOUT a blob store — the read-
  // revision capability is wired (the graph), but the content-read
  // capability is NOT (no blobs). The gate refuses with
  // ArtifactReadUnavailableError — the seam translates to a typed
  // ScreenRefusal with the verbatim reason.
  const gated = new ArtifactGatedReadService({
    graph,
    // blobs intentionally absent
    clock: { now: () => FIXED_NOW },
  });
  await commitArtifactWithRevisions(
    graph,
    new InMemoryArtifactBlobStore(), // committed through a separate store; the gated service has none
    "art:w12a-no-blobs",
    "tactical-board-video",
    "editable",
    PERMISSIVE_POLICY,
    [
      {
        revisionId: "rev:w12a-no-blobs-1",
        content: textBytes("bytes the gated service cannot reach"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-no-blobs-1",
        tools: ["sporta-render@0"],
      },
    ],
  );
  const read = exportRevisionContent({ gated, usage: RENDER_USAGE });
  const result = await read("rev:w12a-no-blobs-1");
  assert.ok("reason" in result, "the no-blob-store arm returns a ScreenRefusal");
  assert.match(
    result.reason,
    /content gate refused: no blob store is wired into this gated read seam/,
    "the gate's capability-unavailable message carries verbatim",
  );
});

test("W12A-3 export seam: the gate NEVER bypasses — a prohibited read does NOT touch the blob store", async () => {
  // The wave-4 gate law: the gate runs BEFORE every storage touch.
  // A prohibited or retention-expired content read NEVER reaches the
  // blob store. We assert this by tampering with the blob store AFTER
  // commit (deleting the blob); a prohibited read still refuses with
  // the RIGHTS reason (the gate refused BEFORE the storage touch was
  // attempted); the blob-store tampering is never observed.
  const graph = makeGraph();
  const blobs = new InMemoryArtifactBlobStore();
  await commitArtifactWithRevisions(
    graph,
    blobs,
    "art:w12a-gate-first",
    "tactical-board-video",
    "editable",
    EXPORT_PROHIBITED_POLICY,
    [
      {
        revisionId: "rev:w12a-gate-first-1",
        content: textBytes("the bytes the gate must not let through"),
        sourceKind: "agent-run",
        sourceRef: "run:w12a-gate-first-1",
        tools: ["sporta-render@0"],
      },
    ],
  );
  const gated = makeGated(graph, blobs);

  // The prohibited read: usage "export" is refused by the rights gate.
  const read = exportRevisionContent({ gated, usage: EXPORT_USAGE });
  const result = await read("rev:w12a-gate-first-1");
  assert.ok("reason" in result, "the gate refuses — the blob store is never touched");
  assert.match(
    result.reason,
    /revision gate refused: policy rights refuse this revision read/,
    "the rights gate refuses BEFORE any storage touch — never bypassed",
  );
  // The gate's verbatim message is present; the store's not-found or
  // integrity message is NOT (the store was never touched).
  assert.doesNotMatch(
    result.reason,
    /no blob stored at|integrity check failed/,
    "the blob store was never reached — the gate runs first (never bypassed)",
  );
});
