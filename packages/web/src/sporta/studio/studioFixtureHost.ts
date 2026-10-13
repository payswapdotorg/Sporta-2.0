/**
 * The studio fixture host (W9C-6) — the /sporta route's STUDIO host when
 * the React surface runs in a BROWSER.
 *
 * EVIDENCE CLASS: FIXTURE, labeled in the UI itself (the evidence badge
 * renders "FIXTURE HOST"). The Node-only composition legs (real spawn,
 * real FS blob store, real local app target) cannot execute in a
 * browser bundle, so this host carries a static fixture snapshot of the
 * studio state and honestly transitions its write paths against that
 * local fixture state — the same StudioHostPort contract the real
 * headless composition implements. It imports ONLY types (erased at
 * build); no Node dependency enters the bundle.
 */
import type {
  StudioGraphEdit,
  StudioHostPort,
  StudioLaunchState,
  StudioPreviewState,
  StudioState,
} from "./studioPorts.js";
import type { StudioAppActionResult } from "./studioPorts.js";

const graphBase = {
  pipelineId: "pipe:studio-demo",
  version: "1.0.0",
  nodes: [
    {
      nodeId: "node:trim",
      kind: "deterministic-filter",
      componentName: "json-event-stream-trim",
      componentDigest: "sha256:fixture-trim-digest",
      note: "REAL w9a deterministic filter (real child process)",
    },
  ],
  edges: [] as { from: string; to: string }[],
  parameters: { "node:trim": { startMs: 1000, endMs: 4000 } } as Record<
    string,
    Record<string, unknown>
  >,
};

function fixtureGraph() {
  return {
    ...graphBase,
    validation: { valid: true as const, nodeCount: 1, edgeCount: 0 },
  };
}

function fixturePreview(): StudioPreviewState {
  return {
    status: "ran",
    detail: "kept 3, dropped 2 events",
    outputPreview: "fixture preview bytes",
    laneNotes: ["fixture: deterministic lane summary (browser demo)"],
    evidenceGrade: "fixture",
  };
}

function fixtureLaunch(): StudioLaunchState {
  return {
    feedKind: "prerecorded",
    ingressGrade: "fixture",
    lastAdmission: {
      admitted: true,
      detail: "fixture: entitlement admitted the pinned release",
      releaseDigest: "sha256:fixture-release-digest",
    },
    lastDisclosure: {
      listingId: "list:fixture",
      publisher: "publisher:studio-demo",
      approvedVersion: "1.0.0",
      releaseDigest: "sha256:fixture-release-digest",
      terms: {
        kind: "free",
        price: null,
        settlementProviderRef: null,
        usageLimits: { maxRuns: null, expiresAt: null },
        termsLicense: "MIT",
      },
      rightsPrerequisites: ["authorized source footage"],
      dependencies: [{ kind: "code", name: "json-event-stream-trim", digest: "sha256:fixture", license: "MIT" }],
      outputs: ["trimmed event stream"],
      limitations: ["test only", "browser fixture host"],
      cost: null,
      latencyExpectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
      evidenceGrade: "fixture",
      reviewedAt: "2026-10-13T01:00:00.000Z",
      legalNotice:
        "Visual or measured similarity to source material is a quality signal and review trigger only; it never implies legal clearance, copyright safety, or authorized use. Rights prerequisites must be satisfied for every invocation.",
    },
    lastRunManifest: {
      runManifestId: "runm:fixture",
      releaseDigest: "sha256:fixture-release-digest",
      outputs: 1,
      semanticFidelity: { grade: "fixture", note: "fixture browser host" },
      steps: [{ nodeId: "node:trim", status: "succeeded" }],
    },
  };
}

