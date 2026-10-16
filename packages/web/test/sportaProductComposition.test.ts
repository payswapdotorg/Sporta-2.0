/**
 * sportaProductComposition.test.ts — the W12-D TL integration wiring law
 * (node:test + tsx, CSS-free: productComposition.ts imports no styles).
 *
 * What this proves: the headless REAL composition composes the three W12
 * lanes' REAL hosts over ONE wiring point, and REAL data driven through
 * the composition's services projects VERBATIM through every host —
 * runs (W12-A), library (W12-A), my-pipelines (W12-B), connected-apps
 * (W12-C) — with the honest gradeNotes carried, never re-badged.
 *
 * The app.tsx optional-port law (absent = fixture, present = REAL) is
 * BUILD-verified (tsc) + journey-verified (the browser lane); this node
 * test proves the composition the ports carry.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Sha256TransformHash,
  jsonEventStreamTrimComponent,
} from "@sporta/transforms/contract";
import type { TransformNode, TransformPipelineManifest } from "@sporta/transforms/contract";
import { createSportaProductComposition } from "../src/sporta/product/productComposition.js";
import type { SportaProductComposition } from "../src/sporta/product/productComposition.js";
import { RUNS_LEDGER_GRADE_NOTE } from "../src/sporta/runs/runsRealHost.js";
import { LIBRARY_REGISTRY_GRADE_NOTE } from "../src/sporta/library/libraryRealHost.js";
import { MY_PIPELINES_STORE_GRADE_NOTE } from "../src/sporta/marketplace/myPipelinesRealHost.js";
import { APPS_STORE_GRADE_NOTE } from "../src/sporta/apps/appsRealHost.js";
import { studioSeedDescriptor } from "../src/sporta/studioSeeds.js";
import { STUDIO_WORKSPACE } from "../src/sporta/studioSeeds.js";

const CREATOR = "publisher:w12d-test";
const PINNED = "sha256:" + "ab".repeat(32);
const STREAM = {
  name: "events",
  dataKind: "sporta/json-event-stream",
  required: true,
  cardinality: "stream" as const,
};

const trimComponent = jsonEventStreamTrimComponent(new Sha256TransformHash());

function trimNode(): TransformNode {
  return {
    nodeId: "node:trim",
    kind: "deterministic-filter",
    componentRef: {
      kind: "deterministic-filter",
      digest: trimComponent.digest,
      name: trimComponent.name,
    },
    inputs: [STREAM],
    outputs: [STREAM],
    parameterSchema: {
      startMs: { type: "number", required: true, minimum: 0 },
      endMs: { type: "number", required: true, minimum: 0 },
    },
    requiredPermissions: [],
    sandbox: { kind: "process", networkEgress: "denied", hostSecretAccess: false },
    resources: {
      timeoutMs: 15_000,
      maxOutputBytes: 1_000_000,
      cpuClass: "light",
      memoryMiB: 256,
    },
    errorBehavior: {
      mode: "fail-closed",
      contract: "out-of-window or malformed input fails closed",
    },
    provenanceRules: ["kept events carry input provenance unchanged"],
  };
}

function testManifest(pipelineId: string): TransformPipelineManifest {
  return {
    pipelineId,
    version: "1.0.0",
    manifestDigest: PINNED,
    publisher: CREATOR,
    purpose: "w12d composition battery",
    limitations: ["test only"],
    inputs: [STREAM],
    outputs: [STREAM],
    nodes: [trimNode()],
    edges: [],
    semantics: {
      preservationClaims: ["event identity and order unchanged for kept events"],
      declaredChanges: ["events outside the window are dropped (counted)"],
      measurement: { evidenceKind: "structural", benchmarkIds: [] },
    },
    expectedOutputs: ["trimmed event stream"],
    pinnedDependencies: [],
    licensing: { license: "MIT", provenance: "test" },
    policy: {
      rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
      privacy: { visibility: "tenant", exportableFields: [] },
      retention: { disposition: "retain" },
    },
    cancellation: { supportsCheckpoint: false, contract: "cancel aborts before write" },
    expectations: {
      typicalLatencyMs: 500,
      declaredThroughput: "single stream",
      evidenceGrade: "fixture",
    },
  };
}

function eventStreamBytes(): Uint8Array {
  const events = [0, 1, 2, 3, 4].map((index) => ({
    eventId: `evt-${index + 1}`,
    entityId: index % 2 === 0 ? "team-A" : "team-B",
    atMs: 1000 + index * 1000,
    confidence: 0.3 + index / 10,
    provenance: {
      sourceKind: "observation",
      sourceRef: `source:${index + 1}`,
      capturedAt: "2026-10-13T00:00:00.000Z",
    },
  }));
  return new TextEncoder().encode(
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  );
}

/** One composition per temp dir (the sportaHost.test.ts teardown precedent). */
async function withComposition(
  run: (composition: SportaProductComposition) => Promise<void> | void,
): Promise<void> {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-product-w12d-"));
  try {
    await run(createSportaProductComposition({ blobRoot }));
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
}

test("W12D-1 the composition's four hosts are REAL with their lane gradeNotes verbatim (never re-badged)", async () => {
  await withComposition((composition) => {
    assert.equal(composition.runs.backing, "real");
    assert.equal(composition.runs.gradeNote, RUNS_LEDGER_GRADE_NOTE);
    assert.equal(composition.library.backing, "real");
    assert.equal(composition.library.gradeNote, LIBRARY_REGISTRY_GRADE_NOTE);
    assert.equal(composition.myPipelines.backing, "real");
    assert.equal(composition.myPipelines.gradeNote, MY_PIPELINES_STORE_GRADE_NOTE);
    assert.equal(composition.connectedApps.backing, "real");
    assert.equal(composition.connectedApps.gradeNote, APPS_STORE_GRADE_NOTE);
    for (const note of [
      composition.runs.gradeNote,
      composition.library.gradeNote,
      composition.myPipelines.gradeNote,
      composition.connectedApps.gradeNote,
    ]) {
      assert.match(note, /BACKING: REAL/, "the host grade is REAL");
      assert.match(note, /fixture-grade/, "the store honesty label carries");
      assert.doesNotMatch(note, /production|real-local-live/, "never inflated");
    }
  });
});

test("W12D-2 a REAL run driven through the composition's run service projects through the runs host (W12-A)", async () => {
  await withComposition(async (composition) => {
    const manifest = await composition.services.runService.runPipeline({
      manifest: testManifest("pipe:w12d-run"),
      workGraph: { workGraphId: "wg:w12d", runRef: "run:w12d-1" },
      parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
      inputs: [{
        artifactRef: "art:w12d-feed",
        rightsSnapshot: "rights:w12d-operator",
        bytes: eventStreamBytes(),
        provenance: {
          sourceKind: "authorized-source",
          sourceRef: "source:w12d",
          capturedAt: "2026-10-13T00:00:00.000Z",
          confidence: 0.95,
        },
      }],
      releaseDigest: `sha256:${"a".repeat(63)}1`,
    });
    assert.equal(manifest.steps[0]!.status, "succeeded", "the REAL run succeeded");

    const listed = await composition.runs.listRuns();
    assert.equal(listed.length, 1, "the REAL ledger projects through the host");
    const read = await composition.runs.readRun(manifest.runManifestId);
    assert.deepEqual(read, listed[0], "listRuns and readRun agree (the host owns no state)");
    assert.equal(read.runManifestId, manifest.runManifestId, "the run id projects verbatim");
  });
});

test("W12D-3 a REAL artifact revision driven through the artifact graph projects through the library host (W12-A)", async () => {
  await withComposition(async (composition) => {
    const { artifacts } = composition.services;
    await artifacts.recordArtifact({
      artifactId: "art:w12d-library",
      kind: "tactical-board-video",
      editability: "editable",
      policy: {
        rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
        privacy: { visibility: "tenant", exportableFields: [] },
        retention: { disposition: "retain" },
      },
    });
    await artifacts.commitRevision({
      artifactId: "art:w12d-library",
      revisionId: "rev:w12d-1",
      contentHash: "sha256:" + "cd".repeat(32),
      organizationVersion: { organizationId: "org:w12d", version: 1 },
      toolVersions: ["sporta@w12d"],
      provenance: {
        sourceKind: "agent-run",
        sourceRef: "run:w12d-1",
        capturedAt: "2026-10-13T00:00:00.000Z",
      },
      policy: {
        rights: { holders: ["holder:test"], usages: ["render", "derive"], prohibitions: [] },
        privacy: { visibility: "tenant", exportableFields: [] },
        retention: { disposition: "retain" },
      },
    });

    const listed = await composition.library.listArtifacts();
    assert.equal(listed.length, 1, "the REAL registry projects through the host");
    assert.equal(listed[0]!.artifactId, "art:w12d-library");
    const detail = await composition.library.readArtifact("art:w12d-library");
    assert.ok(detail, "the point read projects the lineage");
  });
});

test("W12D-4 REAL candidates driven through the submission service project through the my-pipelines host (W12-B)", async () => {
  await withComposition(async (composition) => {
    const { submission } = composition.services;
    const draftManifest = testManifest("pipe:w12d-draft");
    const submittedManifest = testManifest("pipe:w12d-submitted");
    const draft = submission.startDraft({
      pipelineId: draftManifest.pipelineId,
      version: draftManifest.version,
      manifestDigest: draftManifest.manifestDigest,
      contentHashes: [{ kind: "code", digest: "sha256:" + "0a".repeat(32) }],
      attestations: [],
      submittedBy: CREATOR,
    });
    assert.equal(draft.lifecycle, "DRAFT");
    submission.submitCandidate(
      submission.startDraft({
        pipelineId: submittedManifest.pipelineId,
        version: submittedManifest.version,
        manifestDigest: submittedManifest.manifestDigest,
        contentHashes: [{ kind: "code", digest: "sha256:" + "0b".repeat(32) }],
        attestations: [],
        submittedBy: CREATOR,
      }).candidateId,
    );

    const rows = await composition.myPipelines.listCreatorRecords(CREATOR);
    assert.equal(rows.length, 2, "draft + submitted both project");
    const states = rows.map((row) => row.status).sort();
    assert.ok(
      states.every((state) => state === "DRAFT" || state === "SUBMITTED"),
      `the lifecycle states project verbatim (got ${states.join(",")})`,
    );
    const other = await composition.myPipelines.listCreatorRecords("publisher:other");
    assert.equal(other.length, 0, "creator isolation holds through the composed query");
  });
});

test("W12D-5 a REAL attachment driven through the environment service projects through the connected-apps host + revoke (W12-C)", async () => {
  await withComposition(async (composition) => {
    const { environment } = composition.services;
    const descriptor = environment.registerDescriptor(studioSeedDescriptor(new Date().toISOString()));
    const attached = await environment.consentToAttach({
      attachmentId: "att:w12d-controller",
      descriptorId: descriptor.descriptorId,
      consentedBy: "user:operator",
      tenant: "tenant:operator",
      scope: { workspace: STUDIO_WORKSPACE, workGraphId: null },
      grantedCapabilityClasses: ["observe", "control"],
      expiresAt: "2026-11-13T12:00:00.000Z",
      policySnapshot: "policy:w12d-v1",
    });
    assert.ok(attached, "the REAL attach path consents");

    const views = await composition.connectedApps.listAttachments();
    assert.equal(views.length, 1, "the REAL attachment projects through the host");
    assert.equal(views[0]!.attachment.attachmentId, "att:w12d-controller");
    assert.equal(views[0]!.attachment.revokedAt, null, "honest null before any revoke");

    const revoked = await composition.connectedApps.revoke("att:w12d-controller");
    assert.ok(revoked.ok, "the ONE write path (revoke) succeeds through the host");
    const after = await composition.connectedApps.listAttachments();
    assert.ok(after[0]!.attachment.revokedAt !== null, "the honest revokedAt carries after revoke");
  });
});
