/**
 * Transform Studio host ports — the packages/web/src/sporta surface-law
 * types for the W9C-8 studio (the hostPorts.ts precedent).
 *
 * TYPE-ONLY module: these types are what the studio render surface and
 * the headless Node composition share. The composition implements the
 * host port over the REAL @sporta/transforms validation port and the
 * REAL @sporta/marketplace read ports (that wiring is a TL seam — see
 * README.md; this lane owns zero edits outside its roots).
 *
 * Surface law: read-only studio state + EXACTLY the launch-selection
 * write path (disclosure -> confirm -> admission). Any other mutation
 * through the studio is a spec violation.
 */

/** Honest evidence grade surfaced IN the UI (the honesty law). */
export type StudioEvidenceGrade = "measured" | "fixture" | "declared";

/** Honest backing of the studio host (labeled, never claimed real). */
export type StudioHostEvidence = "real" | "fixture";

/** One typed input/output port on a studio node draft. */
export interface StudioPortSpec {
  name: string;
  dataKind: string;
  required: boolean;
  cardinality: "single" | "stream";
}

/** A node being composed in the graph builder (before validation). */
export interface StudioNodeDraft {
  nodeId: string;
  kind: "model" | "script" | "deterministic-filter" | "sporta-capability" | "application-environment-action";
  componentName: string;
  componentDigest: string;
  inputs: readonly StudioPortSpec[];
  outputs: readonly StudioPortSpec[];
}

/** An edge being composed in the graph builder. */
export interface StudioEdgeDraft {
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

/** The draft graph handed to the validation port. */
export interface StudioGraphDraft {
  nodes: readonly StudioNodeDraft[];
  edges: readonly StudioEdgeDraft[];
}

/**
 * The validation-result shape the studio consumes — structurally the
 * @sporta/transforms TransformGraphValidation (compat is proven by
 * the battery tests + the ad-hoc tsc typecheck in W9C evidence).
 */
export type StudioValidationResult =
  | { valid: true; nodeCount: number; edgeCount: number }
  | {
      valid: false;
      violations: readonly { kind: string; detail: string }[];
    };

/** Review status of one pipeline version (marketplace read shape). */
export interface StudioReviewStatus {
  outcome: string;
  decidedAt: string;
  policyVersion: string;
  rationale: string;
  reviewerRoles: readonly string[];
  automatedChecks: readonly {
    checkId: string;
    outcome: "pass" | "fail" | "warn";
    evidenceKind: "measured" | "fixture";
  }[];
}

/** Marketplace listing view (marketplace read shape). */
export interface StudioListingView {
  listingId: string;
  pipelineId: string;
  title: string;
  publisher: string;
  status: string;
  approvedVersion: string;
  releaseDigest: string;
  category: string;
  supportedFeedTypes: readonly string[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  offer: {
    kind: "free" | "paid-per-run" | "subscription";
    price: { amount: number; currency: string } | null;
  };
  compatibility: readonly string[];
  expectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: StudioEvidenceGrade;
  };
  rightsPrerequisites: readonly string[];
  versionHistory: readonly { version: string; releaseDigest: string; changelog: string }[];
}

/** Launch disclosure view (what the user MUST see before launch, P9-12). */
export interface StudioDisclosureView {
  listingId: string;
  publisher: string;
  approvedVersion: string;
  releaseDigest: string;
  terms: {
    kind: "free" | "paid-per-run" | "subscription";
    price: { amount: number; currency: string } | null;
    termsLicense: string;
  };
  rightsPrerequisites: readonly string[];
  dependencies: readonly { kind: string; name: string; digest: string; license: string }[];
  outputs: readonly string[];
  limitations: readonly string[];
  cost: { amount: number; currency: string } | null;
  latencyExpectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: StudioEvidenceGrade;
  };
  evidenceGrade: StudioEvidenceGrade;
  reviewedAt: string;
  legalNotice: string;
}

/** Sample-preview view (fixture/measured-labeled output preview). */
export interface StudioSamplePreviewView {
  pipelineId: string;
  version: string;
  inputSummary: string;
  outputSummary: string;
  semanticEvidence: string;
  evidenceGrade: StudioEvidenceGrade;
}

