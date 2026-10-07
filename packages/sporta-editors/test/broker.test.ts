import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EditorBrokerService,
  EditorResolutionError,
  EditorRightsRefusalError,
  FixedClock,
  InMemoryEditorSessionStore,
  KdenliveFixtureAdapter,
  MysteryAppFixtureAdapter,
  UnknownEditorError,
  UnknownEditorSessionError,
  UnknownRevisionError,
  parseEditOperation,
  serializeEditOperation,
  sha256EditorHash,
} from "../src/contract.js";
import { ArtifactGraphService } from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { EditorAvailability, EditorBrokerDeps } from "../src/contract.js";

const policy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const noEditPolicy: PolicySet = {
  rights: { holders: ["holder:test"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:test",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

const kdenlive: EditorAvailability = {
  editorId: "kdenlive",
  version: "24.08.0",
  integrationLevel: 2,
  projectFormat: "kdenlive",
  licensing: "GPL-3.0",
};

const blender: EditorAvailability = {
  editorId: "blender",
  version: "4.2.0",
  integrationLevel: 3,
  projectFormat: "blend",
  licensing: "GPL-3.0",
};

const exportOnly: EditorAvailability = {
  editorId: "export-tool",
  integrationLevel: 1,
  licensing: "MIT",
};

function fixtureBroker(): {
  broker: EditorBrokerService;
  artifacts: ArtifactGraphService;
  store: InMemoryEditorSessionStore;
} {
  const artifacts = new ArtifactGraphService(new FixedClock("2026-02-01T00:00:00.000Z"));
  const store = new InMemoryEditorSessionStore();
  const deps: EditorBrokerDeps = {
    clock: new FixedClock("2026-02-02T00:00:00.000Z"),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: store,
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
  };
  return { broker: new EditorBrokerService(deps), artifacts, store };
}

async function seedRevision(artifacts: ArtifactGraphService): Promise<string> {
  await artifacts.recordArtifact({
    artifactId: "art:broker",
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const revision = await artifacts.commitRevision({
    artifactId: "art:broker",
    revisionId: "rev:broker-1",
    contentHash: "ab" + "00".repeat(31),
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });
  return revision.revisionId;
}

test("resolveEditor requires integration level 2 for round-trip (export-only refused)", async () => {
  const { broker } = fixtureBroker();
  await assert.rejects(
    () =>
      broker.resolveEditor({
        revisionId: "rev:broker-1",
        operation: "round-trip",
        availability: [exportOnly],
      }),
    (error: unknown) => error instanceof EditorResolutionError,
  );
});

test("resolveEditor accepts a level-1 editor for export", async () => {
  const { broker } = fixtureBroker();
  const resolution = await broker.resolveEditor({
    revisionId: "rev:broker-1",
    operation: "export",
    availability: [exportOnly],
  });
  assert.equal(resolution.editorId, "export-tool");
  assert.match(resolution.rationale, /export/);
});

test("resolveEditor refuses ineligible licenses (reserved rights, unknown license)", async () => {
  const { broker } = fixtureBroker();
  await assert.rejects(
    () =>
      broker.resolveEditor({
        revisionId: "rev:broker-1",
        operation: "edit",
        availability: [
          { editorId: "reserved", integrationLevel: 3, licensing: "All Rights Reserved" },
          { editorId: "unknown-license", integrationLevel: 3, licensing: "mystery-license-7" },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof EditorResolutionError);
      assert.ok(error instanceof Error);
      assert.match(error.detail, /unknown-license/);
      return true;
    },
  );
});

test("resolveEditor: no-derivatives licenses permit export but refuse round-trip", async () => {
  const { broker } = fixtureBroker();
  const ndEditor: EditorAvailability = {
    editorId: "nd-editor",
    integrationLevel: 2,
    licensing: "CC-BY-ND-4.0",
  };
  const forExport = await broker.resolveEditor({
    revisionId: "rev:broker-1",
    operation: "export",
    availability: [ndEditor],
  });
  assert.equal(forExport.editorId, "nd-editor");
  await assert.rejects(
    () =>
      broker.resolveEditor({
        revisionId: "rev:broker-1",
        operation: "round-trip",
        availability: [ndEditor],
      }),
    (error: unknown) => error instanceof EditorResolutionError,
  );
});

test("resolveEditor honors an eligible user preference with a rationale", async () => {
  const { broker } = fixtureBroker();
  const resolution = await broker.resolveEditor({
    revisionId: "rev:broker-1",
    operation: "round-trip",
    userPreference: "kdenlive",
    availability: [blender, kdenlive],
  });
  assert.equal(resolution.editorId, "kdenlive");
  assert.match(resolution.rationale, /user preference "kdenlive" honored/);
  assert.match(resolution.rationale, /GPL-3\.0/);
});

test("resolveEditor picks the highest integration level deterministically (ties by id)", async () => {
  const { broker } = fixtureBroker();
  const first = await broker.resolveEditor({
    revisionId: "rev:broker-1",
    operation: "round-trip",
    availability: [kdenlive, blender],
  });
  assert.equal(first.editorId, "blender"); // level 3 beats level 2
  const tie = await broker.resolveEditor({
    revisionId: "rev:broker-1",
    operation: "round-trip",
    availability: [blender, { ...kdenlive, integrationLevel: 3 }],
  });
  assert.equal(tie.editorId, "blender"); // level tie -> ascending editorId
  assert.match(tie.rationale, /deterministic choice/);
});

test("openSession REFUSES when rights lack the edit usage (typed refusal)", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts);
  await assert.rejects(
    () =>
      broker.openSession({
        revisionId,
        editorId: "kdenlive",
        mode: "local",
        policy: noEditPolicy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof EditorRightsRefusalError);
      assert.match(error.detail, /usages=\[render\]/);
      return true;
    },
  );
});

test("openSession REFUSES an unknown revision and an unknown editor (typed)", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts);
  await assert.rejects(
    () =>
      broker.openSession({
        revisionId: "rev:missing",
        editorId: "kdenlive",
        mode: "local",
        policy,
      }),
    (error: unknown) => error instanceof UnknownRevisionError,
  );
  await assert.rejects(
    () =>
      broker.openSession({
        revisionId,
        editorId: "not-registered",
        mode: "local",
        policy,
      }),
    (error: unknown) => error instanceof UnknownEditorError,
  );
});

test("openSession creates a checkpointed session record and is idempotent", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts);
  const session = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:broker-1",
  });
  assert.equal(session.editorSessionId, "es:broker-1");
  assert.equal(session.revisionId, revisionId); // the checkpoint
  assert.equal(session.integrationLevel, 2);
  assert.equal(session.openedAt, "2026-02-02T00:00:00.000Z");
  const retry = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "remote", // fields differ on retry — first write wins
    policy,
    editorSessionId: "es:broker-1",
  });
  assert.deepEqual(retry, session);
});

