/**
 * The browser fixture studio host (W10A-2) — the /sporta route's
 * Transform Studio host when the React surface runs in a BROWSER.
 *
 * EVIDENCE CLASS: FIXTURE, labeled in the UI itself (the studio header
 * renders the evidence badge from `host.evidence` — "FIXTURE HOST
 * (browser demo)"). The Node-only composition legs (the REAL
 * `@sporta/transforms` validator, the REAL marketplace services, the
 * fail-closed admission, the REAL deterministic-filter child process,
 * the REAL FS blob store) cannot execute in a browser bundle, so this
 * host carries realistic STATIC fixture snapshots — listings, review
 * status, disclosure, sample preview, app attachments — and
 * honestly-typed local fixture transitions for its ONE write path (the
 * launch-selection admission). It imports ONLY types from the studio
 * port module (erased at build); no Node dependency enters the bundle
 * (the browserFixtureHost.ts law, verbatim).
 *
 * The graph tab stays interactive: a small pure FIXTURE validator
 * mirrors the violation-kind vocabulary so the browser demo renders
 * realistic typed results. The REAL verdict always belongs to the
 * headless composition (studioComposition.ts, REAL-labeled) — nothing
 * here is ever claimed real.
 */
import type {
  StudioAppAttachmentView,
  StudioDisclosureView,
  StudioGraphDraft,
  StudioListingView,
  StudioReviewStatus,
  StudioSamplePreviewView,
  StudioValidationResult,
  TransformStudioHostPort,
} from "./studio/studioPorts.js";

const FIXTURE_PUBLISHED_LISTING_ID = "list:fixture-studio-published";
const FIXTURE_SUSPENDED_LISTING_ID = "list:fixture-studio-suspended";
const FIXTURE_RELEASE_DIGEST = "sha256:" + "4d".repeat(32);

