import type {
  TransformReviewDecision,
  TransformListing,
  TransformEntitlement,
  TransformSuspensionRecord,
  TransformListingSelectionResult,
  TransformCandidateRecord,
  TransformCheckLaneRecord,
  TransformLaunchDisclosure,
  TransformRightsSnapshot,
  TransformListingStateEvent,
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
  expectations: {
    typicalLatencyMs: 500,
    declaredThroughput: "single clip",
    evidenceGrade: "fixture",
  },
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

/** Example submitted candidate record (digest frozen at submission, P9-07). */
export const exampleTransformCandidateRecord: TransformCandidateRecord = {
  candidateId: "cand:example",
  pipelineId: "pipe:example",
  version: "1.0.0",
  candidateDigest: "sha256:example",
  manifestDigest: "sha256:example",
  contentHashes: [{ kind: "code", digest: "sha256:example" }],
  attestations: [{ kind: "sbom", reference: "sbom:example" }],
  submittedBy: "publisher:example",
  lifecycle: "SUBMITTED",
  createdAt: "2026-10-13T00:00:00.000Z",
  submittedAt: "2026-10-13T00:00:00.000Z",
};

/** Example automated check-lane record (typed outcomes + evidence kinds). */
export const exampleTransformCheckLaneRecord: TransformCheckLaneRecord = {
  laneId: "lane:example",
  candidateId: "cand:example",
  candidateDigest: "sha256:example",
  ranAt: "2026-10-13T00:00:00.000Z",
  results: [
    { checkId: "graph-validation", outcome: "pass", evidenceKind: "measured", detail: "example" },
    {
      checkId: "similarity-signal",
      outcome: "warn",
      evidenceKind: "fixture",
      detail: "example trigger",
    },
  ],
};

/** Example rights snapshot (caller-supplied evidence, P9-14). */
export const exampleTransformRightsSnapshot: TransformRightsSnapshot = {
  satisfied: ["authorized source footage"],
  evidenceRefs: ["rights:example"],
};

/** Example launch disclosure (P9-12: everything the launch UI must show). */
export const exampleTransformLaunchDisclosure: TransformLaunchDisclosure = {
  listingId: "list:example",
  publisher: "publisher:example",
  approvedVersion: "1.0.0",
  releaseDigest: "sha256:example",
  terms: {
    kind: "free",
    price: null,
    settlementProviderRef: null,
    usageLimits: { maxRuns: null, expiresAt: null },
    termsLicense: "MIT",
  },
  rightsPrerequisites: ["authorized source footage"],
  dependencies: [{ kind: "code", name: "trim-script", digest: "sha256:example", license: "MIT" }],
  outputs: ["trimmed video artifact"],
  limitations: ["no model, no live feed claims"],
  cost: null,
  latencyExpectations: {
    typicalLatencyMs: 500,
    declaredThroughput: "single clip",
    evidenceGrade: "fixture",
  },
  evidenceGrade: "fixture",
  reviewedAt: "2026-10-13T00:00:00.000Z",
  legalNotice:
    "Visual or measured similarity to source material is a quality signal and review trigger only; it never implies legal clearance, copyright safety, or authorized use. Rights prerequisites must be satisfied for every invocation.",
};

/** Example listing-state event (withdrawal provenance, no silent state loss). */
export const exampleTransformListingStateEvent: TransformListingStateEvent = {
  eventId: "lev:example",
  listingId: "list:example",
  pipelineId: "pipe:example",
  kind: "withdrawn",
  version: "1.0.0",
  reason: "example withdrawal",
  actor: "publisher:example",
  at: "2026-10-13T00:00:00.000Z",
  effect: "block-new-runs",
};