test("reconcileSession REFUSES an unknown session (typed)", async () => {
  const { broker } = fixtureBroker();
  await assert.rejects(
    () =>
      broker.reconcileSession({
        editorSessionId: "es:missing",
        changedProjectHash: "ff" + "00".repeat(31),
        externalTool: { name: "kdenlive", version: "24.08.0" },
      }),
    (error: unknown) => error instanceof UnknownEditorSessionError,
  );
});

test("reconcile of a KNOWN format commits a NEW revision with the checkpoint as parent", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts);
  const session = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
  });
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash: "cd" + "00".repeat(31),
    externalTool: { name: "kdenlive", version: "24.08.0" },
    projectFormat: "kdenlive",
    projectState: { clips: [1, 2], tracks: 2 },
  });
  assert.equal(result.understood, true);
  assert.notEqual(result.revision.revisionId, revisionId);
  assert.equal(result.revision.parentRevisionId, revisionId); // parent = checkpoint
  assert.equal(result.revision.artifactId, "art:broker");
  assert.equal(result.revision.contentHash, "cd" + "00".repeat(31));
  assert.deepEqual(result.revision.toolVersions, ["kdenlive@24.08.0"]);
  // history preserved: the old revision is still readable, chain grew
  assert.notEqual(await artifacts.readRevision(revisionId), null);
  assert.equal((await artifacts.lineage("art:broker")).length, 2);
  // the delta carries typed operations with editor provenance
  assert.equal(result.delta.fromRevisionId, revisionId);
  assert.equal(result.delta.toRevisionId, result.revision.revisionId);
  assert.equal(result.delta.editor, "kdenlive");
  assert.equal(result.delta.operations.length, 2);
  const operations = result.delta.operations.map(parseEditOperation);
  assert.deepEqual(
    operations.map((operation) => operation?.kind),
    ["set", "set"],
  );
  assert.deepEqual(
    operations.map((operation) => operation?.path),
    ["/clips", "/tracks"],
  );
  assert.equal(result.delta.provenance.sourceKind, "editor-session");
});

