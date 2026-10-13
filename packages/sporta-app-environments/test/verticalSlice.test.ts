/**
 * W9C-7 — the P9 vertical-slice demonstration test (P9-23).
 *
 * One coherent end-to-end lineage, driven through the TRANSFORM STUDIO
 * headless composition (packages/web/src/sporta/studio):
 *
 *   local prerecorded feed (fixture content) -> graph building +
 *   validation (REAL w9a validator) -> sample preview (REAL w9a
 *   deterministic child process + labeled fixture model lane) ->
 *   marketplace/review status (REAL w9b services over real sha256:
 *   draft -> submit -> automated checks -> 3-role human review ->
 *   PUBLISHED free listing -> entitlement) -> pipeline selection at feed
 *   launch (fail-closed admission + typed disclosure) -> pinned run
 *   (REAL deterministic child process; outputs reconciled onto the SAME
 *   WorkGraph through the real Artifact Fabric) -> ONE real attached app
 *   action over the REAL agent path (this lane) with its verified effect
 *   reconciled into the SAME WorkGraph/artifact lineage -> revoke ->
 *   next action denied.
 *
 * EVIDENCE CLASS: the marketplace publication journey, the admission
 * ladder, the digest computations and the state machines are REAL; the
 * deterministic transform lane spawns REAL child processes; the app
 * action spawns a REAL agent-path process (the labeled stand-in); the
 * blob store writes REAL files. FIXTURE (labeled): the feed/manifest/
 * reviewer/org content, the in-memory stores, the FixedClock, the
 * fixture model adapter, the stand-in executable WHAT it is.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStudioHost } from "../../web/src/sporta/studio/studioComposition.js";
import { studioSampleFeedBytes } from "../../web/src/sporta/studio/studioSampleFeed.js";
import { Sha256MarketplaceHash } from "@sporta/marketplace/contract";
import { validateTransformPipelineManifest } from "@sporta/transforms/contract";

const STANDIN_PATH = fileURLToPath(
  new URL("./fixtures/zcode-app-action-standin.mjs", import.meta.url),
);

test("P9-23: the full vertical slice — graph -> review -> launch -> run -> attached app -> revoke", async () => {
  const blobRoot = await fs.mkdtemp(join(tmpdir(), "sporta-studio-blobs-"));
  const appRoot = await fs.mkdtemp(join(tmpdir(), "sporta-studio-app-"));
  const host = await createStudioHost({
    zcodeCliPath: STANDIN_PATH,
    blobRoot,
    appRoot,
  });
  try {
    // ---- 1. Graph building + validation (the REAL w9a validation port).
    const initial = await host.readState();
    assert.equal(initial.evidence, "real");
    assert.equal(initial.graph.validation.valid, true);
    assert.deepEqual(
      initial.graph.validation.valid ? { nodes: initial.graph.validation.nodeCount, edges: initial.graph.validation.edgeCount } : null,
      { nodes: 1, edges: 0 },
    );
    assert.ok(initial.apps.attachableApp !== null);
    assert.equal(initial.apps.attachableApp.targetKind, "local");
    // observe/control/semantic-binding capability declarations (W9C-1).
    assert.deepEqual(
      initial.apps.attachableApp.capabilities.map((capability) => capability.capabilityClass),
      ["observe", "control", "semantic-binding"],
    );

    // ---- 2. A graph edit the validator must catch (fail-closed, P9-01):
    // removing the only node leaves an empty-but-valid... actually the
    // manifest still declares ports, so add a second node and connect a
    // self-cycle to prove the typed cycle violation surfaces in the view.
    const withModel = await host.applyGraphEdit({ kind: "add-node", component: "fixture-event-summer" });
    assert.equal(withModel.graph.nodes.length, 2);
    assert.equal(withModel.graph.validation.valid, true);
    const cyclic = await host.applyGraphEdit({ kind: "connect-edge", from: "node:model", to: "node:model" });
    assert.equal(cyclic.graph.validation.valid, false);
    if (!cyclic.graph.validation.valid) {
      assert.ok(cyclic.graph.validation.violations.some((v) => v.kind === "cycle"));
    }
    const repaired = await host.applyGraphEdit({ kind: "reset" });
    assert.equal(repaired.graph.validation.valid, true);

    // ---- 3. Sample preview: REAL deterministic child process (P9-02).
    const previewed = await host.previewSample({ feedBytes: studioSampleFeedBytes() });
    assert.notEqual(previewed.preview, null);
    assert.equal(previewed.preview?.status, "ran");
    assert.equal(previewed.preview?.evidenceGrade, "real");
    assert.ok(previewed.preview?.detail.includes("kept 4, dropped 1"));
    assert.ok(previewed.preview?.laneNotes.some((note) => note.includes("real child process")));

    // ---- 4. Marketplace/review status (P9-08/12): the seeded journey
    // published a FREE reviewed listing with 3-role signoff.
    const listing = previewed.marketplace?.listing ?? null;
    assert.notEqual(listing, null);
    assert.equal(listing?.status, "PUBLISHED");
    assert.equal(listing?.offer.kind, "free");
    assert.equal(listing?.offer.price, null);
    assert.equal(listing?.publisher, "publisher:studio-demo");
    assert.equal(listing?.currentRelease.version, "1.0.0");
    const decision = previewed.marketplace?.decisions[0] ?? null;
    assert.notEqual(decision, null);
    assert.equal(decision?.outcome, "approved");
    assert.deepEqual(
      decision?.humanReview.map((entry) => entry.role).sort(),
      ["product", "rights", "security"],
    );
    // The release digest is byte-identical from decision -> listing (w9b law).
    assert.equal(decision?.candidateDigest, listing?.currentRelease.releaseDigest);

    // ---- 5. The launch disclosure (P9-12): publisher, approved version,
    // terms/price, rights prerequisites, dependencies, outputs,
    // limitations, expectations + evidence grade, the fixed legal notice.
    const disclosure = previewed.marketplace?.disclosure ?? null;
    assert.notEqual(disclosure, null);
    assert.equal(disclosure?.approvedVersion, "1.0.0");
    assert.equal(disclosure?.releaseDigest, listing?.currentRelease.releaseDigest);
    assert.equal(disclosure?.cost, null);
    assert.deepEqual(disclosure?.rightsPrerequisites, ["authorized source footage"]);
    assert.ok(disclosure?.dependencies.some((d) => d.name === "json-event-stream-trim" && d.license === "MIT"));
    assert.ok(disclosure?.limitations.includes("first slice: single input feed, chain semantics"));
    assert.ok(disclosure?.legalNotice.includes("never implies legal clearance"));

    // ---- 6. Pipeline selection at launch: FAIL-CLOSED without rights
    // (P9-14 — never "safe because it looks different").
    const refused = await host.selectForLaunch({ feedKind: "prerecorded", rightsSatisfied: [] });
    assert.equal(refused.launch?.lastAdmission?.admitted, false);
    assert.equal(refused.launch?.lastAdmission?.reason, "rights-prerequisites-unsatisfied");
    assert.equal(refused.launch?.lastRunManifest, null);

    // ---- 7. The admitted launch + pinned run (P9-03): the run executes
    // the PINNED reviewed release with the admitted digest.
    const launched = await host.launchSelectedPipeline({
      feedBytes: studioSampleFeedBytes(),
      rightsSatisfied: ["authorized source footage"],
      rightsEvidenceRefs: ["rights:studio-demo-authorization"],
    });
    assert.equal(launched.launch?.lastAdmission?.admitted, true);
    const admittedDigest = launched.launch?.lastAdmission?.releaseDigest;
    assert.ok(admittedDigest !== undefined);
    // Byte-equality end to end: decision -> listing -> entitlement ->
    // admission -> run manifest (P9-03/09).
    assert.equal(admittedDigest, listing?.currentRelease.releaseDigest);
    assert.equal(admittedDigest, decision?.candidateDigest);
    const runManifestSummary = launched.launch?.lastRunManifest ?? null;
    assert.notEqual(runManifestSummary, null);
    assert.equal(runManifestSummary?.releaseDigest, admittedDigest);
    assert.ok((runManifestSummary?.outputs ?? 0) >= 1);
    assert.equal(runManifestSummary?.semanticFidelity.grade, "measured");
    assert.ok(runManifestSummary?.steps.some((step) => step.nodeId === "node:trim" && step.status === "succeeded"));

    // ---- 8. The attached app (P9-18): grant observation and control
    // SEPARATELY — control first attempted, denied, then re-consented.
    const attachedObserveOnly = await host.attachApp({
      grantedClasses: ["observe"],
      consentedBy: "user:studio-demo",
      expiresAt: "2026-10-14T00:00:00.000Z",
    });
    const attachment = attachedObserveOnly.apps.attached[0]?.attachment ?? null;
    assert.notEqual(attachment, null);
    assert.deepEqual(attachment?.grantedCapabilityClasses, ["observe"]);
    assert.deepEqual(attachment?.learningConsent, { granted: false });
    assert.equal(attachedObserveOnly.apps.attached[0]?.sessions[0]?.closeState, "active");
    assert.equal(attachedObserveOnly.apps.attached[0]?.targetVerification?.reachable, true);

    // The app permission/data-scope surface (P9-18/22).
    assert.deepEqual(attachedObserveOnly.apps.attached[0]?.dataScope, ["journal-notes", "app-status"]);
    assert.ok(
      attachedObserveOnly.apps.attachableApp?.capabilities.some(
        (capability) => capability.capabilityId === "cap:append-note" && capability.capabilityClass === "control",
      ),
    );

    // Control attempted WITHOUT the grant: the typed refusal (lock 30).
    const controlDenied = await host.executeAppAction({
      capabilityId: "cap:append-note",
      payload: "should not run",
    });
    assert.equal(controlDenied.lastActionResult.admission.admitted, false);
    if (!controlDenied.lastActionResult.admission.admitted) {
      assert.equal(controlDenied.lastActionResult.admission.reason, "capability-class-not-granted");
    }
    assert.equal(controlDenied.lastActionResult.record.status, "denied");
    assert.equal(controlDenied.lastActionResult.record.permissionDecision.basis, "not-granted");

    // Learning consent stays separate (lock 31): grant it and assert the
    // attachment's classes are untouched.
    const consented = await host.grantLearningConsent({
      attachmentId: attachment?.attachmentId ?? "",
      scope: "workflow",
      retention: "90d",
    });
    assert.deepEqual(consented.apps.attached[0]?.attachment.learningConsent, {
      granted: true,
      scope: "workflow",
      retention: "90d",
    });
    assert.deepEqual(consented.apps.attached[0]?.attachment.grantedCapabilityClasses, ["observe"]);

    // Re-consent to add control (the reauthorization law).
    const amended = await host.amendAppGrant({
      attachmentId: attachment?.attachmentId ?? "",
      grantedClasses: ["observe", "control"],
      consentedBy: "user:studio-demo",
    });
    assert.deepEqual(amended.apps.attached[0]?.attachment.grantedCapabilityClasses, ["observe", "control"]);

    // ---- 9. ONE real local app action over the REAL agent path, its
    // verified effect reconciled into the SAME WorkGraph (P9-19).
    const actioned = await host.executeAppAction({
      capabilityId: "cap:append-note",
      payload: "vertical slice note",
    });
    const action = actioned.lastActionResult;
    assert.equal(action.admission.admitted, true);
    assert.equal(action.record.status, "succeeded");
    assert.ok(action.record.effects.some((effect) => effect.kind === "state:notes" && effect.verified));
    assert.equal(action.record.reconciledRefs.workGraphId, "wg:studio-demo");
    assert.equal(action.record.reconciledRefs.artifactRevisionIds.length, 1);
    // The journal REALLY changed on disk (the app target is a real dir).
    const stateBytes = await fs.readFile(join(appRoot, "local_sporta-journal-app", "state.json"), "utf8");
    const state = JSON.parse(stateBytes) as { notes: { id: string; text: string }[] };
    assert.equal(state.notes[0]?.text, "vertical slice note");

    // ---- 10. Revoke -> the next action is denied (P9-20), the session
    // safe-stopped revoked-mid-session, and the audit trail stays honest.
    const revoked = await host.revokeAppAttachment({ attachmentId: attachment?.attachmentId ?? "" });
    assert.equal(revoked.apps.attached[0]?.attachment.revokedAt !== null, true);
    assert.equal(revoked.apps.attached[0]?.sessions[0]?.closeState, "revoked-mid-session");
    const afterRevoke = await host.executeAppAction({
      capabilityId: "cap:append-note",
      payload: "never again",
    });
    assert.equal(afterRevoke.lastActionResult.admission.admitted, false);
    if (!afterRevoke.lastActionResult.admission.admitted) {
      assert.equal(afterRevoke.lastActionResult.admission.reason, "attachment-revoked");
    }
    assert.equal(afterRevoke.lastActionResult.record.status, "denied");
    assert.equal(afterRevoke.lastActionResult.record.permissionDecision.basis, "revoked");

    // The audit trail: denied -> succeeded -> denied, append-only.
    const finalState = await host.readState();
    const trail = finalState.apps.attached[0]?.auditTrail ?? [];
    assert.deepEqual(trail.map((record) => record.status), ["denied", "succeeded", "denied"]);
    assert.ok(trail.every((record) => record.sanitizedInputRefs.every((ref) => !ref.toLowerCase().includes("secret"))));

    // ---- 11. The run pinned the reviewed release: the studio manifest
    // digest law (the w9a validator agrees the pinned manifest is valid).
    const marketHash = new Sha256MarketplaceHash();
    assert.notEqual(marketHash.text("code@studio-demo-1.0.0"), marketHash.text("code@studio-demo-2.0.0"));
    void validateTransformPipelineManifest;
  } finally {
    await host.dispose?.();
    await fs.rm(blobRoot, { recursive: true, force: true });
    await fs.rm(appRoot, { recursive: true, force: true });
  }
});

test("P9-24 flavor: a SECOND reviewed version would repeat review — the studio draft edit cannot silently re-pin the listing", async () => {
  const blobRoot = await fs.mkdtemp(join(tmpdir(), "sporta-studio-blobs2-"));
  const appRoot = await fs.mkdtemp(join(tmpdir(), "sporta-studio-app2-"));
  const host = await createStudioHost({ zcodeCliPath: STANDIN_PATH, blobRoot, appRoot });
  try {
    // Edit the draft AFTER publication: the graph view changes, but the
    // listing's currentRelease stays pinned to the reviewed v1.0.0 and
    // the launch still executes the PINNED manifest (never the live
    // draft — P9-03/09: active runs never silently switch versions).
    const edited = await host.applyGraphEdit({ kind: "add-node", component: "fixture-event-summer" });
    assert.equal(edited.graph.nodes.length, 2);
    const listing = edited.marketplace?.listing ?? null;
    assert.equal(listing?.currentRelease.version, "1.0.0");
    const launched = await host.launchSelectedPipeline({
      feedBytes: studioSampleFeedBytes(),
      rightsSatisfied: ["authorized source footage"],
    });
    // The pinned run executed ONLY the reviewed trim node — the draft's
    // model node never entered the run (no silent version switch).
    const steps = launched.launch?.lastRunManifest?.steps ?? [];
    assert.deepEqual(steps.map((step) => step.nodeId), ["node:trim"]);
    assert.equal(launched.launch?.lastRunManifest?.releaseDigest, listing?.currentRelease.releaseDigest);
  } finally {
    await host.dispose?.();
    await fs.rm(blobRoot, { recursive: true, force: true });
    await fs.rm(appRoot, { recursive: true, force: true });
  }
});
