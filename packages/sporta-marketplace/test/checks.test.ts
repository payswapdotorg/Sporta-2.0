/**
 * W9B-1 / P9-08 + P9-13 + P9-16 (automated check lane) tests.
 *
 * EVIDENCE CLASS: REAL — the w9a graph validator really runs, the
 * digest-integrity check really recomputes sha256, gate failures
 * really block advancement; signal sources are fixture-labeled.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRANSFORM_AUTOMATED_CHECK_REGISTRY,
  TransformCheckLaneError,
  TransformListingError,
} from "../src/contract.js";
import { makeCandidateInput, makeManifest, makeWorld } from "./helpers.js";

test("the check lane runs every declared check in registry order with typed outcomes (P9-08)", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  const lane = world.submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: null,
  });
  assert.deepEqual(
    lane.results.map((result) => result.checkId),
    TRANSFORM_AUTOMATED_CHECK_REGISTRY.map((check) => check.checkId),
  );
  const byId = new Map(lane.results.map((result) => [result.checkId, result]));
  assert.equal(byId.get("graph-validation")?.outcome, "pass");
  assert.equal(byId.get("digest-integrity")?.outcome, "pass");
  assert.equal(byId.get("license-presence")?.outcome, "pass");
  assert.equal(byId.get("sbom-presence")?.outcome, "pass");
  assert.equal(byId.get("unsafe-dependency-signal")?.outcome, "pass");
  assert.equal(byId.get("similarity-signal")?.outcome, "pass");
  // Clean lane advances the candidate to HUMAN_REVIEW:
  assert.equal(world.submission.readCandidate(draft.candidateId).lifecycle, "HUMAN_REVIEW");
});

test("evidence kinds are honest: computed checks measured, signal/attestation checks fixture", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  const lane = world.submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: null,
  });
  const byId = new Map(lane.results.map((result) => [result.checkId, result]));
  assert.equal(byId.get("graph-validation")?.evidenceKind, "measured");
  assert.equal(byId.get("digest-integrity")?.evidenceKind, "measured");
  assert.equal(byId.get("license-presence")?.evidenceKind, "fixture");
  assert.equal(byId.get("sbom-presence")?.evidenceKind, "fixture");
  assert.equal(byId.get("unsafe-dependency-signal")?.evidenceKind, "fixture");
  assert.equal(byId.get("similarity-signal")?.evidenceKind, "fixture");
});

test("a corrupted candidate digest REALLY fails digest-integrity and blocks advancement (fail-closed)", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  // Corrupt the stored record AFTER freezing (store-level tamper):
  const stored = world.submission.readCandidate(draft.candidateId);
  world.candidates.save({
    ...stored,
    contentHashes: [{ kind: "code", digest: "sha256:" + "0".repeat(64) }],
  });
  assert.throws(
    () =>
      world.submission.runAutomatedChecks(draft.candidateId, {
        dependencySignals: { "trim-script": "clean" },
        similaritySignal: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformCheckLaneError);
      assert.deepEqual(error.failedCheckIds, ["digest-integrity"]);
      return true;
    },
  );
  // The candidate stays in AUTOMATED_CHECKS — never advances on a failed gate:
  assert.equal(world.submission.readCandidate(draft.candidateId).lifecycle, "AUTOMATED_CHECKS");
});

test("an invalid graph REALLY fails graph-validation through the w9a validator (P9-01 seam)", () => {
  const world = makeWorld();
  const broken = makeManifest({ version: "1.0.0" });
  const firstNode = broken.nodes[0];
  if (firstNode === undefined) throw new Error("fixture manifest missing node");
  const brokenManifest = {
    ...broken,
    nodes: [
      firstNode,
      {
        ...firstNode,
        componentRef: { ...firstNode.componentRef, digest: "sha256:" + "e".repeat(64) },
      },
    ],
  };
  world.manifests.register(brokenManifest);
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  assert.throws(
    () =>
      world.submission.runAutomatedChecks(draft.candidateId, {
        dependencySignals: { "trim-script": "clean" },
        similaritySignal: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformCheckLaneError);
      assert.ok(error.failedCheckIds.includes("graph-validation"));
      return true;
    },
  );
});

test("a missing SBOM attestation fails sbom-presence (P9-13)", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(
    makeCandidateInput("1.0.0", {
      attestations: [{ kind: "license", reference: "license:1.0.0" }],
    }),
  );
  world.submission.submitCandidate(draft.candidateId);
  assert.throws(
    () =>
      world.submission.runAutomatedChecks(draft.candidateId, {
        dependencySignals: { "trim-script": "clean" },
        similaritySignal: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformCheckLaneError);
      assert.ok(error.failedCheckIds.includes("sbom-presence"));
      return true;
    },
  );
});

test("an unsafe dependency signal fails the gate; an unknown signal honestly warns (P9-13)", () => {
  const world = makeWorld();
  const withBadDeps = makeManifest({ version: "1.0.0" });
  const firstNode = withBadDeps.nodes[0];
  if (firstNode === undefined) throw new Error("fixture manifest missing node");
  world.manifests.register({
    ...withBadDeps,
    pinnedDependencies: [
      {
        kind: "dependency",
        name: "left-pad",
        digest: "sha256:" + "f".repeat(64),
        license: "MIT",
        storageRef: "fabric:fixture",
      },
    ],
  });
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  assert.throws(
    () =>
      world.submission.runAutomatedChecks(draft.candidateId, {
        dependencySignals: { "left-pad": "unsafe" },
        similaritySignal: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformCheckLaneError);
      assert.ok(error.failedCheckIds.includes("unsafe-dependency-signal"));
      return true;
    },
  );
  // Unknown signal (dependency absent from the source) is an honest WARN, not a pass:
  const warnWorld = makeWorld();
  warnWorld.manifests.register(makeManifest({ version: "1.0.0" }));
  const warnDraft = warnWorld.submission.startDraft(makeCandidateInput("1.0.0"));
  warnWorld.submission.submitCandidate(warnDraft.candidateId);
  const lane = warnWorld.submission.runAutomatedChecks(warnDraft.candidateId, {
    dependencySignals: {},
    similaritySignal: null,
  });
  const signal = lane.results.find((result) => result.checkId === "unsafe-dependency-signal");
  assert.equal(signal?.outcome, "warn");
  assert.match(signal?.detail ?? "", /absence of evidence is not safety/);
  // A warning does NOT block advancement (warn != gate failure):
  assert.equal(warnWorld.submission.readCandidate(warnDraft.candidateId).lifecycle, "HUMAN_REVIEW");
});

test("similarity evidence only WARNs — a review trigger that never blocks and never approves (P9-16)", () => {
  const world = makeWorld();
  world.manifests.register(makeManifest({ version: "1.0.0" }));
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  world.submission.submitCandidate(draft.candidateId);
  const lane = world.submission.runAutomatedChecks(draft.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: { present: true, note: "fixture similarity signal 0.42" },
  });
  const similarity = lane.results.find((result) => result.checkId === "similarity-signal");
  assert.equal(similarity?.outcome, "warn");
  assert.match(similarity?.detail ?? "", /REVIEW TRIGGER ONLY/);
  // A similarity warning advances to HUMAN_REVIEW (trigger, not gate):
  assert.equal(world.submission.readCandidate(draft.candidateId).lifecycle, "HUMAN_REVIEW");

  // And the automated lane can NEVER approve: a candidate whose checks
  // ALL pass (including the similarity pass) is still only in
  // HUMAN_REVIEW — publication without a human approving decision is
  // refused typed (approval exists ONLY as a human decision):
  const cleanWorld = makeWorld();
  cleanWorld.manifests.register(makeManifest({ version: "1.0.0" }));
  const cleanDraft = cleanWorld.submission.startDraft(makeCandidateInput("1.0.0"));
  cleanWorld.submission.submitCandidate(cleanDraft.candidateId);
  cleanWorld.submission.runAutomatedChecks(cleanDraft.candidateId, {
    dependencySignals: { "trim-script": "clean" },
    similaritySignal: null,
  });
  assert.equal(
    cleanWorld.submission.readCandidate(cleanDraft.candidateId).lifecycle,
    "HUMAN_REVIEW",
  );
  assert.throws(
    () =>
      cleanWorld.listing.publishApprovedRelease({
        candidateId: cleanDraft.candidateId,
        title: "x",
        description: "x",
        category: "video",
        supportedFeedTypes: ["prerecorded"],
        expectedOutputs: ["x"],
        limitations: ["x"],
        compatibility: ["local"],
        support: "x",
        offer: {
          kind: "free",
          price: null,
          settlementProviderRef: null,
          usageLimits: { maxRuns: null, expiresAt: null },
          termsLicense: "MIT",
        },
        rightsPrerequisites: ["authorized source footage"],
        changelog: "x",
      }),
    (error: unknown) => {
      assert.ok(error instanceof TransformListingError);
      assert.ok(error.refusalKind.includes("candidate-not-approved"));
      return true;
    },
  );
});
