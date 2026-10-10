import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  EditorBrokerService,
  FixedClock,
  FsEditorSessionHistoryStore,
  FsSharedSessionStore,
  InMemoryEditorSessionStore,
  KdenliveAdapter,
  SharedEditorSessionService,
  SharedSessionConflictError,
  serializeEditOperation,
  sha256EditorHash,
} from "../src/contract.js";
import { ArtifactGraphService, FsArtifactBlobStore } from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { SharedEditorSessionDeps } from "../src/contract.js";
import type { KdenliveProjectState } from "../src/contract.js";

/**
 * W6A REAL round-trip lane — a live/shared editor session reconciling a
 * REAL artifact through close. EVIDENCE CLASS per leg (labeled honestly):
 *
 *   - shared-session store: REAL. FsSharedSessionStore on a REAL temp
 *     directory — real files, real atomic writes, real durability (a
 *     FRESH instance over the same directory reads the closed session,
 *     the frozen coordination log and the close memo back).
 *   - revision hash chain: REAL. The REAL ArtifactGraphService (real
 *     parent/lineage integrity checks) + the REAL FsArtifactBlobStore
 *     on real disk: every changed project state is put as REAL bytes,
 *     its sha-256 content address is the revision's content hash, and
 *     the chain r1 -> r2 -> r3 is asserted through the real lineage.
 *   - editor: REAL. The REAL KdenliveAdapter — real MLT XML parsed,
 *     edited, serialized and re-parsed; the close reconcile runs through
 *     the REAL EditorBrokerService with the real adapter registered,
 *     emitting granular MLT-path operations on the EditDelta.
 *   - FIXTURE (labeled): the FixedClock (deterministic timestamps) and
 *     the in-memory broker session store (the W1 seam; the durable
 *     editor-session history ledger is the REAL FsEditorSessionHistoryStore).
 *
 * MEASURED (see the test's final assertions): wall time via
 * performance.now(), file count and byte totals by walking the real
 * directories.
 */

const POLICY: PolicySet = {
  rights: { holders: ["holder:w6a-real"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const PROVENANCE: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:w6a-real",
  capturedAt: "2026-10-01T00:00:00.000Z",
};

const INITIAL_MLT_XML = `<?xml version="1.0" encoding="utf-8"?>
<mlt LC_NUMERIC="C" version="7.0.0" title="Match 7" producer="main_bin">
  <profile description="1920x1080 25.000 fps" width="1920" height="1080" frame_rate_num="25" frame_rate_den="1"/>
  <producer id="producer0" in="00:00:00.000" out="00:00:05.000">
    <property name="length">00:00:05.000</property>
    <property name="resource">/home/user/videos/goal.mp4</property>
    <property name="mlt_service">avformat</property>
  </producer>
  <playlist id="playlist0">
    <property name="kdenlive:track_name">Video 1</property>
    <entry producer="producer0" in="00:00:00.000" out="00:00:05.000"/>
  </playlist>
  <tractor id="tractor0" in="00:00:00.000" out="00:00:05.000">
    <track producer="playlist0"/>
  </tractor>
</mlt>
`;

/** Count files + total bytes under a real directory (measurement helper). */
async function measureTree(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const name of await fs.readdir(dir)) {
      const entry = join(dir, name);
      const stat = await fs.stat(entry);
      if (stat.isDirectory()) await walk(entry);
      else {
        files += 1;
        bytes += stat.size;
      }
    }
  };
  await walk(root);
  return { files, bytes };
}

/** One realistic collaborative edit: mutate the parsed MLT state. */
function editMlt(state: KdenliveProjectState, title: string): KdenliveProjectState {
  const [first] = state.mlt.playlists;
  assert.ok(first);
  return {
    mlt: {
      ...state.mlt,
      attributes: { ...state.mlt.attributes, title },
      playlists: state.mlt.playlists.map((playlist) =>
        playlist.attributes.id === "playlist0"
          ? {
              ...playlist,
              children: [
                ...playlist.children,
                {
                  type: "entry",
                  attributes: { producer: "producer0", in: "00:00:05.000", out: "00:00:09.000" },
                },
              ],
            }
          : playlist,
      ),
    },
  };
}

