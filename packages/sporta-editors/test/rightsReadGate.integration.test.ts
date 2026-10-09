import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EditorBrokerService,
  EditorSessionHistoryService,
  FsEditorSessionHistoryStore,
  FixedClock,
  InMemoryEditorSessionStore,
  KdenliveAdapter,
  sha256EditorHash,
} from "../src/contract.js";
import { ArtifactGraphService, FsArtifactBlobStore } from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { EditorBrokerDeps } from "../src/contract.js";

/**
 * W3B-2 — rights propagation enforcement on reads (invariant 22), proven
 * end-to-end on the REAL kdenlive lane with W2 real-execution code only:
 *
 * - a REAL .kdenlive (MLT XML) document is parsed and re-exported by the
 *   real KdenliveAdapter (round-trip);
 * - the exported XML bytes are stored through the real durable
 *   FsArtifactBlobStore (real files on a real temp dir) and become a real
 *   artifact revision;
 * - the broker opens a REAL editor session on that revision with the
 *   real adapter registered, projecting into the real durable
 *   FsEditorSessionHistoryStore ledger;
 * - a caller whose usage context is permitted CAN list the session; a
 *   caller whose usages hit the session's PolicySet prohibition CANNOT
 *   (the session is absent from the list — never an error);
 * - the PolicySet is proven to travel VERBATIM through the broker and
 *   the history port: the session-store record, the durable ledger file
 *   on disk, and the gate's differential behavior all agree on the exact
 *   policy fields that gated the read.
 */

const REAL_KDENLIVE_DOC = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE kdenlivedoc SYSTEM "kdenlive-0.9.dtd">
<mlt LC_NUMERIC="C" version="7.0.0" title="Anonymous Submission" producer="main_bin">
  <profile description="1920x1080 25.000 fps" width="1920" height="1080" frame_rate_num="25" frame_rate_den="1"/>
  <producer id="producer0" in="00:00:00.000" out="00:00:05.000">
    <property name="length">00:00:05.000</property>
    <property name="resource">/home/user/videos/goal.mp4</property>
    <property name="mlt_service">avformat</property>
  </producer>
  <playlist id="playlist0">
    <property name="kdenlive:track_name">Video 1</property>
    <entry producer="producer0" in="00:00:00.000" out="00:00:05.000"/>
    <blank length="00:00:01.000"/>
  </playlist>
  <tractor id="tractor0" in="00:00:00.000" out="00:00:06.000">
    <track producer="playlist0"/>
    <transition id="transition0" out="00:00:01.000">
      <property name="mlt_service">mix</property>
    </transition>
  </tractor>
