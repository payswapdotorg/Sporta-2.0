import type {
  TransformReviewDecision,
  TransformListing,
  TransformEntitlement,
  TransformSuspensionRecord,
  TransformListingSelectionResult,
  TransformRightsSnapshot,
  TransformLaunchDisclosure,
  SettlementRecord,
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

/** Example caller-supplied rights snapshot (typed evidence, P9-14). */
export const exampleTransformRightsSnapshot: TransformRightsSnapshot = {
  snapshotId: "rights:example",
  capturedAt: "2026-10-13T00:00:00.000Z",
  satisfactions: [
    { prerequisite: "authorized source footage", authorized: true, evidence: "league license l-123" },
    { prerequisite: "model and dataset licenses", authorized: true, evidence: "MIT weights card" },
  ],
  authorizedUsages: ["render", "derive"],
};

/** Example launch disclosure (P9-12: what the user sees pre-launch). */
export const exampleTransformLaunchDisclosure: TransformLaunchDisclosure = {
  listingId: "list:example",
  pipelineId: "pipe:example",
  publisher: "publisher:example",
  approvedVersion: "1.0.0",
  releaseDigest: "sha256:example",
  reviewedAt: "2026-10-13T00:00:00.000Z",
  offer: exampleTransformListing.offer,
  rightsPrerequisites: ["authorized source footage"],
  dependencies: [{ kind: "code", name: "trim-script", digest: "sha256:example", license: "MIT" }],
  expectedOutputs: ["trimmed video artifact"],
  limitations: ["no model, no live feed claims"],
  costExpectation: { amount: null, currency: null, basis: "free offer — no charge per run" },
  latencyExpectation: { typicalLatencyMs: 500, declaredThroughput: "single clip" },
  evidenceGrade: "fixture",
  provenanceNote:
    "output provenance points to the source rights scope and pipeline release sha256:example " +
    "(version 1.0.0); no guarantee of legality for every downstream use — similarity is never clearance",
  generatedAt: "2026-10-13T00:00:00.000Z",
};

/** Example FIXTURE-labeled settlement record (P9-11 idempotency). */
export const exampleSettlementRecord: SettlementRecord = {
  settlementId: "setl:fixture:example",
  idempotencyKey: "idem:example",
  status: "settled",
  amount: { amount: 5, currency: "USD" },
  settledAt: "2026-10-13T00:00:00.000Z",
  duplicate: false,
  attempts: 1,
  detail: "FIXTURE settlement settled (deterministic test adapter — not a real charge)",
};
