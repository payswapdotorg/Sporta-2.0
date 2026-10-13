/**
 * The studio demo seed (W9C-6) — the fixture-labeled demo world content:
 * the local journal app descriptor and the marketplace publication
 * journey (draft → submit → automated checks → 3-role human review →
 * free listing → entitlement). The SERVICES and DIGESTS are real
 * (real sha256, real lifecycle state machines); the CONTENT (manifest,
 * reviewers, offers) is fixture-labeled demo data.
 */
import type { ApplicationEnvironmentDescriptor } from "@sporta/app-environments/contract";
import {
  EntitlementService,
  ListingService,
  ReviewService,
  Sha256MarketplaceHash,
  SubmissionService,
} from "@sporta/marketplace/contract";
import type { TransformPipelineManifest } from "@sporta/marketplace/contract";
import type { FixtureManifestSource } from "@sporta/marketplace/contract";
import { buildStudioManifest, initialStudioDraft, STUDIO_DEMO_POLICY } from "./studioGraph.js";

export const STUDIO_PRINCIPAL = "user:studio-demo";
export const STUDIO_TENANT = "tenant:studio-demo";
export const STUDIO_WORKSPACE = "ws:studio-demo";
export const STUDIO_APP_TARGET_IDENTITY = "local:sporta-journal-app";
export const STUDIO_SESSION_PERMISSIONS = ["app:sporta-journal:write"];

/** The three canonical reviewer signoffs (fixture reviewers, honest labels). */
export const STUDIO_THREE_ROLES = ["product", "rights", "security"].map((role) => ({
  role,
  reviewer: `reviewer:${role}-fixture`,
  reviewedAt: "2026-10-13T01:00:00.000Z",
}));

/** The demo journal app descriptor (fixture-labeled content, real shape). */
export function demoJournalDescriptor(): ApplicationEnvironmentDescriptor {
  return {
    descriptorId: "desc:sporta-journal-1",
    applicationId: "app:sporta-journal",
    providerAdapterId: "adapter:local-file-journal",
    appVersion: "1.2.0",
    targetKind: "local",
    targetIdentity: STUDIO_APP_TARGET_IDENTITY,
    workspaceBinding: { tenant: STUDIO_TENANT, workspace: STUDIO_WORKSPACE },
    capabilities: [
      {
        capabilityId: "cap:read-journal",
        capabilityClass: "observe",
        action: "read the journal status and note count",
        inputs: [],
        outputs: [{ name: "status", dataKind: "app/journal-status" }],
        sideEffects: [],
        requiredPermissions: [],
        failures: ["app-unreachable"],
      },
      {
        capabilityId: "cap:append-note",
        capabilityClass: "control",
        action: "append one training note to the journal",
        inputs: [{ name: "note", dataKind: "text/plain", required: true }],
        outputs: [{ name: "journal", dataKind: "app/journal-state" }],
        sideEffects: ["state:notes"],
        requiredPermissions: ["app:sporta-journal:write"],
        failures: ["app-unreachable", "journal-corrupt"],
      },
      {
        capabilityId: "cap:bind-note",
        capabilityClass: "semantic-binding",
        action: "map a journal note to a Sporta artifact id",
        inputs: [{ name: "noteId", dataKind: "app/note-id", required: true }],
        outputs: [{ name: "binding", dataKind: "sporta/artifact-ref" }],
        sideEffects: ["state:bindings"],
        requiredPermissions: ["app:sporta-journal:write"],
        failures: ["binding-conflict"],
      },
    ],
    launchRequirements: ["local journal state directory present"],
    dataClasses: ["journal-notes", "app-status"],
    networkNeeds: "none",
    licensing: { license: "MIT", provenance: "studio demo app (fixture-labeled)" },
    health: { checkedAt: "2026-10-13T00:00:00.000Z", status: "healthy" },
    limitations: ["demo journal; local file state only"],
    policy: STUDIO_DEMO_POLICY,
  };
}

/** Seed the marketplace demo world (real services, fixture-labeled seeds). */
export function seedStudioMarketplace(world: {
  manifests: FixtureManifestSource;
  submission: SubmissionService;
  review: ReviewService;
  listing: ListingService;
  entitlement: EntitlementService;
}): { listingId: string; manifest: TransformPipelineManifest } {
  const manifest = buildStudioManifest(initialStudioDraft());
  world.manifests.register(manifest);
  const marketHash = new Sha256MarketplaceHash();
  const draftRecord = world.submission.startDraft({
    pipelineId: manifest.pipelineId,
    version: manifest.version,
    manifestDigest: manifest.manifestDigest,
    contentHashes: [
      { kind: "code", digest: marketHash.text("code@studio-demo-1.0.0") },
      { kind: "runtime", digest: marketHash.text("runtime@studio-demo-1.0.0") },
    ],
    attestations: [
      { kind: "license", reference: "license:studio-demo-1.0.0" },
      { kind: "sbom", reference: "sbom:studio-demo-1.0.0" },
    ],
    submittedBy: "publisher:studio-demo",
  });
  world.submission.submitCandidate(draftRecord.candidateId);
  world.submission.runAutomatedChecks(draftRecord.candidateId, {
    dependencySignals: { "json-event-stream-trim": "clean" },
    similaritySignal: null,
  });
  world.review.recordReviewDecision({
    candidateId: draftRecord.candidateId,
    outcome: "approved",
    humanReview: STUDIO_THREE_ROLES,
    rationale: "studio demo: fixture-content pipeline, real process evidence",
    policyVersion: "policy:studio-demo-v1",
  });
  const listingRecord = world.listing.publishApprovedRelease({
    candidateId: draftRecord.candidateId,
    title: "Studio Demo — Event Stream Trim",
    description: "prerecorded feed trim pipeline (studio first slice)",
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: [...manifest.expectedOutputs],
    limitations: [...manifest.limitations],
    compatibility: ["local"],
    support: "publisher:studio-demo",
    offer: {
      kind: "free",
      price: null,
      settlementProviderRef: null,
      usageLimits: { maxRuns: null, expiresAt: null },
      termsLicense: "MIT",
    },
    rightsPrerequisites: ["authorized source footage"],
    changelog: "studio demo v1.0.0",
  });
  world.entitlement.grantEntitlement({
    principal: STUDIO_PRINCIPAL,
    listingId: listingRecord.listingId,
  });
  return { listingId: listingRecord.listingId, manifest };
}
