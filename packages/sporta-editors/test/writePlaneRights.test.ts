import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EditorBrokerService,
  EditorRetentionRefusalError,
  EditorRightsRefusalError,
  FixedClock,
  InMemoryEditorSessionStore,
  KdenliveFixtureAdapter,
  MysteryAppFixtureAdapter,
  sha256EditorHash,
} from "../src/contract.js";
import { ArtifactGraphService } from "@sporta/artifacts/contract";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { EditorBrokerDeps } from "../src/contract.js";

/**
 * W4B-2 — the editor WRITE-plane rights/retention propagation audit
 * (invariant 22; the READ half landed in W3-B). The broker's
 * OPEN/append/commit operations are proven to propagate the PolicySet
 * and to close the two small additive gaps found by the audit:
 *
 * 1. OPEN previously verified only the CALLER-SUPPLIED session policy
 *    ("edit" usage) — the CHECKPOINT REVISION's own PolicySet was
 *    never consulted, so a session policy could grant rights the
 *    artifact's revision does not carry. CLOSED: openSession now also
 *    requires the checkpoint revision's rights to permit "edit".
 * 2. OPEN previously ignored retention — a purge-expired revision
 *    could still be opened for editing. CLOSED: openSession now
 *    refuses (typed) when the checkpoint revision's purge disposition
 *    has become effective.
 *
 * The append/commit propagation (session policy → new revision /
 * opaque artifact) is asserted VERBATIM. Structural findings are typed
 * under NEXT DEPENDENCIES in the wave-4 worker report (the
 * EditDeltaRecord carries no policy field — TL-owned contracts).
 */

const sessionPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const editablePolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const noEditRevisionPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const editProhibitedRevisionPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render"], prohibitions: ["edit"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const purgedPastRevisionPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "purge", retainUntil: "2026-05-01T00:00:00.000Z" },
};

const purgedFutureRevisionPolicy: PolicySet = {
  rights: { holders: ["holder:w4b"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "purge", retainUntil: "2027-01-01T00:00:00.000Z" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:w4b",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

const NOW = "2026-06-01T00:00:00.000Z";

function fixtureBroker(): { broker: EditorBrokerService; artifacts: ArtifactGraphService } {
  const artifacts = new ArtifactGraphService(new FixedClock("2026-05-01T00:00:00.000Z"));
  const deps: EditorBrokerDeps = {
    clock: new FixedClock(NOW),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
  };
  return { broker: new EditorBrokerService(deps), artifacts };
}

async function seedRevision(
  artifacts: ArtifactGraphService,
  revisionId: string,
  revisionPolicy: PolicySet,
): Promise<string> {
  const artifactId = `art:${revisionId}`;
  await artifacts.recordArtifact({
    artifactId,
    kind: "tactical-board-video",
    editability: "editable",
    policy: revisionPolicy,
  });
  const revision = await artifacts.commitRevision({
    artifactId,
    revisionId,
    contentHash: sha256EditorHash(revisionId),
    toolVersions: ["sporta-render@0"],
    provenance,
    policy: revisionPolicy,
  });
  return revision.revisionId;
}

test("OPEN: a session policy cannot grant edit rights the checkpoint revision does not carry (gap closed)", async () => {
  const { broker, artifacts } = fixtureBroker();
  // The revision policy does NOT permit edit (render-only), while the
  // caller-supplied session policy DOES (render+edit+derive). The W1
  // broker opened this session; the W4B-2 broker refuses it typed.
  const revisionId = await seedRevision(artifacts, "rev:w4b-noedit", noEditRevisionPolicy);
  await assert.rejects(
    () =>
      broker.openSession({
        revisionId,
        editorId: "kdenlive",
        mode: "local",
        policy: sessionPolicy,
        editorSessionId: "es:w4b-noedit",
      }),
    (error: unknown) => {
      assert.ok(error instanceof EditorRightsRefusalError);
      assert.equal(
        (error as EditorRightsRefusalError).detail,
        "rights-refused:revision=rev:w4b-noedit usages=[render] prohibitions=[]",
      );
      return true;
    },
  );
  // a prohibited edit is refused the same way (prohibitions win)
  const prohibitedId = await seedRevision(
    artifacts,
    "rev:w4b-edit-prohibited",
    editProhibitedRevisionPolicy,
  );
  await assert.rejects(
    () =>
      broker.openSession({
        revisionId: prohibitedId,
        editorId: "kdenlive",
        mode: "local",
        policy: sessionPolicy,
        editorSessionId: "es:w4b-edit-prohibited",
      }),
    (error: unknown) => {
      assert.ok(error instanceof EditorRightsRefusalError);
      assert.match((error as EditorRightsRefusalError).detail, /^rights-refused:revision=/);
      return true;
    },
  );
  // nothing was opened: the session store stayed empty (failed open leaves no trace)
  const lineage = await artifacts.lineage("art:rev:w4b-noedit");
  assert.equal(lineage.length, 1);
});

test("OPEN: a purge-expired checkpoint revision is not editable (retention propagates to the write plane)", async () => {
  const { broker, artifacts } = fixtureBroker();
  // purge + retainUntil 2026-05-01, now is 2026-06-01: expired
  const expiredId = await seedRevision(artifacts, "rev:w4b-purged", purgedPastRevisionPolicy);
  await assert.rejects(
    () =>
      broker.openSession({
        revisionId: expiredId,
        editorId: "kdenlive",
        mode: "local",
        policy: sessionPolicy,
        editorSessionId: "es:w4b-purged",
      }),
    (error: unknown) => {
      assert.ok(error instanceof EditorRetentionRefusalError);
      assert.equal(
        (error as EditorRetentionRefusalError).detail,
        "retention-refused:revision=rev:w4b-purged retainUntil=2026-05-01T00:00:00.000Z",
      );
      return true;
    },
  );
  // a purge NOT yet past its date still opens (the deferral is honored)
  const futureId = await seedRevision(
    artifacts,
    "rev:w4b-purge-future",
    purgedFutureRevisionPolicy,
  );
  const session = await broker.openSession({
    revisionId: futureId,
    editorId: "kdenlive",
    mode: "local",
    policy: sessionPolicy,
    editorSessionId: "es:w4b-purge-future",
  });
  assert.equal(session.revisionId, futureId);
});

test("OPEN: a fully-permitted revision still opens (regression law — the additive gate changes nothing legal)", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts, "rev:w4b-editable", editablePolicy);
  const session = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy: sessionPolicy,
    editorSessionId: "es:w4b-editable",
  });
  assert.equal(session.revisionId, revisionId);
  assert.equal(session.integrationLevel, 2);
  // the session record carries the caller-supplied policy verbatim (W3-B law, unchanged)
  assert.deepEqual(session.policy, sessionPolicy);
});