</mlt>
`;

/** The session policy: render+edit permitted, derive prohibited. */
const policy: PolicySet = {
  rights: {
    holders: ["holder:w3b-rights"],
    usages: ["render", "edit"],
    prohibitions: ["derive"],
  },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:w3b-rights",
  capturedAt: "2026-05-01T00:00:00.000Z",
};

async function realTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** The REAL lane: everything below is real-execution W2/W3 code. */
async function realLane(): Promise<{
  broker: EditorBrokerService;
  sessionStore: InMemoryEditorSessionStore;
  history: FsEditorSessionHistoryStore;
  reads: EditorSessionHistoryService;
  blobRoot: string;
  historyRoot: string;
  revisionId: string;
  exportedXml: string;
  contentHash: string;
}> {
  const adapter = new KdenliveAdapter(sha256EditorHash);

  // 1. REAL XML round-trip: parse the real-shaped document, re-export it.
  const state = adapter.parseKdenliveXml(REAL_KDENLIVE_DOC);
  const exportedXml = adapter.exportToKdenliveXml(state);
  // Round-trip honesty check (the W2 fixed-point law).
  assert.equal(adapter.exportToKdenliveXml(adapter.parseKdenliveXml(exportedXml)), exportedXml);

  // 2. REAL durable blob storage: the exported XML bytes land on real disk.
  const blobRoot = await realTempRoot("sporta-w3b-blobs-");
  const blobs = new FsArtifactBlobStore(blobRoot);
  const contentHash = await blobs.put(new TextEncoder().encode(exportedXml));

  // 3. REAL artifact graph: a canonical artifact with the round-trip revision.
  const artifacts = new ArtifactGraphService(new FixedClock("2026-05-01T00:00:00.000Z"));
  await artifacts.recordArtifact({
    artifactId: "art:w3b-rights",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const revision = await artifacts.commitRevision({
    artifactId: "art:w3b-rights",
    revisionId: "rev:w3b-rights-1",
    contentHash,
    toolVersions: ["kdenlive@24.08.0"],
    provenance,
    policy,
  });

  // 4. The broker with the real adapter and the real durable history ledger.
  const historyRoot = await realTempRoot("sporta-w3b-history-");
  const sessionStore = new InMemoryEditorSessionStore();
  const history = new FsEditorSessionHistoryStore(historyRoot);
  const broker = new EditorBrokerService({
    clock: new FixedClock("2026-05-02T00:00:00.000Z"),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore,
    adapters: [adapter],
    sessionHistory: history,
  } satisfies EditorBrokerDeps);

  return {
    broker,
    sessionStore,
    history,
    reads: new EditorSessionHistoryService({ history }),
    blobRoot,
    historyRoot,
    revisionId: revision.revisionId,
    exportedXml,
    contentHash,
  };
}

test("REAL kdenlive lane: a permitted caller lists the session opened on the round-trip revision", async () => {
  const lane = await realLane();
  try {
    const session = await lane.broker.openSession({
      revisionId: lane.revisionId,
      editorId: "kdenlive",
      mode: "local",
      policy,
      editorSessionId: "es:w3b-rights-1",
    });
    assert.equal(session.revisionId, lane.revisionId);
    assert.equal(session.integrationLevel, 2); // the REAL adapter's level

    // The exported XML really is durable bytes on real disk: the blob
    // file exists at its sharded content address, and the history ledger
    // entry for the session exists as a real file too.
    const blobPath = join(
      lane.blobRoot,
      lane.contentHash.substring(0, 2),
      lane.contentHash.substring(2, 4),
      lane.contentHash.substring(4),
    );
    const blobInfo = await stat(blobPath);
    assert.ok(blobInfo.isFile());
    assert.equal(blobInfo.size, new TextEncoder().encode(lane.exportedXml).byteLength);
    const idHash = sha256EditorHash("es:w3b-rights-1");
    const ledgerPath = join(lane.historyRoot, idHash.substring(0, 2), `${idHash}.json`);
    assert.ok((await stat(ledgerPath)).isFile());

    // A caller with render usage CAN list the session.
    const render = await lane.reads.listEditorSessions({ usage: { usages: ["render"] } });
    assert.equal(render.length, 1);
    assert.deepEqual(render[0], {
      editorSessionId: "es:w3b-rights-1",
      editorId: "kdenlive",
      revisionId: lane.revisionId,
      mode: "local",
      integrationLevel: 2,
      openedAt: "2026-05-02T00:00:00.000Z",
    });
  } finally {
    await rm(lane.blobRoot, { recursive: true, force: true });
    await rm(lane.historyRoot, { recursive: true, force: true });
  }
});

test("REAL kdenlive lane: a caller whose usage hits the prohibition CANNOT list the session", async () => {
  const lane = await realLane();
  try {
    await lane.broker.openSession({
      revisionId: lane.revisionId,
      editorId: "kdenlive",
      mode: "local",
      policy,
      editorSessionId: "es:w3b-rights-1",
    });

    // derive is PROHIBITED by the session's PolicySet: honest absence.
    const derive = await lane.reads.listEditorSessions({ usage: { usages: ["derive"] } });
    assert.deepEqual(derive, []);
    // A mixed context (render + derive) is a whole: the prohibition hides
    // the session even though render alone would be permitted.
    const mixed = await lane.reads.listEditorSessions({ usage: { usages: ["render", "derive"] } });
    assert.deepEqual(mixed, []);
    // An edit-permitted caller still sees it (multiple permitted classes).
    const edit = await lane.reads.listEditorSessions({ usage: { usages: ["edit"] } });
    assert.equal(edit.length, 1);
    // And the fail-closed default: no usage context, no listing.
    assert.deepEqual(await lane.reads.listEditorSessions({}), []);
  } finally {
    await rm(lane.blobRoot, { recursive: true, force: true });
    await rm(lane.historyRoot, { recursive: true, force: true });
  }
});

test("the PolicySet travels verbatim through broker and history port (the gate ran on the traveled fields)", async () => {
  const lane = await realLane();
  try {
    const session = await lane.broker.openSession({
      revisionId: lane.revisionId,
      editorId: "kdenlive",
      mode: "local",
      policy,
      editorSessionId: "es:w3b-rights-1",
    });

    // (a) The broker's session record carries the PolicySet verbatim.
    const stored = await lane.sessionStore.find(session.editorSessionId);
    assert.ok(stored !== null);
    assert.deepEqual(stored.policy, policy);

    // (b) The durable history ledger on REAL disk carries it verbatim:
    // read the actual JSON file back and compare the policy fields.
    const idHash = sha256EditorHash(session.editorSessionId);
    const ledgerPath = join(lane.historyRoot, idHash.substring(0, 2), `${idHash}.json`);
    const onDisk = JSON.parse(await readFile(ledgerPath, "utf8"));
    assert.deepEqual(onDisk.policy, policy);

    // (c) The exact fields that gated the read, as traveled:
    assert.deepEqual(onDisk.policy.rights.usages, ["render", "edit"]);
    assert.deepEqual(onDisk.policy.rights.prohibitions, ["derive"]);
    // The gate's differential behavior (render lists, derive does not)
    // consumed exactly these traveled fields — nothing else decided.
    const render = await lane.reads.listEditorSessions({ usage: { usages: ["render"] } });
    const derive = await lane.reads.listEditorSessions({ usage: { usages: ["derive"] } });
    assert.equal(render.length, 1);
    assert.deepEqual(derive, []);
  } finally {
    await rm(lane.blobRoot, { recursive: true, force: true });
    await rm(lane.historyRoot, { recursive: true, force: true });
  }
});

test("the gate survives a real reconcile and a ledger restart with identical results", async () => {
  const lane = await realLane();
  try {
    const adapter = new KdenliveAdapter(sha256EditorHash);
    const session = await lane.broker.openSession({
      revisionId: lane.revisionId,
      editorId: "kdenlive",
      mode: "local",
      policy,
      editorSessionId: "es:w3b-rights-1",
    });

    // A REAL edit on the round-trip state, reconciled through the real
    // adapter: the canonical chain grows a child revision.
    const state = adapter.parseKdenliveXml(lane.exportedXml);
    const edited = {
      mlt: {
        ...state.mlt,
        attributes: { ...state.mlt.attributes, title: "Match 7 — Second Half" },
      },
    };
    const editedXml = adapter.exportToKdenliveXml(edited);
    const result = await lane.broker.reconcileSession({
      editorSessionId: session.editorSessionId,
      changedProjectHash: sha256EditorHash(editedXml),
      externalTool: { name: "kdenlive", version: "24.08.0" },
      projectFormat: "kdenlive",
      projectState: edited,
    });
    assert.equal(result.understood, true);
    assert.equal(result.revision.parentRevisionId, lane.revisionId);

    // The read seam still lists the session, anchored at its CHECKPOINT
    // revision (reconcile never rewrites the session record).
    const afterReconcile = await lane.reads.listEditorSessions({
      usage: { usages: ["render"] },
    });
    assert.equal(afterReconcile.length, 1);
    assert.equal(afterReconcile[0]?.revisionId, lane.revisionId);

    // Simulate restart: fresh store + service over the SAME ledger dir.
    const restartedReads = new EditorSessionHistoryService({
      history: new FsEditorSessionHistoryStore(lane.historyRoot),
    });
    assert.deepEqual(await restartedReads.listEditorSessions({ usage: { usages: ["render"] } }), [
      {
        editorSessionId: "es:w3b-rights-1",
        editorId: "kdenlive",
        revisionId: lane.revisionId,
        mode: "local",
        integrationLevel: 2,
        openedAt: "2026-05-02T00:00:00.000Z",
      },
    ]);
    assert.deepEqual(
      await restartedReads.listEditorSessions({ usage: { usages: ["derive"] } }),
      [],
    );
  } finally {
    await rm(lane.blobRoot, { recursive: true, force: true });
    await rm(lane.historyRoot, { recursive: true, force: true });
  }
});
