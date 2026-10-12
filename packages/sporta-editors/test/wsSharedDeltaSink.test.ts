/**
 * w6c-1 REAL test lane: real loopback TCP, real RFC 6455 handshake, real frames. No mock sockets.
 * Port 0 → OS-assigned; the ACTUAL port is read back and used (packet law).
 *
 * Station re-seam (TL, appendix-B2 drift resolution): the service lane below
 * uses the REAL SharedEditorSessionService surface — openSharedSession /
 * joinSharedSession / broadcastDelta over the full real broker + artifacts
 * stack — with the sink wired through the frozen `deltaSink` dep. The client
 * receives the frozen delivery JSON (sessionId + ordered entry + recipients).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WsSharedDeltaSink } from '../src/adapters/wsSharedDeltaSink/wsSharedDeltaSink.js';
import { connectWs } from '../src/adapters/wsSharedDeltaSink/wsClient.js';
import { SharedEditorSessionService } from '../src/app/SharedEditorSessionService.js';
import { FsSharedSessionStore } from '../src/adapters/FsSharedSessionStore.js';
import { EditorBrokerService } from '../src/app/EditorBrokerService.js';
import { InMemoryEditorSessionStore } from '../src/adapters/InMemoryEditorSessionStore.js';
import { FsEditorSessionHistoryStore } from '../src/adapters/FsEditorSessionHistoryStore.js';
import { KdenliveAdapter } from '../src/adapters/KdenliveAdapter.js';
import { FixedClock } from '../src/adapters/clock.js';
import { sha256EditorHash } from '../src/adapters/hash.js';
import { serializeEditOperation } from '../src/domain/operations.js';
import { ArtifactGraphService, FsArtifactBlobStore } from '@sporta/artifacts/contract';
import type { PolicySet, ProvenanceDescriptor } from '@sporta/contracts/contract';
import type { KdenliveProjectState } from '../src/adapters/KdenliveAdapter.js';

const PATH = '/shared-deltas';

const POLICY: PolicySet = {
  rights: { holders: ['holder:w6c-sink'], usages: ['render', 'edit', 'derive'], prohibitions: [] },
  privacy: { visibility: 'tenant', exportableFields: [] },
  retention: { disposition: 'retain' },
};

const PROVENANCE: ProvenanceDescriptor = {
  sourceKind: 'agent-run',
  sourceRef: 'run:w6c-sink',
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

test('w6c-1 REAL: port 0 binds an OS-assigned port and the sink reports it back', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH });
  try {
    const actualPort = await sink.listen(0);
    assert.ok(Number.isInteger(actualPort) && actualPort > 0);
    assert.equal(sink.port, actualPort);
    assert.equal(sink.clientCount, 0);
  } finally {
    await sink.close();
  }
});

test('w6c-1 REAL: client over a real socket receives the EXACT serialized delta bytes; receipt is exact', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH });
  try {
    const port = await sink.listen(0);
    const client = await connectWs({ host: '127.0.0.1', port, path: PATH });
    assert.equal(sink.clientCount, 1);
    const serialized = JSON.stringify({
      sessionId: 's-1',
      revision: 7,
      payload: { kind: 'cell-edit', path: 'score:1:points', value: 'grün ♥ unicode' },
    });
    const receipt = await sink.deliver(serialized);
    assert.equal(receipt.attempted, 1);
    assert.equal(receipt.delivered, 1);
    assert.equal(receipt.records.length, 1);
    assert.equal(receipt.records[0].ok, true);
    const received = await client.waitForMessage(undefined, 2000);
    assert.equal(received, serialized); // exact bytes over the wire
    assert.equal(sink.receiptsFor(receipt.records[0].clientId).length, 1);
    await client.close(1000);
    await client.waitForClose(2000);
    assert.equal(client.serverClose?.code, 1000); // the server echoed our close
  } finally {
    await sink.close();
  }
});

test('w6c-1 REAL: fan-out to two real clients; per-client receipts for both', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH });
  try {
    const port = await sink.listen(0);
    const clientA = await connectWs({ host: '127.0.0.1', port, path: PATH });
    const clientB = await connectWs({ host: '127.0.0.1', port, path: PATH });
    assert.equal(sink.clientCount, 2);
    const serialized = JSON.stringify({ sessionId: 's-1', revision: 2, payload: { kind: 'cell-edit' } });
    const receipt = await sink.deliver(serialized);
    assert.equal(receipt.attempted, 2);
    assert.equal(receipt.delivered, 2);
    assert.deepEqual(new Set(receipt.records.map((r) => r.clientId)), new Set(sink.clientIds()));
    assert.equal((await clientA.waitForMessage(undefined, 2000)), serialized);
    assert.equal((await clientB.waitForMessage(undefined, 2000)), serialized);
    for (const clientId of sink.clientIds()) assert.equal(sink.receiptsFor(clientId).length, 1);
  } finally {
    await sink.close();
  }
});

test('w6c-1 REAL: zero connected clients → zero deliveries, not an error', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH });
  try {
    await sink.listen(0);
    const receipt = await sink.deliver('{"anything":true}');
    assert.equal(receipt.attempted, 0);
    assert.equal(receipt.delivered, 0);
    assert.deepEqual([...receipt.records], []);
  } finally {
    await sink.close();
  }
});

test('w6c-1 REAL: large delta travels via the 64-bit length path; ping/pong keepalive works', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH });
  try {
    const port = await sink.listen(0);
    const client = await connectWs({ host: '127.0.0.1', port, path: PATH });
    const serialized = JSON.stringify({ sessionId: 's-1', revision: 1, payload: { blob: 'x'.repeat(70_000) } });
    const receipt = await sink.deliver(serialized);
    assert.equal(receipt.delivered, 1);
    assert.equal(await client.waitForMessage(undefined, 2000), serialized);
    await client.ping(); // resolves only on a real pong over the real socket
  } finally {
    await sink.close();
  }
});

test('w6c-1 REAL: broadcast through the REAL SharedEditorSessionService with the sink wired — the delta survives the full path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'w6c-sink-svc-'));
  const sink = new WsSharedDeltaSink({ path: PATH });
  try {
    const port = await sink.listen(0);
    const client = await connectWs({ host: '127.0.0.1', port, path: PATH });
    // the REAL frozen service stack (station re-seam: full deps, real broker + artifacts)
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
    const store = new FsSharedSessionStore(join(dir, 'shared-sessions'));
    const service = new SharedEditorSessionService({
      clock,
      hash: sha256EditorHash,
      broker,
      artifactGraph: artifacts,
      sharedSessionStore: store,
      deltaSink: sink,
    });
    const initialState: KdenliveProjectState = kdenlive.parseKdenliveXml(INITIAL_MLT_XML);
    const initialHash = await blobs.put(new TextEncoder().encode(kdenlive.exportToKdenliveXml(initialState)));
    await artifacts.recordArtifact({
      artifactId: 'art:w6c-sink',
      kind: 'tactical-board-video',
      editability: 'editable',
      policy: POLICY,
    });
    const r1 = await artifacts.commitRevision({
      artifactId: 'art:w6c-sink',
      revisionId: 'rev:w6c-sink-1',
      contentHash: initialHash,
      toolVersions: ['sporta-render@0'],
      provenance: PROVENANCE,
      policy: POLICY,
    });
    const { sessionId } = await service.openSharedSession({
      sessionId: 'ss:w6c-sink-1',
      revisionId: r1.revisionId,
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
      participantId: 'participant-a',
      capabilities: ['timeline'],
      usage: { usages: ['edit'] },
    });
    const operation = serializeEditOperation({ kind: 'set', path: '/mlt/attributes/title', valueHash: sha256EditorHash('Match 7 — Live') });
    const receipt = await service.broadcastDelta({
      sessionId,
      participantId: 'participant-a',
      baseRevisionId: r1.revisionId,
      operations: [operation],
    });
    const received = await client.waitForMessage(undefined, 2000);
    const delivery = JSON.parse(received) as {
      sessionId: string;
      entry: typeof receipt.entry;
      recipients: readonly string[];
    };
    assert.equal(delivery.sessionId, sessionId);
    assert.deepEqual(delivery.entry, JSON.parse(JSON.stringify(receipt.entry))); // exact ordered entry over the wire
    assert.deepEqual(delivery.entry.operations, [operation]);
    assert.ok(delivery.recipients.includes('participant-a')); // live fan-out recipients
    assert.equal(sink.receiptsFor(sink.clientIds()[0] ?? '').length, 1); // exact receipt accounting
    await client.close(1000);
  } finally {
    await sink.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('w6c-1 REAL: sink.close() closes every connected client cleanly with 1001', async () => {
  const sink = new WsSharedDeltaSink({ path: PATH });
  const port = await sink.listen(0);
  const clientA = await connectWs({ host: '127.0.0.1', port, path: PATH });
  const clientB = await connectWs({ host: '127.0.0.1', port, path: PATH });
  const closing = Promise.all([clientA.waitForClose(2000), clientB.waitForClose(2000)]);
  await sink.close();
  await closing; // FIX (resumption re-verify): dead destructure removed
  assert.equal(clientA.serverClose?.code, 1001);
  assert.equal(clientB.serverClose?.code, 1001);
  assert.equal(sink.clientCount, 0);
});