test("REAL lane: live/shared session over real FS stores + real hash chain + real MLT XML, reconciled through close", async () => {
  const startedAt = performance.now();
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "sporta-w6a-real-"));
  const blobs = new FsArtifactBlobStore(join(tempRoot, "blobs"));
  const sharedLedgerDir = join(tempRoot, "shared-sessions");
  const historyDir = join(tempRoot, "editor-history");
  try {
    const clock = new FixedClock("2026-10-01T00:00:00.000Z");
    const artifacts = new ArtifactGraphService(clock);
    const historyStore = new FsEditorSessionHistoryStore(historyDir);
    const kdenlive = new KdenliveAdapter(sha256EditorHash);
    const broker = new EditorBrokerService({
      clock,
      hash: sha256EditorHash,
      artifactGraph: artifacts,
      sessionStore: new InMemoryEditorSessionStore(),
      adapters: [kdenlive],
      sessionHistory: historyStore,
    });
    const service = new SharedEditorSessionService({
      clock,
      hash: sha256EditorHash,
      broker,
      artifactGraph: artifacts,
      sharedSessionStore: new FsSharedSessionStore(sharedLedgerDir),
    } satisfies SharedEditorSessionDeps);

    // 1. a canonical artifact whose first revision IS the real MLT XML
    //    (real bytes -> real sha-256 content address -> real revision).
    const initialState = kdenlive.parseKdenliveXml(INITIAL_MLT_XML);
    const initialXml = kdenlive.exportToKdenliveXml(initialState); // canonical form
    const initialBytes = new TextEncoder().encode(initialXml);
    const initialHash = await blobs.put(initialBytes);
    await artifacts.recordArtifact({
      artifactId: "art:w6a-real",
      kind: "tactical-board-video",
      editability: "editable",
      policy: POLICY,
    });
    const r1 = await artifacts.commitRevision({
      artifactId: "art:w6a-real",
      revisionId: "rev:w6a-real-1",
      contentHash: initialHash,
      toolVersions: ["sporta-render@0"],
      provenance: PROVENANCE,
      policy: POLICY,
    });
    assert.equal(r1.contentHash, initialHash);

    // 2. open the shared session (resolve + checkpoint + opener admission)
    const record = await service.openSharedSession({
      sessionId: "ss:w6a-real-1",
      revisionId: r1.revisionId,
      availability: [
        {
          editorId: "kdenlive",
          version: "24.08.0",
          integrationLevel: 2,
          projectFormat: "kdenlive",
          licensing: "GPL-3.0",
        },
      ],
      userPreference: "kdenlive",
      mode: "local",
      policy: POLICY,
      opener: {
        participantId: "user:director",
        capabilities: ["timeline", "live"],
        usage: { usages: ["edit", "render"] },
      },
    });
    assert.equal(record.underlyingEditorSessionId, "ss:w6a-real-1#es");
    assert.equal(record.artifactRef.checkpointContentHash, initialHash);
    assert.deepEqual(record.participants[0]?.effectiveUsages, ["edit", "render"]);

    // 3. a second participant joins (presence + rights gate)
    const joined = await service.joinSharedSession({
      sessionId: "ss:w6a-real-1",
      participantId: "user:editor",
      capabilities: ["timeline"],
      usage: { usages: ["edit", "derive"] },
    });
    assert.equal(joined.participants.length, 2);

    // 4. live deltas broadcast in the total order (real serialized
    //    operations; both based on the checkpoint head r1)
    const first = await service.broadcastDelta({
      sessionId: "ss:w6a-real-1",
      participantId: "user:director",
      baseRevisionId: r1.revisionId,
      operations: [
        serializeEditOperation({
          kind: "set",
          path: "/mlt/attributes/title",
          valueHash: sha256EditorHash("Match 7 — Second Half"),
        }),
      ],
    });
    assert.equal(first.entry.sequence, 1);
    const second = await service.broadcastDelta({
      sessionId: "ss:w6a-real-1",
      participantId: "user:editor",
      baseRevisionId: r1.revisionId,
      operations: [serializeEditOperation({ kind: "insert", path: "/mlt/playlists/0/children/1" })],
    });
    assert.equal(second.entry.sequence, 2);

    // 5. mid-session save: a REAL edit (title + a new entry), serialized,
    //    put as real bytes, reconciled to r2 through the real broker
    const editedState = editMlt(initialState, "Match 7 — Second Half");
    const editedXml = kdenlive.exportToKdenliveXml(editedState);
    const editedHash = await blobs.put(new TextEncoder().encode(editedXml));
    const saved = await service.saveSharedSession({
      sessionId: "ss:w6a-real-1",
      changedProjectHash: editedHash,
      projectFormat: "kdenlive",
      projectState: editedState,
      externalTool: { name: "kdenlive", version: "24.08.0" },
    });
    const r2 = saved.reconcile.revision;
    assert.equal(saved.reconcile.understood, true);
    assert.equal(r2.parentRevisionId, r1.revisionId);
    assert.equal(r2.contentHash, editedHash); // the REAL content address of the REAL XML bytes
    assert.equal(saved.headRevisionId, r2.revisionId);

    // 6. a stale in-flight delta (based on r1) is refused with BOTH
    //    divergent revision ids — the coordination law under a real head
    await assert.rejects(
      () =>
        service.broadcastDelta({
          sessionId: "ss:w6a-real-1",
          participantId: "user:editor",
          baseRevisionId: r1.revisionId,
          operations: [serializeEditOperation({ kind: "set", path: "/mlt/attributes/title" })],
        }),
      (error: unknown) => {
        assert.ok(error instanceof SharedSessionConflictError);
        assert.equal(error.sessionHeadRevisionId, r2.revisionId);
        assert.equal(error.deltaBaseRevisionId, r1.revisionId);
        return true;
      },
    );
    // the SAME delta retried on the new head delivers at sequence 3
    const third = await service.broadcastDelta({
      sessionId: "ss:w6a-real-1",
      participantId: "user:editor",
      baseRevisionId: r2.revisionId,
      operations: [serializeEditOperation({ kind: "set", path: "/mlt/attributes/title" })],
    });
    assert.equal(third.entry.sequence, 3);

    // 7. reconcile-on-close: a further real edit becomes r3 with an
    //    EditDelta of granular MLT operations (the real adapter)
    const finalState = editMlt(editedState, "Match 7 — Final Cut");
    const finalXml = kdenlive.exportToKdenliveXml(finalState);
    const finalHash = await blobs.put(new TextEncoder().encode(finalXml));
    const closed = await service.closeSharedSession({
      sessionId: "ss:w6a-real-1",
      changedProjectHash: finalHash,
      projectFormat: "kdenlive",
      projectState: finalState,
      externalTool: { name: "kdenlive", version: "24.08.0" },
    });
    const r3 = closed.reconcile.revision;
    assert.equal(r3.parentRevisionId, r2.revisionId);
    assert.equal(r3.contentHash, finalHash);
    assert.deepEqual(
      (await artifacts.lineage("art:w6a-real")).map((revision) => revision.revisionId),
      ["rev:w6a-real-1", r2.revisionId, r3.revisionId],
    );
    assert.equal(closed.reconcile.delta.editor, "kdenlive");
    assert.ok(closed.reconcile.delta.operations.length > 0);
    assert.ok(
      closed.reconcile.delta.operations.every((operation) => operation.startsWith("set /mlt/")),
    );
    assert.equal(closed.reconcile.delta.provenance.sourceKind, "editor-session");
    assert.equal(closed.reconcile.delta.provenance.sourceRef, "ss:w6a-real-1#es");
    assert.deepEqual(closed.broadcast, {
      count: 3,
      lastSequence: 3,
      deltaIds: [first.entry.deltaId, second.entry.deltaId, third.entry.deltaId],
    });
    assert.deepEqual(
      closed.participants.map((participant) => participant.leaveReason),
      ["closed", "closed"],
    );
    // the real round-trip law: the r3 content address hashes back to the
    // stored bytes (read them back from the REAL blob store)
    assert.deepEqual(await blobs.read(finalHash), new TextEncoder().encode(finalXml));

    // 8. REAL durability: a FRESH FsSharedSessionStore over the same
    //    directory reads the closed session, the frozen log and the memo
    const freshStore = new FsSharedSessionStore(sharedLedgerDir);
    const freshRecord = await freshStore.findSession("ss:w6a-real-1");
    assert.ok(freshRecord);
    assert.equal(freshRecord.state, "closed");
    assert.equal(freshRecord.closedAt, closed.closedAt);
    const freshCoordination = await freshStore.findCoordination("ss:w6a-real-1");
    assert.ok(freshCoordination);
    assert.equal(freshCoordination.headRevisionId, r3.revisionId);
    assert.deepEqual(
      freshCoordination.log.map((entry) => [entry.sequence, entry.deltaId]),
      [
        [1, first.entry.deltaId],
        [2, second.entry.deltaId],
        [3, third.entry.deltaId],
      ],
    );
    const freshMemo = await freshStore.findCloseResult("ss:w6a-real-1");
    assert.ok(freshMemo);
    assert.deepEqual(freshMemo.reconcile.revision.revisionId, r3.revisionId);
    assert.deepEqual(freshMemo, closed);

    // 9. MEASURED evidence (real numbers, stated how measured):
    //    wall time via performance.now(); files/bytes by walking the
    //    real directories with fs.stat.
    const wallMs = performance.now() - startedAt;
    const blobTree = await measureTree(join(tempRoot, "blobs"));
    const ledgerTree = await measureTree(sharedLedgerDir);
    const historyTree = await measureTree(historyDir);
    assert.ok(blobTree.files >= 3, `expected >= 3 real blob files, got ${blobTree.files}`);
    assert.ok(
      ledgerTree.files >= 1,
      `expected a real shared-session ledger file, got ${ledgerTree.files}`,
    );
    assert.ok(
      historyTree.files >= 1,
      `expected a real history ledger file, got ${historyTree.files}`,
    );
    assert.ok(wallMs > 0 && wallMs < 30_000);
    console.log(
      `[w6a REAL lane] wall=${wallMs.toFixed(1)}ms ` +
        `blobs=${blobTree.files} files/${blobTree.bytes} bytes ` +
        `sharedLedger=${ledgerTree.files} files/${ledgerTree.bytes} bytes ` +
        `history=${historyTree.files} files/${historyTree.bytes} bytes`,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