/** The labeled fixture host for a browser route (see file header). */
export function createStudioFixtureHost(): StudioHostPort {
  const local = { attached: false, control: false, revoked: false, learning: false, audited: false };

  const base = (): StudioState => ({
    evidence: "fixture",
    graph: fixtureGraph(),
    preview: local.audited ? fixturePreview() : null,
    marketplace: {
      listing: null,
      decisions: [],
      disclosure: local.attached ? fixtureLaunch().lastDisclosure : null,
    },
    launch: local.attached ? fixtureLaunch() : null,
    apps: {
      attachableApp: {
        applicationId: "app:sporta-journal",
        descriptorId: "desc:sporta-journal-1",
        targetIdentity: "local:sporta-journal-app",
        targetKind: "local",
        dataScope: ["journal-notes", "app-status"],
        networkNeeds: "none",
        limitations: ["demo journal; local file state only"],
        licensing: { license: "MIT", provenance: "studio demo app (fixture-labeled)" },
        capabilities: [
          { capabilityId: "cap:read-journal", capabilityClass: "observe", action: "read the journal status and note count", sideEffects: [], requiredPermissions: [] },
          { capabilityId: "cap:append-note", capabilityClass: "control", action: "append one training note to the journal", sideEffects: ["state:notes"], requiredPermissions: ["app:sporta-journal:write"] },
        ],
      },
      attached: local.attached
        ? [
            {
              attachment: {
                attachmentId: "att:fixture",
                applicationId: "app:sporta-journal",
                descriptorId: "desc:sporta-journal-1",
                consentedBy: "user:studio-demo",
                tenant: "tenant:studio-demo",
                scope: { workspace: "ws:studio-demo", workGraphId: null },
                grantedCapabilityClasses: local.control ? ["observe", "control"] : ["observe"],
                grantedAt: "2026-10-13T00:00:00.000Z",
                expiresAt: "2026-10-14T00:00:00.000Z",
                revokedAt: local.revoked ? "2026-10-13T02:00:00.000Z" : null,
                policySnapshot: "policy:studio-demo-v1",
                learningConsent: local.learning
                  ? { granted: true, scope: "workflow", retention: "90d" }
                  : { granted: false },
              },
              dataScope: ["journal-notes", "app-status"],
              capabilityCatalog: [],
              sessions: [
                {
                  sessionId: "sess:fixture",
                  attachmentId: "att:fixture",
                  versions: { app: "1.2.0", adapter: "adapter:local-file-journal", target: "local:sporta-journal-app" },
                  activeGrants: ["observe"],
                  openedAt: "2026-10-13T01:00:00.000Z",
                  closedAt: null,
                  closeState: "active",
                  checkpointRefs: [],
                  auditStreamRef: "audit-stream:sess:fixture:att:fixture",
                },
              ],
              auditTrail: local.audited
                ? [
                    {
                      actionRecordId: "act:fixture",
                      sessionId: "sess:fixture",
                      actor: "agent:studio-demo",
                      capabilityId: "cap:read-journal",
                      capabilityClass: "observe",
                      targetIdentity: "local:sporta-journal-app",
                      sanitizedInputRefs: [],
                      sanitizedOutputRefs: ["ref:fixture-status"],
                      permissionDecision: { decision: "allowed", basis: "granted-scope", decidedBy: "policy:studio-demo-v1" },
                      effects: [{ kind: "status-read", evidenceRef: "ref:fixture-status", verified: true }],
                      status: "succeeded",
                      reconciledRefs: { workGraphId: "wg:fixture", artifactRevisionIds: [] },
                      recordedAt: "2026-10-13T01:30:00.000Z",
                      missingCoverageNote: null,
                    },
                  ]
                : [],
              targetVerification: { reachable: true, stateDigest: "sha256:fixture-state" },
            },
          ]
        : [],
    },
  });

  return {
    async readState() {
      return base();
    },
    async applyGraphEdit(_edit: StudioGraphEdit) {
      return base();
    },
    async validateGraph() {
      return base();
    },
    async previewSample() {
      local.audited = true;
      return base();
    },
    async selectForLaunch() {
      local.attached = true;
      return base();
    },
    async launchSelectedPipeline() {
      local.attached = true;
      local.audited = true;
      return base();
    },
    async attachApp() {
      local.attached = true;
      return base();
    },
    async amendAppGrant() {
      local.control = true;
      return base();
    },
    async revokeAppAttachment() {
      local.revoked = true;
      return base();
    },
    async grantLearningConsent() {
      local.learning = true;
      return base();
    },
    async executeAppAction() {
      const result: StudioAppActionResult = {
        admission: local.revoked
          ? { admitted: false, reason: "attachment-revoked", detail: "fixture: attachment revoked — new actions are blocked" }
          : { admitted: true, capabilityId: "cap:append-note", requiresConfirmation: false },
        record: {
          actionRecordId: "act:fixture",
          sessionId: "sess:fixture",
          actor: "agent:studio-demo",
          capabilityId: "cap:append-note",
          capabilityClass: "control",
          targetIdentity: "local:sporta-journal-app",
          sanitizedInputRefs: [],
          sanitizedOutputRefs: ["ref:fixture-journal"],
          permissionDecision: { decision: "allowed", basis: "granted-scope", decidedBy: "policy:studio-demo-v1" },
          effects: [{ kind: "state:notes", evidenceRef: "ref:fixture-journal", verified: true }],
          status: local.revoked ? "denied" : "succeeded",
          reconciledRefs: { workGraphId: "wg:fixture", artifactRevisionIds: ["rev:fixture-1"] },
          recordedAt: "2026-10-13T02:00:00.000Z",
          missingCoverageNote: null,
        },
      };
      return { ...base(), lastActionResult: result };
    },
  };
}
