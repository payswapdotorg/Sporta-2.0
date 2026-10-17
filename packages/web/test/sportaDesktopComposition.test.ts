/**
 * sportaDesktopComposition.test.ts — the W14 TL lane wiring law
 * (node:test + tsx, CSS-free).
 *
 * What this proves: the desktop composition mounts the W12-D product
 * composition + the W10A studio composition behind one boot point, the
 * demo seeds drive REAL lifecycles (a REAL child-process trim run on
 * real pipes, a REAL draft+submitted candidate pair, a REAL attached
 * app) that project through every screen host, the facts carry the
 * honest measured labels, and the renderer bridge (typed, browser-safe)
 * projects the port surface with error messages verbatim.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSportaDesktopComposition,
  DESKTOP_DEMO_CREATOR,
} from "../src/sporta/product/desktopComposition.js";
import type { SportaDesktopComposition } from "../src/sporta/product/desktopComposition.js";
import {
  createDesktopRealScreenPorts,
  createDesktopStudioHost,
  getSportaDesktopBridge,
} from "../src/sporta/product/desktopScreenBridge.js";
import type { SportaDesktopBridge } from "../src/sporta/product/desktopScreenBridge.js";
import { RUNS_LEDGER_GRADE_NOTE } from "../src/sporta/runs/runsRealHost.js";
import { LIBRARY_REGISTRY_GRADE_NOTE } from "../src/sporta/library/libraryRealHost.js";
import { MY_PIPELINES_STORE_GRADE_NOTE } from "../src/sporta/marketplace/myPipelinesRealHost.js";
import { APPS_STORE_GRADE_NOTE } from "../src/sporta/apps/appsRealHost.js";

/** One composition per temp dir (the W12-D teardown precedent). */
async function withDesktopComposition(
  run: (composition: SportaDesktopComposition) => Promise<void> | void,
): Promise<void> {
  const blobRoot = await mkdtemp(join(tmpdir(), "sporta-desktop-w14-"));
  try {
    await run(
      await createSportaDesktopComposition({ blobRoot, nodeExecutable: "node" }),
    );
  } finally {
    await rm(blobRoot, { recursive: true, force: true });
  }
}

test("W14-1 the desktop composition carries the REAL ports, the studio host, and the measured facts", async () => {
  await withDesktopComposition((composition) => {
    assert.equal(composition.runs.backing, "real");
    assert.equal(composition.library.backing, "real");
    assert.equal(composition.myPipelines.backing, "real");
    assert.equal(composition.connectedApps.backing, "real");
    assert.equal(composition.facts.ports.runs.gradeNote, RUNS_LEDGER_GRADE_NOTE);
    assert.equal(composition.facts.ports.library.gradeNote, LIBRARY_REGISTRY_GRADE_NOTE);
    assert.equal(composition.facts.ports.myPipelines.gradeNote, MY_PIPELINES_STORE_GRADE_NOTE);
    assert.equal(composition.facts.ports.connectedApps.gradeNote, APPS_STORE_GRADE_NOTE);
    assert.equal(composition.facts.studio.evidence, "real");
    assert.equal(composition.studio.evidence, "real");
    for (const result of Object.values(composition.facts.seedResults)) {
      assert.equal(result, "ok", "every seed leg drove its REAL lifecycle");
    }
  });
});

test("W14-2 the demo run seed is a REAL child-process trim run (succeeded steps, REAL ledger projection)", async () => {
  await withDesktopComposition(async (composition) => {
    const listed = await composition.runs.listRuns();
    assert.equal(listed.length, 1, "the REAL run projects through the runs host");
    const run = listed[0]!;
    assert.equal(run.workGraph.workGraphId, "wg:desktop-demo");
    assert.ok(
      run.steps.every((step) => step.status === "succeeded"),
      "the REAL deterministic child leg succeeded (real pipes, real exit code)",
    );
    assert.ok(run.steps[0]!.timingMs >= 0, "real timing measured");
    const read = await composition.runs.readRun(run.runManifestId);
    assert.deepEqual(read, run, "listRuns and readRun agree (the host owns no state)");
    // The library projects the run's REAL output revisions (same graph).
    const artifacts = await composition.library.listArtifacts();
    assert.ok(
      artifacts.some((artifact) => artifact.artifactId === "art:desktop-demo-board"),
      "the editable demo artifact projects through the library host",
    );
    const detail = await composition.library.readArtifact("art:desktop-demo-board");
    assert.equal(detail.revisions.length, 1, "the REAL revision lineage projects");
  });
});

test("W14-3 the marketplace seed drives a REAL draft + submitted pair under the screen's default creator", async () => {
  await withDesktopComposition(async (composition) => {
    const rows = await composition.myPipelines.listCreatorRecords(DESKTOP_DEMO_CREATOR);
    assert.equal(rows.length, 2, "draft + submitted both project");
    const states = rows.map((row) => row.creatorState).sort();
    assert.equal(states.join(","), "draft,submitted", "the lifecycle states project verbatim");
    const other = await composition.myPipelines.listCreatorRecords("publisher:other");
    assert.equal(other.length, 0, "creator isolation holds through the composed query");
  });
});

test("W14-4 the apps seed attaches a REAL app the operator can revoke through the ONE write path", async () => {
  await withDesktopComposition(async (composition) => {
    const views = await composition.connectedApps.listAttachments();
    assert.equal(views.length, 1, "the REAL attachment projects through the apps host");
    assert.equal(views[0]!.attachment.attachmentId, "att:desktop-demo-app");
    assert.equal(views[0]!.attachment.revokedAt, null, "honest null until the operator revokes");
    const revoked = await composition.connectedApps.revoke("att:desktop-demo-app");
    assert.ok(revoked.ok, "the revoke write succeeds through the composed host");
    const after = await composition.connectedApps.listAttachments();
    assert.ok(after[0]!.attachment.revokedAt !== null, "the honest revokedAt carries");
    const reRevoked = await composition.connectedApps.revoke("att:desktop-demo-app");
    assert.ok(reRevoked.ok, "re-revoke is idempotent (the W12-C law)");
  });
});