test("reconcile retry is idempotent: identical result, no duplicate revision", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts);
  const session = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
  });
  const input = {
    editorSessionId: session.editorSessionId,
    changedProjectHash: "cd" + "00".repeat(31),
    externalTool: { name: "kdenlive", version: "24.08.0" },
    projectFormat: "kdenlive",
    projectState: { clips: [1, 2], tracks: 2 },
  };
  const first = await broker.reconcileSession(input);
  const retry = await broker.reconcileSession(input);
  assert.deepEqual(retry, first);
  assert.equal((await artifacts.lineage("art:broker")).length, 2);
});

test("reconcile of an UNKNOWN format imports an OPAQUE revision, history preserved", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts);
  const session = await broker.openSession({
    revisionId,
    editorId: "mystery-app",
    mode: "external",
    policy,
  });
  const result = await broker.reconcileSession({
    editorSessionId: session.editorSessionId,
    changedProjectHash: "ef" + "00".repeat(31),
    externalTool: { name: "mystery-app", version: "0.1.0" },
    projectFormat: "mystery-project",
    projectState: { anything: true },
  });
  assert.equal(result.understood, false);
  // a NEW opaque artifact with its own first revision — NOT a child of the
  // canonical checkpoint (canonical history untouched)
  assert.notEqual(result.revision.artifactId, "art:broker");
  assert.equal(result.revision.parentRevisionId, undefined);
  const importedArtifact = artifacts.readArtifact(result.revision.artifactId);
  assert.equal(importedArtifact?.editability, "opaque");
  assert.match(importedArtifact?.kind ?? "", /^imported-project:mystery-project$/);
  // the original lineage is untouched and still readable
  const lineage = await artifacts.lineage("art:broker");
  assert.equal(lineage.length, 1);
  assert.deepEqual(await artifacts.readRevision(revisionId), lineage[0]);
  // the opaque delta claims NO granular operations
  assert.deepEqual(result.delta.operations, []);
  assert.equal(result.delta.fromRevisionId, revisionId);
  assert.equal(result.delta.provenance.sourceKind, "editor-session");
});

test("serializeEditOperation/parseEditOperation round-trip losslessly", () => {
  const cases = [
    { kind: "set", path: "/clips/0", valueHash: "ab" + "00".repeat(31) },
    { kind: "insert", path: "/tracks/2" },
    { kind: "delete", path: "/effects/3" },
    { kind: "move", path: "/clips/0", valueHash: "cd" + "00".repeat(31) },
  ] as const;
  for (const operation of cases) {
    assert.deepEqual(parseEditOperation(serializeEditOperation(operation)), operation);
  }
  assert.equal(parseEditOperation("nonsense"), null);
  assert.equal(parseEditOperation("set"), null);
  assert.equal(parseEditOperation("explode /a /b /c"), null);
});