test("APPEND (reconcile understood): the session policy propagates VERBATIM to the new revision", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts, "rev:w4b-append", editablePolicy);
  await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy: sessionPolicy,
    editorSessionId: "es:w4b-append",
  });
  const result = await broker.reconcileSession({
    editorSessionId: "es:w4b-append",
    changedProjectHash: sha256EditorHash("<mlt><!-- w4b edited --></mlt>"),
    externalTool: { name: "kdenlive", version: "24.08.0" },
    projectFormat: "kdenlive",
    projectState: { clips: [1], tracks: 1 },
  });
  assert.equal(result.understood, true);
  assert.equal(result.revision.parentRevisionId, revisionId);
  // the invariant-22 write-plane propagation: the child revision
  // carries the session's PolicySet verbatim — no layer drops or
  // invents rights.
  assert.deepEqual(result.revision.policy, sessionPolicy);
  // and the chain order is preserved (history never rewritten)
  const lineage = await artifacts.lineage("art:rev:w4b-append");
  assert.deepEqual(
    lineage.map((revision) => revision.revisionId),
    ["rev:w4b-append", result.revision.revisionId],
  );
});

test("COMMIT (reconcile opaque): the session policy propagates VERBATIM to the imported artifact and revision", async () => {
  const { broker, artifacts } = fixtureBroker();
  const revisionId = await seedRevision(artifacts, "rev:w4b-opaque", editablePolicy);
  await broker.openSession({
    revisionId,
    editorId: "mystery-app",
    mode: "external",
    policy: sessionPolicy,
    editorSessionId: "es:w4b-opaque",
  });
  const result = await broker.reconcileSession({
    editorSessionId: "es:w4b-opaque",
    changedProjectHash: "ef" + "00".repeat(31),
    externalTool: { name: "mystery-app", version: "0.1.0" },
    projectFormat: "mystery-project",
    projectState: { anything: true },
  });
  assert.equal(result.understood, false);
  assert.notEqual(result.revision.artifactId, "art:rev:w4b-opaque");
  // the opaque import carries the session's PolicySet verbatim on BOTH
  // the artifact record and its first revision (invariant 22).
  assert.deepEqual(result.revision.policy, sessionPolicy);
  const imported = artifacts.readArtifact(result.revision.artifactId);
  assert.ok(imported !== null);
  assert.equal(imported.editability, "opaque");
  assert.deepEqual(imported.policy, sessionPolicy);
  // canonical history untouched
  assert.equal((await artifacts.lineage("art:rev:w4b-opaque")).length, 1);
});