/** Attached-app permission/data-scope view (the app disclosure, P9-12). */
export interface StudioAppCapabilityView {
  capabilityId: string;
  capabilityClass: string;
  action: string;
  sideEffects: readonly string[];
  requiredPermissions: readonly string[];
}

export interface StudioAppAttachmentView {
  applicationId: string;
  appVersion: string;
  targetKind: string;
  targetIdentity: string;
  descriptorId: string;
  attachmentId: string;
  grantedClasses: readonly string[];
  notGrantedClasses: readonly string[];
  grantedAt: string;
  expiresAt: string;
  revoked: boolean;
  learningConsent: { granted: boolean; scope?: string; retention?: string };
  dataClasses: readonly string[];
  networkNeeds: string;
  limitations: readonly string[];
  licensing: { license: string; provenance: string };
  capabilities: readonly StudioAppCapabilityView[];
}

/** Feed-launch admission result shape (marketplace selection shape). */
export type StudioLaunchAdmissionResult =
  | { admitted: true; listingId: string; releaseDigest: string; entitlementId: string }
  | { admitted: false; reason: string; detail: string };

/**
 * W11B — the live-source evidence view (the W10 lanes, VERBATIM).
 *
 * Structural mirror of the frozen `LiveSourceDescriptor` +
 * `LiveSessionEvidence` (@sporta/transforms W10 freeze) — the
 * studio-lane law: the render modules never import @sporta/* at
 * runtime; the composition passes their records in. The display layer
 * (liveSourceViews.ts) carries these values through UNCHANGED: the
 * exact grade string (`real-local-live` — "production" is unutterable
 * in the closed vocabulary), frame statistics, close reason, and typed
 * refusals (kind + detail + frames consumed) are shown as returned.
 */
export interface StudioLiveSourceView {
  readonly descriptor: {
    readonly sourceId: string;
    readonly grade: "real-local-live" | "fixture";
    readonly contentKind: string;
    readonly cadenceMs: number;
    readonly queueBound: number;
  };
  /** The pinned session evidence; null when the source has no session yet. */
  readonly session: {
    readonly framesConsumed: number;
    readonly openedAt: string;
    readonly closedAt: string | null;
    readonly closeReason: "completed" | "aborted" | "refused" | "in-flight";
    readonly refusal: {
      readonly kind: string;
      readonly detail: string;
      readonly framesConsumed: number;
    } | null;
  } | null;
}

/**
 * The studio host port: reads over the real validation/marketplace/
 * app-environment seams + EXACTLY one write path (launch selection).
 */
export interface TransformStudioHostPort {
  /** The backing evidence grade, surfaced honestly in the UI. */
  readonly evidence: StudioHostEvidence;
  /** Validate a draft graph through the REAL transforms validation port. */
  validateGraph(draft: StudioGraphDraft): Promise<StudioValidationResult>;
  /** List published listings (marketplace read port). */
  listListings(): Promise<readonly StudioListingView[]>;
  /** Review status for one pipeline version (null when not reviewed). */
  readReviewStatus(pipelineId: string, version: string): Promise<StudioReviewStatus | null>;
  /** The launch disclosure for a listing (P9-12 — shown BEFORE launch). */
  readLaunchDisclosure(listingId: string): Promise<StudioDisclosureView>;
  /** Sample preview for a pipeline version. */
  readSamplePreview(pipelineId: string, version: string): Promise<StudioSamplePreviewView | null>;
  /** Attached apps with their permission/data-scope disclosure. */
  listAppAttachments(): Promise<readonly StudioAppAttachmentView[]>;
  /**
   * The single write path: select a pipeline for a feed launch. Runs
   * the fail-closed marketplace admission and returns its typed result.
   */
  selectForLaunch(listingId: string): Promise<StudioLaunchAdmissionResult>;
  /**
   * W11B OPTIONAL seam: the pinned live-source evidence (the W10
   * lanes). Hosts without a live composition omit the method; the
   * workbench shows an honest "not composed into this host" empty
   * state — never fabricated evidence.
   */
  readLiveSourceEvidence?(): Promise<readonly StudioLiveSourceView[]>;
  /** Optional dispose for composition-owned resources. */
  dispose?(): Promise<void>;
}