test("W14-5 the studio host projects its seeded world (listings through the REAL marketplace reads)", async () => {
  await withDesktopComposition(async (composition) => {
    const listings = await composition.studio.listListings();
    assert.ok(listings.length >= 1, "the studio composition's seeds project");
    const apps = await composition.studio.listAppAttachments();
    assert.ok(apps.length >= 1, "the studio app attachments project");
  });
});

test("W14-6 the typed bridge projects the port surface with facts-carried labels and verbatim errors", async () => {
  const runRecord = {
    runManifestId: "run:bridge-test",
    workGraph: { workGraphId: "wg:bridge", runRef: "run:bridge-1" },
    release: { pipelineId: "pipe:bridge", version: "1.0.0", releaseDigest: `sha256:${"a".repeat(64)}` },
    componentDigests: [],
    configHash: `sha256:${"b".repeat(64)}`,
    inputs: [],
    grantedApplicationCapabilities: [],
    steps: [],
    outputs: [],
    semanticFidelity: { grade: "fixture" as const, note: "bridge test" },
    startedAt: "2026-10-16T12:00:00.000Z",
    finishedAt: "2026-10-16T12:00:01.000Z",
    retention: "tenant-default",
  };
  const facts = {
    bootedAt: "2026-10-16T12:00:00.000Z",
    blobRoot: "/tmp/bridge",
    seedResults: {},
    ports: {
      runs: { backing: "real" as const, gradeNote: RUNS_LEDGER_GRADE_NOTE },
      library: { backing: "real" as const, gradeNote: LIBRARY_REGISTRY_GRADE_NOTE },
      myPipelines: { backing: "real" as const, gradeNote: MY_PIPELINES_STORE_GRADE_NOTE },
      connectedApps: { backing: "real" as const, gradeNote: APPS_STORE_GRADE_NOTE },
    },
    studio: { evidence: "real" as const },
  };
  const bridge: SportaDesktopBridge = {
    facts: async () => facts,
    runsList: async () => [runRecord],
    runsRead: async (id) => {
      if (id !== "run:bridge-test") {
        throw new Error("real host: no run (typed refusal — never a fabricated record)");
      }
      return runRecord;
    },
    libraryList: async () => [],
    libraryRead: async () => {
      throw new Error("real host: unknown artifact (typed refusal)");
    },
    pipelinesList: async () => [],
    pipelinesStatus: async () => {
      throw new Error("real host: no review decision recorded");
    },
    appsList: async () => [],
    appsAudit: async () => [],
    appsRevoke: async () => ({ ok: false as const, reason: "bridge test refusal" }),
    studioValidate: async () => ({ valid: true as const, nodeCount: 1, edgeCount: 0 }),
    studioListings: async () => [],
    studioReview: async () => null,
    studioDisclosure: async () => {
      throw new Error("real host: unknown listing");
    },
    studioPreview: async () => null,
    studioApps: async () => [],
    studioLaunch: async () => {
      throw new Error("admission refused (fail-closed)");
    },
  };
  const ports = createDesktopRealScreenPorts(bridge, facts);
  assert.equal(ports.runs.backing, "real", "the backing is the measured fact, never hardcoded");
  assert.equal(ports.runs.gradeNote, RUNS_LEDGER_GRADE_NOTE, "the honesty label carries");
  const listed = await ports.runs.listRuns();
  assert.equal(listed.length, 1, "the bridge values project through the port");
  await assert.rejects(
    () => ports.runs.readRun("run:unknown"),
    /typed refusal/,
    "thrown typed refusals surface with their verbatim message",
  );
  await assert.rejects(
    () => ports.myPipelines.readCreatorVersionStatus("pipe:x", "1.0.0"),
    /no review decision recorded/,
  );
  const revoked = await ports.connectedApps.revoke("att:x");
  assert.equal(revoked.ok, false, "union results project (the revoke refusal)");
  assert.equal(revoked.reason, "bridge test refusal", "the refusal reason carries verbatim");

  const studio = createDesktopStudioHost(bridge, facts);
  assert.equal(studio.evidence, "real", "the studio evidence badge is the measured fact");
  const validation = await studio.validateGraph({ nodes: [], edges: [] } as never);
  assert.deepEqual(validation, { valid: true, nodeCount: 1, edgeCount: 0 });
  await assert.rejects(() => studio.selectForLaunch("listing:x"), /admission refused/);
  assert.equal(studio.readLiveSourceEvidence, undefined, "the live seam stays omitted (honest empty state)");
});

test("W14-7 the bridge global law: null without the preload, present with it", () => {
  const globalName = "sportaDesktopPorts";
  assert.equal(getSportaDesktopBridge(), null, "a plain browser/node sees no bridge");
  const saved = (globalThis as { [key: string]: unknown })[globalName];
  try {
    (globalThis as { [key: string]: unknown })[globalName] = {
      facts: async () => null,
    };
    assert.ok(getSportaDesktopBridge() !== null, "the preload global is read");
  } finally {
    if (saved === undefined) {
      delete (globalThis as { [key: string]: unknown })[globalName];
    } else {
      (globalThis as { [key: string]: unknown })[globalName] = saved;
    }
  }
});
