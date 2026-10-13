import type {
  TransformReviewDecision,
  TransformListing,
  TransformEntitlement,
  TransformSuspensionRecord,
  TransformListingSelectionResult,
} from "./contract.js";

/** Example review decision: automated pass + human signoff. */
export const exampleTransformReviewDecision: TransformReviewDecision = {
  decisionId: "dec:example",
  candidateDigest: "sha256:example",
  pipelineId: "pipe:example",
  version: "1.0.0",
  automatedChecks: [{ checkId: "graph-validation", outcome: "pass", evidenceKind: "fixture" }],
  humanReview: [
    { role: "product", reviewer: "reviewer:example", reviewedAt: "2026-10-13T00:00:00.000Z" },
    { role: "rights", reviewer: "reviewer:example", reviewedAt: "2026-10-13T00:00:00.000Z" },
    { role: "security", reviewer: "reviewer:example", reviewedAt: "2026-10-13T00:00:00.000Z" },
  ],
  outcome: "approved",
  policyVersion: "policy:example-v1",
  decidedAt: "2026-10-13T00:00:00.000Z",
  rationale: "deterministic first-slice pipeline, fixture evidence labeled",
  evidenceRefs: ["report:example"],
};

/** Example free listing (same gates as paid — lock 29). */
export const exampleTransformListing: TransformListing = {
  listingId: "list:example",
  pipelineId: "pipe:example",
  currentRelease: {
    version: "1.0.0",
    releaseDigest: "sha256:example",
    reviewedAt: "2026-10-13T00:00:00.000Z",
  },
  title: "Example deterministic clip trim",
  description: "first-slice free listing",
  category: "video",
  supportedFeedTypes: ["prerecorded"],
  expectedOutputs: ["trimmed video artifact"],
  limitations: ["no model, no live feed claims"],
  publisher: "publisher:example",
  status: "PUBLISHED",
  versionHistory: [{ version: "1.0.0", releaseDigest: "sha256:example", changelog: "initial" }],
  offer: {
    kind: "free",
    price: null,
    settlementProviderRef: null,
    usageLimits: { maxRuns: null, expiresAt: null },
    termsLicense: "MIT",
  },
  compatibility: ["local"],
  support: "publisher:example",
  expectations: { typicalLatencyMs: 500, declaredThroughput: "single clip", evidenceGrade: "fixture" },
  rightsPrerequisites: ["authorized source footage"],
  policy: {
    rights: { holders: ["holder:example"], usages: ["derive"], prohibitions: ["distribute"] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

/** Example free entitlement with idempotency key. */
export const exampleTransformEntitlement: TransformEntitlement = {
  entitlementId: "ent:example",
  principal: "user:example",
  pipelineId: "pipe:example",
  version: "1.0.0",
  releaseDigest: "sha256:example",
  offerKind: "free",
  settlementRef: null,
  idempotencyKey: "idem:example",
  usageLimits: { maxRuns: null, usedRuns: 0, expiresAt: null },
  status: "active",
  grantedAt: "2026-10-13T00:00:00.000Z",
  revokedAt: null,
};

/** Example suspension record. */
export const exampleTransformSuspensionRecord: TransformSuspensionRecord = {
  suspensionId: "susp:example",
  listingId: "list:example",
  pipelineId: "pipe:example",
  version: "1.0.0",
  reason: "example suspension",
  suspendedAt: "2026-10-13T00:00:00.000Z",
  suspendedBy: "operator:example",
  effect: "block-new-runs",
};

/** Example fail-closed selection refusal. */
export const exampleTransformListingSelectionResult: TransformListingSelectionResult = {
  admitted: false,
  reason: "rights-prerequisites-unsatisfied",
  detail: "source rights snapshot missing authorization for derive",
};