const FIXTURE_LISTINGS: readonly StudioListingView[] = [
  {
    listingId: FIXTURE_PUBLISHED_LISTING_ID,
    pipelineId: "pipe:fixture-highlights-trim",
    title: "Fixture highlights trim (browser demo)",
    publisher: "publisher:fixture-studio",
    status: "PUBLISHED",
    approvedVersion: "1.0.0",
    releaseDigest: FIXTURE_RELEASE_DIGEST,
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["fixture listing — browser demo content only"],
    offer: { kind: "free", price: null },
    compatibility: ["local"],
    expectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    rightsPrerequisites: ["authorized source footage"],
    versionHistory: [
      { version: "1.0.0", releaseDigest: FIXTURE_RELEASE_DIGEST, changelog: "fixture release 1.0.0" },
    ],
  },
  {
    listingId: FIXTURE_SUSPENDED_LISTING_ID,
    pipelineId: "pipe:fixture-tag-boards",
    title: "Fixture tag boards (suspended, browser demo)",
    publisher: "publisher:fixture-studio",
    status: "SUSPENDED",
    approvedVersion: "1.0.0",
    releaseDigest: "sha256:" + "3e".repeat(32),
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["tag-board overlay"],
    limitations: ["fixture listing — browser demo content only"],
    offer: { kind: "free", price: null },
    compatibility: ["local"],
    expectations: { typicalLatencyMs: 600, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    rightsPrerequisites: ["authorized source footage"],
    versionHistory: [
      { version: "1.0.0", releaseDigest: "sha256:" + "3e".repeat(32), changelog: "fixture release 1.0.0" },
    ],
  },
];

const FIXTURE_REVIEWS: Readonly<Record<string, StudioReviewStatus>> = {
  [FIXTURE_PUBLISHED_LISTING_ID]: {
    outcome: "approved",
    decidedAt: "2026-10-13T12:03:00.000Z",
    policyVersion: "policy:fixture-studio-v1",
    rationale: "fixture review content — three roles signed the demo record",
    reviewerRoles: ["product", "rights", "security"],
    automatedChecks: [
      { checkId: "dependency-scan", outcome: "pass", evidenceKind: "fixture" },
      { checkId: "graph-validation", outcome: "pass", evidenceKind: "fixture" },
    ],
  },
};

const FIXTURE_DISCLOSURE: StudioDisclosureView = {
  listingId: FIXTURE_PUBLISHED_LISTING_ID,
  publisher: "publisher:fixture-studio",
  approvedVersion: "1.0.0",
  releaseDigest: FIXTURE_RELEASE_DIGEST,
  terms: { kind: "free", price: null, termsLicense: "MIT" },
  rightsPrerequisites: ["authorized source footage"],
  dependencies: [
    { kind: "code", name: "json-event-stream-trim", digest: FIXTURE_RELEASE_DIGEST, license: "MIT" },
  ],
  outputs: ["trimmed event stream"],
  limitations: ["fixture listing — browser demo content only"],
  cost: null,
  latencyExpectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
  evidenceGrade: "fixture",
  reviewedAt: "2026-10-13T12:03:00.000Z",
  legalNotice:
    "Visual or measured similarity to source material is a quality signal and review trigger only; it never implies legal clearance, copyright safety, or authorized use. Rights prerequisites must be satisfied for every invocation.",
};

const FIXTURE_PREVIEW: StudioSamplePreviewView = {
  pipelineId: "pipe:fixture-highlights-trim",
  version: "1.0.0",
  inputSummary: "5-event prerecorded fixture feed (browser demo)",
  outputSummary: "1 output revision (rev:fixture-1)",
  semanticEvidence: "fixture preview — the REAL measured preview lives in the headless composition",
  evidenceGrade: "fixture",
};

const FIXTURE_APPS: readonly StudioAppAttachmentView[] = [
  {
    applicationId: "app:fixture-tag-board",
    appVersion: "1.0.0",
    targetKind: "local",
    targetIdentity: "local:app:fixture-tag-board@1.0.0:browser-demo",
    descriptorId: "desc:fixture-tag-board",
    attachmentId: "att:fixture-observe-1",
    grantedClasses: ["observe"],
    notGrantedClasses: ["control"],
    grantedAt: "2026-10-13T12:00:00.000Z",
    expiresAt: "2026-11-13T12:00:00.000Z",
    revoked: false,
    learningConsent: { granted: false },
    dataClasses: ["app-status", "app-highlights"],
    networkNeeds: "none",
    limitations: ["fixture attachment — browser demo content only"],
    licensing: { license: "MIT", provenance: "fixture" },
    capabilities: [
      {
        capabilityId: "cap:fixture-read-status",
        capabilityClass: "observe",
        action: "read-status",
        sideEffects: [],
        requiredPermissions: [],
      },
      {
        capabilityId: "cap:fixture-append-highlight",
        capabilityClass: "control",
        action: "append-highlight",
        sideEffects: ["mutates highlights.json"],
        requiredPermissions: [],
      },
    ],
  },
  {
    applicationId: "app:fixture-tag-board",
    appVersion: "1.0.0",
    targetKind: "local",
    targetIdentity: "local:app:fixture-tag-board@1.0.0:browser-demo",
    descriptorId: "desc:fixture-tag-board",
    attachmentId: "att:fixture-revoked-1",
    grantedClasses: ["observe"],
    notGrantedClasses: ["control"],
    grantedAt: "2026-10-13T12:00:00.000Z",
    expiresAt: "2026-11-13T12:00:00.000Z",
    revoked: true,
    learningConsent: { granted: true, scope: "app-highlights", retention: "30 days" },
    dataClasses: ["app-status", "app-highlights"],
    networkNeeds: "none",
    limitations: ["fixture attachment — browser demo content only"],
    licensing: { license: "MIT", provenance: "fixture" },
    capabilities: [
      {
        capabilityId: "cap:fixture-read-status",
        capabilityClass: "observe",
        action: "read-status",
        sideEffects: [],
        requiredPermissions: [],
      },
      {
        capabilityId: "cap:fixture-append-highlight",
        capabilityClass: "control",
        action: "append-highlight",
        sideEffects: ["mutates highlights.json"],
        requiredPermissions: [],
      },
    ],
  },
];

/**
 * The pure FIXTURE validator (labeled): mirrors the frozen
 * violation-kind vocabulary so the browser demo renders realistic typed
 * results. NEVER the authority — the REAL validator is the headless
 * composition's `validateTransformPipelineManifest`.
 */
function fixtureValidateGraph(draft: StudioGraphDraft): StudioValidationResult {
  const violations: { kind: string; detail: string }[] = [];
  const seen = new Map<string, number>();
  for (const node of draft.nodes) seen.set(node.nodeId, (seen.get(node.nodeId) ?? 0) + 1);
  for (const [nodeId, count] of seen) {
    if (count > 1) violations.push({ kind: "duplicate-node", detail: `nodeId ${nodeId} declared ${count} times` });
  }
  const nodeIds = new Set(draft.nodes.map((node) => node.nodeId));
  for (const node of draft.nodes) {
    if (!/^sha256:[0-9a-f]{64}$/.test(node.componentDigest)) {
      violations.push({ kind: "unpinned-component", detail: `node ${node.nodeId} component ${node.componentName} digest is not sha256:<64 hex>` });
    }
  }
  for (const edge of draft.edges) {
    if (!nodeIds.has(edge.from.nodeId)) {
      violations.push({ kind: "unknown-node", detail: `edge from references unknown node ${edge.from.nodeId}` });
    }
    if (!nodeIds.has(edge.to.nodeId)) {
      violations.push({ kind: "unknown-node", detail: `edge to references unknown node ${edge.to.nodeId}` });
    }
  }
  if (violations.length > 0) return { valid: false, violations };
  return { valid: true, nodeCount: draft.nodes.length, edgeCount: draft.edges.length };
}

/** The labeled fixture studio host for the browser route (see file header). */
export function createStudioBrowserFixtureHost(): TransformStudioHostPort {
  return {
    evidence: "fixture",
    async validateGraph(draft: StudioGraphDraft): Promise<StudioValidationResult> {
      return fixtureValidateGraph(draft); // FIXTURE-labeled demo checks, never the authority
    },
    async listListings(): Promise<readonly StudioListingView[]> {
      return [...FIXTURE_LISTINGS];
    },
    async readReviewStatus(listingId: string): Promise<StudioReviewStatus | null> {
      return FIXTURE_REVIEWS[listingId] ?? null;
    },
    async readLaunchDisclosure(listingId: string): Promise<StudioDisclosureView> {
      if (listingId !== FIXTURE_PUBLISHED_LISTING_ID && listingId !== FIXTURE_SUSPENDED_LISTING_ID) {
        throw new Error(`fixture host: no listing ${listingId} (typed refusal — never a fabricated disclosure)`);
      }
      return { ...FIXTURE_DISCLOSURE, listingId };
    },
    async readSamplePreview(pipelineId: string, version: string): Promise<StudioSamplePreviewView | null> {
      return pipelineId === FIXTURE_PREVIEW.pipelineId && version === FIXTURE_PREVIEW.version
        ? { ...FIXTURE_PREVIEW }
        : null;
    },
    async listAppAttachments(): Promise<readonly StudioAppAttachmentView[]> {
      return FIXTURE_APPS.map((app) => ({ ...app, capabilities: [...app.capabilities] }));
    },
    async selectForLaunch(listingId: string) {
      // The fixture admission is honestly typed: the suspended fixture
      // listing refuses; the published one admits its fixture digest.
      // Both are FIXTURE results (the badge says so; never claimed real).
      if (listingId === FIXTURE_SUSPENDED_LISTING_ID) {
        return {
          admitted: false as const,
          reason: "suspended",
          detail: "fixture: listing is SUSPENDED — new runs are blocked (browser demo of the typed refusal)",
        };
      }
      if (listingId !== FIXTURE_PUBLISHED_LISTING_ID) {
        return {
          admitted: false as const,
          reason: "listing-not-published",
          detail: `fixture: no listing ${listingId}`,
        };
      }
      return {
        admitted: true as const,
        listingId,
        releaseDigest: FIXTURE_RELEASE_DIGEST,
        entitlementId: "ent:fixture-studio-1",
      };
    },
  };
}
