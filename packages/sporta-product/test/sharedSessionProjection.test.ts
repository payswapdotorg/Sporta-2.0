/**
 * w6c-4: REAL lane = real FsSharedSessionStore + real service lifecycle + the
 * REAL SharedSessionStoreProjection adapter, read back through the product
 * projection. FIXTURE lanes are labeled FIXTURE (absent port / fake port).
 *
 * Station re-seam note (TL): the worker's appendix-A assumptions were adapted
 * to the REAL frozen surface at integration (see sharedSessionProjection.ts):
 * the service's real method names/shapes, the store's real ledger layout for
 * id discovery, coordination.lastSequence as the head revision, and the
 * ordered log's serialized operations as the delta payloads.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EditorBrokerService,
  FixedClock,
  FsEditorSessionHistoryStore,
  FsSharedSessionStore,
  InMemoryEditorSessionStore,
  KdenliveAdapter,
  SharedEditorSessionService,
  serializeEditOperation,
  sha256EditorHash,
  type KdenliveProjectState,
} from '@sporta/editors/contract';
import { ArtifactGraphService, FsArtifactBlobStore } from '@sporta/artifacts/contract';
import type { PolicySet, ProvenanceDescriptor } from '@sporta/contracts/contract';
import { SharedSessionProjection, withSharedSessions, type SharedSessionListView } from '../src/app/sharedSessionProjection.js';
import { SharedSessionStoreProjection } from '../src/app/sharedSessionStoreProjection.js';
import type { SharedSessionProjectionPort } from '../src/app/sharedSessionProjectionPort.js';

const POLICY: PolicySet = {
  rights: { holders: ['holder:w6c-proj'], usages: ['render', 'edit', 'derive'], prohibitions: [] },
  privacy: { visibility: 'tenant', exportableFields: [] },
  retention: { disposition: 'retain' },
};

const PROVENANCE: ProvenanceDescriptor = {
  sourceKind: 'agent-run',
  sourceRef: 'run:w6c-proj',
  capturedAt: '2026-10-01T00:00:00.000Z',
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

/** One realistic collaborative edit: mutate the parsed MLT state (title). */
function editMlt(state: KdenliveProjectState, title: string): KdenliveProjectState {
  const [first] = state.mlt.playlists;
  assert.ok(first);
  return {
    mlt: {
      ...state.mlt,
      attributes: { ...state.mlt.attributes, title },
    },
  };
}

interface RealStack {
  service: SharedEditorSessionService;
  store: FsSharedSessionStore;
  ledgerDir: string;
  blobs: FsArtifactBlobStore;
  initialRevisionId: string;
  kdenlive: KdenliveAdapter;
}

/** Wire the REAL stack: broker + artifacts + blob store + real FS shared ledger. */
async function realStack(dir: string): Promise<RealStack> {
  const clock = new FixedClock('2026-10-01T00:00:00.000Z');
  const artifacts = new ArtifactGraphService(clock);
  const blobs = new FsArtifactBlobStore(join(dir, 'blobs'));
  const kdenlive = new KdenliveAdapter(sha256EditorHash);
  const broker = new EditorBrokerService({
    clock,
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [kdenlive],
    sessionHistory: new FsEditorSessionHistoryStore(join(dir, 'editor-history')),
  });
  const ledgerDir = join(dir, 'shared-sessions');
  const store = new FsSharedSessionStore(ledgerDir);
  const service = new SharedEditorSessionService({
    clock,
    hash: sha256EditorHash,
    broker,
    artifactGraph: artifacts,
    sharedSessionStore: store,
  });

  // seed one artifact revision whose content IS the real MLT XML
  const initialState = kdenlive.parseKdenliveXml(INITIAL_MLT_XML);
  const initialXml = kdenlive.exportToKdenliveXml(initialState);
  const initialHash = await blobs.put(new TextEncoder().encode(initialXml));
  await artifacts.recordArtifact({
    artifactId: 'art:w6c-proj',
    kind: 'tactical-board-video',
    editability: 'editable',
    policy: POLICY,
  });
  const r1 = await artifacts.commitRevision({
    artifactId: 'art:w6c-proj',
    revisionId: 'rev:w6c-proj-1',
    contentHash: initialHash,
    toolVersions: ['sporta-render@0'],
    provenance: PROVENANCE,
    policy: POLICY,
  });
  return { service, store, ledgerDir, blobs, initialRevisionId: r1.revisionId, kdenlive };
}

