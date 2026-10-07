import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EditorBrokerService,
  FixedClock,
  InMemoryEditorSessionStore,
  KdenliveFixtureAdapter,
  MysteryAppFixtureAdapter,
  parseEditOperation,
  sha256EditorHash,
} from "../src/contract.js";
import {
  ArtifactGraphService,
  InMemoryArtifactBlobStore,
  sha256Text,
} from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { EditorBrokerDeps } from "../src/contract.js";

/**
 * editors + artifacts round-trip integration (work order B2):
 * export a project revision, open an editor session on it, edit in the
 * external editor, reconcile — the canonical chain grows with an
 * EditDelta, the parent (checkpoint) revision stays readable, and an
 * unknown-format import never touches canonical history.
 */

const policy: PolicySet = {
  rights: { holders: ["holder:integration"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:integration",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

test("round-trip: open -> edit -> reconcile produces a new revision + delta with preserved parent", async () => {
  const clock = new FixedClock("2026-02-03T00:00:00.000Z");
  const artifacts = new ArtifactGraphService(clock);
  const blobs = new InMemoryArtifactBlobStore();

  // 1. a canonical artifact with its first (exported) revision
  await artifacts.recordArtifact({
    artifactId: "art:rt",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const exportedProject = { clips: [{ start: 0, end: 42 }], tracks: 2 };
  const exportedHash = await blobs.put(new TextEncoder().encode(JSON.stringify(exportedProject)));
  const r1 = await artifacts.commitRevision({
    artifactId: "art:rt",
    revisionId: "rev:rt-1",
    contentHash: exportedHash,
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });

  // 2. the broker resolves kdenlive for a round-trip edit
  const broker = new EditorBrokerService({
    clock,
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
  } satisfies EditorBrokerDeps);
  const resolution = await broker.resolveEditor({
    revisionId: r1.revisionId,
    operation: "round-trip",
    userPreference: "kdenlive",
    availability: [
      {
        editorId: "kdenlive",
        version: "24.08.0",
        integrationLevel: 2,
        projectFormat: "kdenlive",
        licensing: "GPL-3.0",
      },
      { editorId: "mystery-app", integrationLevel: 1, licensing: "proprietary-fixture" },
    ],
  });
  assert.equal(resolution.editorId, "kdenlive");

  // 3. open a session on the exported revision (checkpoint = r1)
  const session = await broker.openSession({
    revisionId: r1.revisionId,
    editorId: resolution.editorId,
    mode: "local",
    policy,
  });
  assert.equal(session.revisionId, r1.revisionId);

  // 4. the user edits the project in the external editor and saves
  const editedProject = { clips: [{ start: 0, end: 90 }], tracks: 2 };
  const changedProjectHash = await blobs.put(
    new TextEncoder().encode(JSON.stringify(editedProject)),
  );
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash,
    externalTool: { name: "kdenlive", version: "24.08.0" },
    projectFormat: "kdenlive",
    projectState: editedProject,
  });

  // 5. a NEW revision with parent = checkpoint; history preserved
  assert.equal(result.understood, true);
  const r2 = result.revision;
  assert.equal(r2.parentRevisionId, r1.revisionId);
  assert.equal(r2.artifactId, "art:rt");
  assert.equal(r2.contentHash, changedProjectHash);
  assert.equal(r2.provenance.sourceKind, "editor-session");
  assert.equal(r2.provenance.sourceRef, session.editorSessionId);
  assert.equal((await artifacts.readRevision(r1.revisionId))?.revisionId, "rev:rt-1");
  assert.deepEqual(
    (await artifacts.lineage("art:rt")).map((revision) => revision.revisionId),
    ["rev:rt-1", r2.revisionId],
  );
  // the delta describes the changed project with typed operations
  assert.equal(result.delta.fromRevisionId, r1.revisionId);
  assert.equal(result.delta.toRevisionId, r2.revisionId);
  assert.deepEqual(
    result.delta.operations.map((operation) => parseEditOperation(operation)?.path),
    ["/clips", "/tracks"],
  );
  assert.equal(result.delta.editor, "kdenlive");
  assert.equal(result.delta.editorVersion, "24.08.0");

  // 6. a second save in the same session grows the chain from the new head
  clock.advance(60_000);
  const editedAgain = { clips: [{ start: 0, end: 90 }], tracks: 4 };
  const secondHash = await blobs.put(new TextEncoder().encode(JSON.stringify(editedAgain)));
  const second = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash: secondHash,
    externalTool: { name: "kdenlive", version: "24.08.0" },
    projectFormat: "kdenlive",
    projectState: editedAgain,
  });
  assert.equal(second.revision.parentRevisionId, r2.revisionId); // chain grows
  assert.deepEqual(
    (await artifacts.lineage("art:rt")).map((revision) => revision.revisionId),
    ["rev:rt-1", r2.revisionId, second.revision.revisionId],
  );
});

test("round-trip: unknown project format imports opaquely, canonical history untouched", async () => {
  const clock = new FixedClock("2026-02-03T00:00:00.000Z");
  const artifacts = new ArtifactGraphService(clock);
  await artifacts.recordArtifact({
    artifactId: "art:rt2",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const r1 = await artifacts.commitRevision({
    artifactId: "art:rt2",
    revisionId: "rev:rt2-1",
    contentHash: sha256Text("exported-project"),
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });

  const broker = new EditorBrokerService({
    clock,
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
  } satisfies EditorBrokerDeps);
  const session = await broker.openSession({
    revisionId: r1.revisionId,
    editorId: "mystery-app",
    mode: "external",
    policy,
  });
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash: sha256Text("mystery-project-bytes"),
    externalTool: { name: "mystery-app", version: "0.1.0" },
    projectFormat: "mystery-project",
  });

  assert.equal(result.understood, false);
  assert.notEqual(result.revision.artifactId, "art:rt2");
  assert.equal(result.revision.parentRevisionId, undefined); // own first revision
  assert.deepEqual(result.delta.operations, []); // no granular claims
  // the canonical artifact keeps exactly its original single revision
  assert.deepEqual(
    (await artifacts.lineage("art:rt2")).map((revision) => revision.revisionId),
    ["rev:rt2-1"],
  );
  assert.equal(
    (await artifacts.readRevision("rev:rt2-1"))?.contentHash,
    sha256Text("exported-project"),
  );
});
