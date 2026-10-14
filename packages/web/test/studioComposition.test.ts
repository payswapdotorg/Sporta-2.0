/**
 * W10A-3 — the Transform Studio composition test (packages/web,
 * node:test + tsx — the project law; the sportaHost.test.ts precedent).
 *
 * Drives the STUDIO COMPOSITION (studioComposition.ts) through its
 * port (`TransformStudioHostPort`): graph-validation round-trips over
 * the REAL `@sporta/transforms` validator, marketplace reads over the
 * REAL `@sporta/marketplace` services, the fail-closed launch admission
 * (admitted + typed refusals, VERBATIM), app-attachment disclosure over
 * the REAL `@sporta/app-environments` service, the sample preview as a
 * REAL TransformRunService run (REAL deterministic-filter child process
 * + REAL content-addressed FS blob writes on a real temp dir), plus the
 * composition-root mount (createSportaHost exposes the studio host) and
 * the browser fixture host's honest FIXTURE behavior.
 *
 * EVIDENCE CLASS (labeled): REAL — the validator, the marketplace
 * services + admission gate, the app-environment service laws, the
 * sample-run child process / FS blobs / artifact revisions / WorkGraph
 * reconciliation, and the W4-C composition-root mount (real spawn
 * stand-in + real localhost HTTP arena, the sportaHost.test.ts class).
 * FIXTURE — the in-memory stores, the seed CONTENT (studioSeeds.ts),
 * the attach-time fixture probe, the scripted Arena role, the stand-in
 * CLI executable, and the browser fixture host snapshots.
 */
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createStudioHostComposition } from "../src/sporta/studioComposition.js";
import {
  STUDIO_SAMPLE_PIPELINE_ID,
  STUDIO_SUSPENDED_PIPELINE_ID,
} from "../src/sporta/studioSeeds.js";
import { createStudioBrowserFixtureHost } from "../src/sporta/studioBrowserFixture.js";
import {
  dataScopeLine,
  grantsMutation,
  learningConsentLine,
  permissionSummary,
} from "../src/sporta/studio/appAttachmentViews.js";
import { gradeLabel, priceLine } from "../src/sporta/studio/marketplaceViews.js";
import { createSportaHost } from "../src/sporta/composition.js";
import { StubArenaRole } from "./support/stubArenaRole.js";

const STANDIN_PATH = fileURLToPath(new URL("./fixtures/zcode-cli-standin.mjs", import.meta.url));
const FIXED_NOW = "2026-10-13T12:00:00.000Z";
const PINNED = "sha256:" + "ab".repeat(32);
const OPERATOR_RIGHTS = { satisfied: ["authorized source footage"], evidenceRefs: ["rights:test-operator"] };

/** The stream port the seeded pipelines speak. */
const STREAM = { name: "events", dataKind: "sporta/json-event-stream", required: true, cardinality: "stream" as const };

/** A valid two-node draft (filter -> filter, compatible dataKinds). */
function validDraft() {
  return {
    nodes: [
      { nodeId: "node:in", kind: "deterministic-filter" as const, componentName: "trim-a", componentDigest: PINNED, inputs: [STREAM], outputs: [STREAM] },
      { nodeId: "node:out", kind: "deterministic-filter" as const, componentName: "trim-b", componentDigest: PINNED, inputs: [STREAM], outputs: [STREAM] },
    ],
    edges: [{ from: { nodeId: "node:in", port: "events" }, to: { nodeId: "node:out", port: "events" } }],
  };
}