test('w6c-4 REAL: full lifecycle (open → join → broadcast → save → close) read back through the REAL store projection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'w6c-projection-'));
  try {
    const { service, store, ledgerDir, blobs, initialRevisionId, kdenlive } = await realStack(dir);
    const { sessionId } = await service.openSharedSession({
      sessionId: 'ss:w6c-proj-1',
      revisionId: initialRevisionId,
      availability: [
        { editorId: 'kdenlive', version: '24.08.0', integrationLevel: 2, projectFormat: 'kdenlive', licensing: 'GPL-3.0' },
      ],
      userPreference: 'kdenlive',
      mode: 'local',
      policy: POLICY,
      opener: { participantId: 'user:director', capabilities: ['timeline'], usage: { usages: ['edit', 'render'] } },
    });
    await service.joinSharedSession({
      sessionId,
      participantId: 'user:editor',
      capabilities: ['timeline'],
      usage: { usages: ['edit'] },
    });
    await service.broadcastDelta({
      sessionId,
      participantId: 'user:director',
      baseRevisionId: initialRevisionId,
      operations: [serializeEditOperation({ kind: 'set', path: '/mlt/attributes/title', valueHash: sha256EditorHash('Match 7 — Second Half') })],
    });
    await service.broadcastDelta({
      sessionId,
      participantId: 'user:editor',
      baseRevisionId: initialRevisionId,
      operations: [serializeEditOperation({ kind: 'insert', path: '/mlt/playlists/0/children/1' })],
    });
    const initialState = kdenlive.parseKdenliveXml(INITIAL_MLT_XML);
    const editedState = editMlt(initialState, 'Match 7 — Second Half');
    const editedHash = await blobs.put(new TextEncoder().encode(kdenlive.exportToKdenliveXml(editedState)));
    await service.saveSharedSession({
      sessionId,
      changedProjectHash: editedHash,
      projectFormat: 'kdenlive',
      projectState: editedState,
      externalTool: { name: 'kdenlive', version: '24.08.0' },
    });
    const finalState = editMlt(editedState, 'Match 7 — Final Cut');
    const finalHash = await blobs.put(new TextEncoder().encode(kdenlive.exportToKdenliveXml(finalState)));
    await service.closeSharedSession({
      sessionId,
      changedProjectHash: finalHash,
      projectFormat: 'kdenlive',
      projectState: finalState,
      externalTool: { name: 'kdenlive', version: '24.08.0' },
    });

    const projection = new SharedSessionProjection({
      sharedSessionHistory: new SharedSessionStoreProjection(store, ledgerDir),
    });
    const list = await projection.listSessions();
    assert.equal(list.wired, true);
    const row = list.sessions.find((session) => session.sessionId === sessionId);
    assert.ok(row, 'the closed session must appear in the projection');
    assert.equal(row.status, 'closed');
    assert.deepEqual([...row.participants].sort(), ['user:director', 'user:editor']);
    assert.equal(row.headRevision, 2); // coordination.lastSequence after two ordered broadcasts
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('w6c-4 REAL: single-session detail exposes the ordered delta log with exact payloads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'w6c-projection-'));
  try {
    const { service, store, ledgerDir, blobs, initialRevisionId, kdenlive } = await realStack(dir);
    const { sessionId } = await service.openSharedSession({
      sessionId: 'ss:w6c-proj-2',
      revisionId: initialRevisionId,
      availability: [
        { editorId: 'kdenlive', version: '24.08.0', integrationLevel: 2, projectFormat: 'kdenlive', licensing: 'GPL-3.0' },
      ],
      userPreference: 'kdenlive',
      mode: 'local',
      policy: POLICY,
      opener: { participantId: 'user:director', capabilities: ['timeline'], usage: { usages: ['edit', 'render'] } },
    });
    const firstOp = serializeEditOperation({ kind: 'set', path: '/mlt/attributes/title', valueHash: sha256EditorHash('Match 7 — Second Half') });
    const secondOp = serializeEditOperation({ kind: 'insert', path: '/mlt/playlists/0/children/1' });
    await service.broadcastDelta({ sessionId, participantId: 'user:director', baseRevisionId: initialRevisionId, operations: [firstOp] });
    await service.broadcastDelta({ sessionId, participantId: 'user:director', baseRevisionId: initialRevisionId, operations: [secondOp] });
    const initialState = kdenlive.parseKdenliveXml(INITIAL_MLT_XML);
    const editedState = editMlt(initialState, 'Match 7 — Second Half');
    const editedHash = await blobs.put(new TextEncoder().encode(kdenlive.exportToKdenliveXml(editedState)));
    await service.saveSharedSession({
      sessionId,
      changedProjectHash: editedHash,
      projectFormat: 'kdenlive',
      projectState: editedState,
      externalTool: { name: 'kdenlive', version: '24.08.0' },
    });
    const finalState = editMlt(editedState, 'Match 7 — Final Cut');
    const finalHash = await blobs.put(new TextEncoder().encode(kdenlive.exportToKdenliveXml(finalState)));
    await service.closeSharedSession({
      sessionId,
      changedProjectHash: finalHash,
      projectFormat: 'kdenlive',
      projectState: finalState,
      externalTool: { name: 'kdenlive', version: '24.08.0' },
    });

    const projection = new SharedSessionProjection({
      sharedSessionHistory: new SharedSessionStoreProjection(store, ledgerDir),
    });
    const detail = await projection.sessionDetail(sessionId);
    assert.deepEqual(detail, {
      wired: true,
      found: true,
      detail: {
        sessionId,
        status: 'closed',
        participants: ['user:director'],
        headRevision: 2,
        deltaLog: [
          { revision: 1, payload: [firstOp] },
          { revision: 2, payload: [secondOp] },
        ],
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('w6c-4 REAL: unknown session id → found:false, never a crash', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'w6c-projection-'));
  try {
    const { store, ledgerDir } = await realStack(dir);
    const projection = new SharedSessionProjection({
      sharedSessionHistory: new SharedSessionStoreProjection(store, ledgerDir),
    });
    assert.deepEqual(await projection.sessionDetail('no-such-session'), { wired: true, found: false });
    const list = await projection.listSessions();
    assert.deepEqual(list, { wired: true, sessions: [] }); // real empty ledger, honestly empty
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('w6c-4 FIXTURE: absent port → EMPTY projection (empty list, not-found detail), never a crash', async () => {
  const projection = new SharedSessionProjection({});
  assert.equal(projection.wired, false);
  assert.deepEqual(await projection.listSessions(), { wired: false, sessions: [] });
  assert.deepEqual(await projection.sessionDetail('any'), { wired: false, found: false });
});

test('w6c-4 FIXTURE: fake in-memory history port maps rows into the summary/detail views', async () => {
  const fake: SharedSessionProjectionPort = {
    listSessions: async () => [
      { sessionId: 's-1', status: 'open', participants: [{ participantId: 'a' }, 'b'], headRevision: 3 },
    ],
    getSession: async (id: string) =>
      id === 's-1' ? { sessionId: 's-1', status: 'open', participants: ['a'], headRevision: 3 } : null,
    getDeltaLog: async (id: string) => (id === 's-1' ? [{ revision: 1, payload: { kind: 'x' } }] : null),
  };
  const projection = new SharedSessionProjection({ sharedSessionHistory: fake });
  const list: SharedSessionListView = await projection.listSessions();
  assert.deepEqual(list, {
    wired: true,
    sessions: [{ sessionId: 's-1', status: 'open', participants: ['a', 'b'], headRevision: 3 }],
  });
  const detail = await projection.sessionDetail('s-1');
  assert.equal(detail.found, true);
  if (detail.found) assert.deepEqual(detail.detail.deltaLog, [{ revision: 1, payload: { kind: 'x' } }]);
  assert.deepEqual(withSharedSessions({ takeover: true }, list), { takeover: true, sharedSessions: list });
});