test("W10A-3 graph validation: a valid draft round-trips through the REAL transforms validator", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-comp-"));
  const composition = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs"), now: () => FIXED_NOW });
  try {
    assert.equal(composition.host.evidence, "real", "the headless studio composition reports REAL evidence");
    const result = await composition.host.validateGraph(validDraft());
    assert.deepEqual(result, { valid: true, nodeCount: 2, edgeCount: 1 });
  } finally {
    await composition.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-3 graph validation: an invalid draft surfaces the typed per-violation records VERBATIM", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-comp-"));
  const composition = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs"), now: () => FIXED_NOW });
  try {
    // Duplicate node id + unknown edge endpoint + moving tag + malformed
    // digest + a type-mismatched edge: the REAL validator's typed records
    // must surface through the port, never stringly errors.
    const draft = {
      nodes: [
        { nodeId: "node:dup", kind: "deterministic-filter" as const, componentName: "trim-1", componentDigest: PINNED, inputs: [], outputs: [] },
        { nodeId: "node:dup", kind: "deterministic-filter" as const, componentName: "trim-2", componentDigest: PINNED, inputs: [], outputs: [] },
        { nodeId: "node:a", kind: "deterministic-filter" as const, componentName: "trim", componentDigest: PINNED, inputs: [STREAM], outputs: [STREAM] },
        { nodeId: "node:vision", kind: "model" as const, componentName: "vision", componentDigest: "latest", inputs: [], outputs: [] },
        { nodeId: "node:b", kind: "model" as const, componentName: "summer", componentDigest: "not-a-digest", inputs: [{ name: "events", dataKind: "sporta/json-summary", required: true, cardinality: "single" as const }], outputs: [] },
      ],
      edges: [
        { from: { nodeId: "node:ghost", port: "events" }, to: { nodeId: "node:a", port: "events" } },
        { from: { nodeId: "node:a", port: "events" }, to: { nodeId: "node:b", port: "events" } },
      ],
    };
    const result = await composition.host.validateGraph(draft);
    assert.equal(result.valid, false);
    if (!result.valid) {
      const detailsOf = (kind: string) =>
        result.violations.filter((violation) => violation.kind === kind).map((violation) => violation.detail);
      assert.ok(
        detailsOf("duplicate-node").some((detail) => /nodeId node:dup declared 2 times/.test(detail)),
      );
      assert.ok(
        detailsOf("unknown-node").some((detail) => /edge from references unknown node node:ghost/.test(detail)),
      );
      assert.ok(
        detailsOf("unpinned-component").some((detail) => /moving tag "latest"/.test(detail)),
      );
      assert.ok(
        detailsOf("unpinned-component").some((detail) => /not sha256:<64 hex>/.test(detail)),
      );
      assert.ok(
        detailsOf("type-mismatch").some((detail) => /incompatible dataKinds/.test(detail)),
      );
      // VERBATIM law: the details are the REAL validator's own strings.
      for (const violation of result.violations) assert.ok(violation.detail.length > 0);
    }
  } finally {
    await composition.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-3 marketplace reads: listings, review status and disclosure carry the REAL record fields", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-comp-"));
  const composition = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs"), now: () => FIXED_NOW });
  try {
    const listings = await composition.host.listListings();
    assert.equal(listings.length, 2, "the two seeded listings (published + suspended)");
    const published = listings.find((listing) => listing.pipelineId === STUDIO_SAMPLE_PIPELINE_ID);
    const suspended = listings.find((listing) => listing.pipelineId === STUDIO_SUSPENDED_PIPELINE_ID);
    assert.ok(published !== undefined && suspended !== undefined);
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.publisher, "publisher:studio-host");
    assert.equal(published.approvedVersion, "1.0.0");
    assert.equal(published.offer.kind, "free");
    assert.equal(priceLine(published.offer), "Free");
    assert.equal(gradeLabel(published.expectations.evidenceGrade), "FIXTURE");
    assert.deepEqual(published.rightsPrerequisites, ["authorized source footage"]);
    assert.deepEqual(published.expectedOutputs, ["trimmed event stream"]);
    assert.ok(published.limitations.length > 0);
    assert.equal(suspended.status, "SUSPENDED", "the suspended seed stays honestly SUSPENDED, never hidden");

    // Review status: the REAL review decision projects with all three roles.
    const review = await composition.host.readReviewStatus(published.pipelineId, published.approvedVersion);
    assert.ok(review !== null);
    assert.equal(review.outcome, "approved");
    assert.deepEqual(review.reviewerRoles, ["product", "rights", "security"]);
    assert.equal(review.policyVersion, "policy:studio-host-v1");
    assert.ok(review.automatedChecks.length > 0, "the REAL check lane ran at seed time");
    assert.equal(
      (await composition.host.readReviewStatus("pipe:unknown", "9.9.9")),
      null,
      "unknown pipeline/version is an honest null",
    );

    // Launch disclosure: pinned release digest, dependencies, legal notice.
    const disclosure = await composition.host.readLaunchDisclosure(published.listingId);
    assert.equal(disclosure.publisher, published.publisher);
    assert.equal(disclosure.approvedVersion, published.approvedVersion);
    assert.equal(disclosure.releaseDigest, published.releaseDigest, "digest byte-equality listing -> disclosure");
    assert.equal(disclosure.terms.kind, "free");
    assert.deepEqual(
      disclosure.dependencies.map((dependency) => dependency.name),
      ["json-event-stream-trim"],
    );
    assert.match(disclosure.legalNotice, /never implies legal clearance/);
    // A disconnected read NEVER reports success: unknown listing rejects typed.
    await assert.rejects(
      () => composition.host.readLaunchDisclosure("list:unknown"),
      /no listing list:unknown/,
    );
  } finally {
    await composition.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-3 launch admission: admitted pins the approved digest; typed refusals surface VERBATIM (fail-closed)", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-comp-"));
  const entitled = createStudioHostComposition({
    blobRoot: join(tempRoot, "blobs"),
    now: () => FIXED_NOW,
    operatorRights: OPERATOR_RIGHTS,
  });
  const noRights = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs-2"), now: () => FIXED_NOW });
  try {
    const listings = await entitled.host.listListings();
    const published = listings.find((listing) => listing.status === "PUBLISHED");
    const suspended = listings.find((listing) => listing.status === "SUSPENDED");
    assert.ok(published !== undefined && suspended !== undefined);

    // Admitted: the entitlement's pinned approved digest, byte-identical
    // across listing -> disclosure -> admission.
    const disclosure = await entitled.host.readLaunchDisclosure(published.listingId);
    const admitted = await entitled.host.selectForLaunch(published.listingId);
    assert.equal(admitted.admitted, true);
    if (admitted.admitted) {
      assert.equal(admitted.listingId, published.listingId);
      assert.equal(admitted.releaseDigest, published.releaseDigest);
      assert.equal(admitted.releaseDigest, disclosure.releaseDigest, "digest byte-equality disclosure -> admission");
      assert.match(admitted.entitlementId, /^ent:/);
      console.log("W10A-3 ADMISSION REAL EVIDENCE:");
      console.log(`- admitted digest (byte-equal listing -> disclosure -> admission): ${admitted.releaseDigest.slice(0, 19)}…`);
    }

    // Refusal 1: the SUSPENDED listing refuses typed, even WITH an
    // entitlement on record (P9-10: suspension blocks new runs).
    const suspendedRefusal = await entitled.host.selectForLaunch(suspended.listingId);
    assert.equal(suspendedRefusal.admitted, false);
    if (!suspendedRefusal.admitted) {
      assert.equal(suspendedRefusal.reason, "suspended");
      assert.match(suspendedRefusal.detail, /is SUSPENDED — new runs are blocked/);
    }

    // Refusal 2: no operator rights declaration => the REAL fail-closed
    // gate refuses (P9-14 — never "safe because it looks different").
    const noRightsListings = await noRights.host.listListings();
    const noRightsPublished = noRightsListings.find((listing) => listing.status === "PUBLISHED");
    assert.ok(noRightsPublished !== undefined);
    const rightsRefusal = await noRights.host.selectForLaunch(noRightsPublished.listingId);
    assert.equal(rightsRefusal.admitted, false);
    if (!rightsRefusal.admitted) {
      assert.equal(rightsRefusal.reason, "rights-prerequisites-unsatisfied");
      assert.match(rightsRefusal.detail, /never "safe because it looks different"/);
    }

    // Refusal 3: unknown listing => listing-not-published, typed.
    const unknownRefusal = await entitled.host.selectForLaunch("list:does-not-exist");
    assert.equal(unknownRefusal.admitted, false);
    if (!unknownRefusal.admitted) {
      assert.equal(unknownRefusal.reason, "listing-not-published");
      assert.match(unknownRefusal.detail, /no listing list:does-not-exist/);
    }
  } finally {
    await entitled.dispose();
    await noRights.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-3 app attachments: permission + data-scope disclosure with grant/expiry/revocation state", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-comp-"));
  const composition = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs"), now: () => FIXED_NOW });
  try {
    const apps = await composition.host.listAppAttachments();
    assert.equal(apps.length, 3, "observe-only, observe+control+learning-consent, and revoked");
    const byId = new Map(apps.map((app) => [app.attachmentId, app]));

    const observer = byId.get("att:studio-observe-1");
    assert.ok(observer !== undefined);
    assert.deepEqual(observer.grantedClasses, ["observe"]);
    assert.deepEqual(observer.notGrantedClasses, ["control"]);
    assert.equal(grantsMutation(observer), false, "observation never implies mutation (lock 30)");
    assert.equal(observer.learningConsent.granted, false, "attachment alone never learns (lock 31)");
    assert.match(learningConsentLine(observer), /NOT granted/);
    assert.match(permissionSummary(observer), /granted: observe — expires/);
    assert.match(dataScopeLine(observer), /app-status, app-highlights/);
    assert.match(dataScopeLine(observer), /no network access/);
    assert.equal(observer.revoked, false);

    const controller = byId.get("att:studio-controller-1");
    assert.ok(controller !== undefined);
    assert.deepEqual(controller.grantedClasses, ["observe", "control"]);
    assert.deepEqual(controller.notGrantedClasses, []);
    assert.equal(grantsMutation(controller), true);
    assert.deepEqual(
      controller.learningConsent,
      { granted: true, scope: "app-highlights", retention: "30 days" },
      "the SEPARATE learning consent carries its own scope + retention",
    );
    assert.equal(controller.capabilities.length, 2, "the descriptor catalog projects (observe + control)");
    assert.equal(controller.targetKind, "local");

    const revoked = byId.get("att:studio-revoked-1");
    assert.ok(revoked !== undefined);
    assert.equal(revoked.revoked, true);
    assert.match(permissionSummary(revoked), /^revoked \(was: observe\)/);
  } finally {
    await composition.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-3 sample preview: a REAL run (child process + real FS blobs), measured evidence, honest null", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-comp-"));
  const composition = createStudioHostComposition({ blobRoot: join(tempRoot, "blobs"), now: () => FIXED_NOW });
  try {
    const preview = await composition.host.readSamplePreview(STUDIO_SAMPLE_PIPELINE_ID, "1.0.0");
    assert.ok(preview !== null);
    assert.equal(preview.pipelineId, STUDIO_SAMPLE_PIPELINE_ID);
    assert.equal(preview.version, "1.0.0");
    assert.equal(preview.evidenceGrade, "measured", "the deterministic lane re-verifies carry-forward in-process");
    assert.match(preview.semanticEvidence, /3 kept byte-exact, 2 dropped/);
    assert.match(preview.outputSummary, /1 output revision/);
    assert.match(preview.inputSummary, /5-event prerecorded sample feed/);

    // REAL storage leg: the run's output bytes are content-addressed on
    // the REAL FS (the child process wrote real output, really stored).
    const blobFiles = await countFiles(join(tempRoot, "blobs"));
    assert.ok(blobFiles >= 1, `real blob file(s) on the real FS (found ${blobFiles})`);
    console.log("W10A-3 SAMPLE PREVIEW REAL EVIDENCE:");
    console.log(`- run: REAL deterministic-filter child process, carry-forward re-verified (${preview.semanticEvidence.slice(0, 80)}…)`);
    console.log(`- storage (real FS): ${blobFiles} content-addressed blob file(s) under ${join(tempRoot, "blobs")}`);
    console.log(`- grade: ${preview.evidenceGrade} (measured — the deterministic lane, not the fixture model lane)`);

    // Idempotent: the memoized run serves the same preview verbatim.
    const again = await composition.host.readSamplePreview(STUDIO_SAMPLE_PIPELINE_ID, "1.0.0");
    assert.deepEqual(again, preview);

    // Honest null for anything that declares no sample.
    assert.equal(await composition.host.readSamplePreview(STUDIO_SUSPENDED_PIPELINE_ID, "1.0.0"), null);
    assert.equal(await composition.host.readSamplePreview(STUDIO_SAMPLE_PIPELINE_ID, "9.9.9"), null);
  } finally {
    await composition.dispose();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-2 composition root: createSportaHost exposes the REAL studio host alongside SportaHostPort", async () => {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), "studio-web-root-"));
  const arenaRole = await StubArenaRole.start();
  try {
    const { host, loop, studioHost, dispose } = createSportaHost({
      zcodeCliPath: STANDIN_PATH,
      blobRoot: join(tempRoot, "blobs"),
      arenaBaseUrl: arenaRole.baseUrl,
    });
    try {
      // The W4-C loop prologue the projection needs (intent + promoted org).
      await loop.openIntent();
      await loop.registerOrganizationDraft(1);
      await loop.promoteOrganization(1);
      // The W4-C host surface is intact (REAL evidence, the panel contract).
      const state = await host.readState();
      assert.equal(state.evidence, "real");
      // The studio host rides the SAME composition root, REAL evidence.
      assert.equal(studioHost.evidence, "real");
      const listings = await studioHost.listListings();
      assert.equal(listings.length, 2);
      const admitted = await studioHost.selectForLaunch(listings.find((l) => l.status === "PUBLISHED")?.listingId ?? "");
      assert.equal(admitted.admitted, true, "the operator-declared rights admit the seeded listing (gate still real)");
    } finally {
      await dispose();
    }
  } finally {
    await arenaRole.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("W10A-2 browser fixture host: honestly-labeled FIXTURE behavior, typed, never claimed real", async () => {
  const host = createStudioBrowserFixtureHost();
  assert.equal(host.evidence, "fixture");
  const listings = await host.listListings();
  assert.equal(listings.length, 2);
  const published = listings.find((listing) => listing.status === "PUBLISHED");
  const suspended = listings.find((listing) => listing.status === "SUSPENDED");
  assert.ok(published !== undefined && suspended !== undefined);
  assert.equal(gradeLabel(published.expectations.evidenceGrade), "FIXTURE");

  const review = await host.readReviewStatus(published.listingId);
  assert.ok(review !== null && review.reviewerRoles.length === 3);

  const disclosure = await host.readLaunchDisclosure(published.listingId);
  assert.match(disclosure.legalNotice, /never implies legal clearance/);

  // The fixture admission is honestly typed: suspended refuses, unknown
  // refuses, published admits its FIXTURE digest (labeled by the badge).
  const refused = await host.selectForLaunch(suspended.listingId);
  assert.equal(refused.admitted, false);
  if (!refused.admitted) {
    assert.equal(refused.reason, "suspended");
    assert.match(refused.detail, /^fixture:/);
  }
  const admitted = await host.selectForLaunch(published.listingId);
  assert.equal(admitted.admitted, true);
  if (admitted.admitted) assert.equal(admitted.entitlementId, "ent:fixture-studio-1");

  const preview = await host.readSamplePreview("pipe:fixture-highlights-trim", "1.0.0");
  assert.ok(preview !== null && preview.evidenceGrade === "fixture");

  const apps = await host.listAppAttachments();
  assert.equal(apps.length, 2);
  assert.ok(apps.some((app) => app.revoked), "the revoked fixture attachment stays honestly revoked");

  const valid = await host.validateGraph(validDraft());
  assert.deepEqual(valid, { valid: true, nodeCount: 2, edgeCount: 1 });
  const invalid = await host.validateGraph({ nodes: [], edges: [{ from: { nodeId: "ghost", port: "x" }, to: { nodeId: "ghost", port: "y" } }] });
  assert.equal(invalid.valid, false, "the fixture demo checks are typed, never stringly");
});

/** Count real files under a directory tree (the sportaHost.test.ts helper law). */
async function countFiles(root: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) total += await countFiles(join(root, entry.name));
    else if (entry.isFile()) total += 1;
  }
  return total;
}
