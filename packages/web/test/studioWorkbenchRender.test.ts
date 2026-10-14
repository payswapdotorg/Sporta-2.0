/**
 * W11B-3 — the workbench panel render tests (packages/web,
 * node:test + tsx, react-dom/server static rendering — no new test
 * framework, no DOM environment, no CSS involved: the panels import
 * only pure view-models).
 *
 * EVIDENCE CLASS (labeled): COMPONENT-LEVEL — real React renders of
 * the workbench panels against REAL typed fixtures (the browser
 * fixture host's snapshots + the frozen contract shapes), asserting
 * the honest-evidence laws at the render layer: grades verbatim,
 * refusals as refusals, loading/empty/error states present, disabled
 * controls carry reasons. The ROOT surface (TransformStudio.tsx,
 * which imports studio.css) stays BUILD-VERIFIED per the project law
 * (CSS cannot load under the Node runner); browser journeys are
 * Worker C's lane.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// RUNNER LAW NOTE: the standard battery (`pnpm exec tsx --test` from the
// repo root) transforms .tsx with esbuild's CLASSIC JSX runtime (no
// root tsconfig carries `jsx: react-jsx`), which emits free
// `React.createElement` references resolved at runtime. Registering
// React globally BEFORE the panel imports makes them render under the
// classic transform AND under an explicit `--tsconfig packages/web`
// run (where the automatic runtime simply ignores the shim). No src
// file changes for this — it is test-file-local.
(globalThis as unknown as { React: unknown }).React = React;

const { SourceRail } = await import("../src/sporta/studio/SourceRail.js");
const { PipelinePicker } = await import("../src/sporta/studio/PipelinePicker.js");
const { GraphPanel } = await import("../src/sporta/studio/GraphPanel.js");
const { PreviewPanel } = await import("../src/sporta/studio/PreviewPanel.js");
const { LaunchPanel } = await import("../src/sporta/studio/LaunchPanel.js");
const { StatusPanel } = await import("../src/sporta/studio/StatusPanel.js");
const { AppsSummary, MarketplaceSummary } = await import("../src/sporta/studio/StudioSummaries.js");
import { createStudioBrowserFixtureHost } from "../src/sporta/studioBrowserFixture.js";
import { initialWorkbenchFlow, selectWorkbenchListing, selectWorkbenchSource, markWorkbenchLaunch } from "../src/sporta/studio/workbench.js";
import type { StudioListingView, StudioAppAttachmentView } from "../src/sporta/studio/studioPorts.js";

const createElement = React.createElement;
const render = (element: React.ReactElement): string => renderToStaticMarkup(element);

async function fixtureListings(): Promise<readonly StudioListingView[]> {
  return createStudioBrowserFixtureHost().listListings();
}

async function fixtureApps(): Promise<readonly StudioAppAttachmentView[]> {
  return createStudioBrowserFixtureHost().listAppAttachments();
}

test("W11B-3 render: SourceRail shows badges, stage rail, honest live-source absence, and reasoned disabled links", () => {
  const html = render(
    createElement(SourceRail, {
      flow: initialWorkbenchFlow(),
      progress: [
        { stage: "source", label: "Source", state: "current", detail: "select a recorded or live feed" },
        { stage: "pipeline", label: "Pipeline", state: "locked", detail: "select a published pipeline" },
      ],
      liveSources: "unavailable",
      liveState: "loaded",
      liveError: null,
      hostEvidence: "fixture",
      screenGrade: "fixture",
      shell: null,
      navRefusal: null,
      onSelectSource: () => undefined,
      onNavigate: () => undefined,
    }),
  );
  assert.match(html, /FIXTURE HOST \(browser demo\)/);
  assert.match(html, /screen evidence: fixture/);
  assert.match(html, /Workflow/);
  assert.match(html, /Feed source/);
  assert.match(html, /Recorded sample feed/);
  assert.match(
    html,
    /Live-source evidence is not composed into this studio host yet/,
    "the honest absence state renders",
  );
  assert.match(html, /Shell navigation is not wired into this studio mount yet/);
  assert.match(html, /disabled/, "the cross-screen links are disabled with a reason, not hidden");
  assert.match(html, /aria-current="step"/, "the current stage is announced");
});

test("W11B-3 render: SourceRail carries live evidence VERBATIM and the refusal line renders as an alert", () => {
  const html = render(
    createElement(SourceRail, {
      flow: initialWorkbenchFlow(),
      progress: [],
      liveSources: [
        {
          descriptor: {
            sourceId: "live:studio-workbench-1",
            grade: "real-local-live",
            contentKind: "application/jsonl",
            cadenceMs: 25,
            queueBound: 8,
          },
          session: {
            framesConsumed: 3,
            openedAt: "2026-10-14T12:00:00.000Z",
            closedAt: "2026-10-14T12:00:00.500Z",
            closeReason: "refused",
            refusal: { kind: "queue-overflow", detail: "client queue bound (8) exceeded", framesConsumed: 3 },
          },
        },
      ],
      liveState: "loaded",
      liveError: null,
      hostEvidence: "real",
      screenGrade: "real",
      shell: null,
      navRefusal: null,
      onSelectSource: () => undefined,
      onNavigate: () => undefined,
    }),
  );
  assert.match(html, /real-local-live/, "the exact grade string renders");
  assert.match(html, /Frames consumed/);
  assert.match(html, /queue-overflow — client queue bound \(8\) exceeded \(frames consumed before refusal: 3\)/);
  assert.match(html, /role="alert"/, "the refusal renders as an alert, never a success");
  assert.match(html, /REAL HOST/);
});

test("W11B-3 render: PipelinePicker shows loading, error, empty, and the honest suspended state", async () => {
  const listings = await fixtureListings();
  const loading = render(
    createElement(PipelinePicker, {
      listings: null,
      loading: true,
      error: null,
      selectedListingId: null,
      onSelect: () => undefined,
    }),
  );
  assert.match(loading, /Loading pipelines…/);

  const failed = render(
    createElement(PipelinePicker, {
      listings: null,
      loading: false,
      error: "listings store unreachable",
      selectedListingId: null,
      onSelect: () => undefined,
    }),
  );
  assert.match(failed, /Pipelines failed to load: listings store unreachable/);
  assert.match(failed, /role="alert"/);

  const empty = render(
    createElement(PipelinePicker, {
      listings: [],
      loading: false,
      error: null,
      selectedListingId: null,
      onSelect: () => undefined,
    }),
  );
  assert.match(empty, /No pipelines available/);

  const full = render(
    createElement(PipelinePicker, {
      listings,
      loading: false,
      error: null,
      selectedListingId: null,
      onSelect: () => undefined,
    }),
  );
  assert.match(full, /Fixture highlights trim \(browser demo\)/);
  assert.match(full, /SUSPENDED — new runs blocked/, "the suspended listing stays visible, marked not-selectable");
  assert.match(full, /disabled/, "the suspended listing's button is disabled");
});

test("W11B-3 render: GraphPanel renders the empty work area with a disabled validate control", () => {
  const html = render(createElement(GraphPanel, { host: createStudioBrowserFixtureHost() }));
  assert.match(html, /Pipeline graph/);
  assert.match(html, /No nodes drafted yet/);
  assert.match(html, /Validate graph/);
  assert.match(html, /disabled/, "validation is disabled until the draft is submittable");
  assert.match(html, /Component digest \(declared, optional\)/);
});

test("W11B-3 render: PreviewPanel covers loading, error, honest-null, and measured evidence states", async () => {
  const listings = await fixtureListings();
  const listing = listings[0];
  assert.ok(listing !== undefined);
  const loading = render(
    createElement(PreviewPanel, {
      listing,
      preview: null,
      loading: true,
      error: null,
      review: null,
    }),
  );
  assert.match(loading, /Running the sample preview…/);

  const nullPreview = render(
    createElement(PreviewPanel, {
      listing,
      preview: null,
      loading: false,
      error: null,
      review: null,
    }),
  );
  assert.match(nullPreview, /No sample preview available/, "an honest null is stated, never fabricated");
  assert.match(nullPreview, /No review decision recorded/);

  const measured = render(
    createElement(PreviewPanel, {
      listing,
      preview: {
        pipelineId: listing.pipelineId,
        version: listing.approvedVersion,
        inputSummary: "5-event prerecorded sample feed (window 1500ms..4500ms)",
        outputSummary: "1 output revision (rev:measured-1)",
        semanticEvidence: "3 kept byte-exact, 2 dropped — measured carry-forward",
        evidenceGrade: "measured",
      },
      loading: false,
      error: null,
      review: {
        outcome: "approved",
        decidedAt: "2026-10-13T12:03:00.000Z",
        policyVersion: "policy:fixture-studio-v1",
        rationale: "fixture review content",
        reviewerRoles: ["product", "rights", "security"],
        automatedChecks: [{ checkId: "dependency-scan", outcome: "pass", evidenceKind: "fixture" }],
      },
    }),
  );
  assert.match(measured, /3 kept byte-exact, 2 dropped/);
  assert.match(measured, /grade MEASURED \(measured\)/);
  assert.match(measured, /all three signoffs/);
});

test("W11B-3 render: LaunchPanel walks disclosure -> confirmation and renders the refusal verbatim", () => {
  const disclosure = {
    listingId: "list:fixture-studio-published",
    publisher: "publisher:fixture-studio",
    approvedVersion: "1.0.0",
    releaseDigest: "sha256:" + "4d".repeat(32),
    terms: { kind: "free" as const, price: null, termsLicense: "MIT" },
    rightsPrerequisites: ["authorized source footage"],
    dependencies: [{ kind: "code", name: "json-event-stream-trim", digest: "sha256:" + "4d".repeat(32), license: "MIT" }],
    outputs: ["trimmed event stream"],
    limitations: ["fixture listing — browser demo content only"],
    cost: null,
    latencyExpectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" as const },
    evidenceGrade: "fixture" as const,
    reviewedAt: "2026-10-13T12:03:00.000Z",
    legalNotice: "Visual or measured similarity to source material is a quality signal and review trigger only.",
  };
  const idle = render(
    createElement(LaunchPanel, {
      selection: null,
      busy: false,
      loadError: null,
      canBegin: false,
      onBegin: () => undefined,
      onRequestConfirmation: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.match(idle, /The disclosure is always shown before launch/);
  assert.match(idle, /disabled/, "the disclosure cannot open without source + pipeline");

  const shown = render(
    createElement(LaunchPanel, {
      selection: { stage: "disclosure", feedKind: "prerecorded", disclosure },
      busy: false,
      loadError: null,
      canBegin: true,
      onBegin: () => undefined,
      onRequestConfirmation: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.match(shown, /Launch disclosure — publisher:fixture-studio v1\.0\.0/);
  assert.match(shown, /Feed: prerecorded/);
  assert.match(shown, /authorized source footage/);
  assert.match(shown, /Proceed to launch confirmation/);

  const confirmed = render(
    createElement(LaunchPanel, {
      selection: { stage: "awaiting-confirmation", feedKind: "live", disclosure },
      busy: false,
      loadError: null,
      canBegin: true,
      onBegin: () => undefined,
      onRequestConfirmation: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.match(confirmed, /Confirm launch/);

  const refused = render(
    createElement(LaunchPanel, {
      selection: {
        stage: "refused",
        feedKind: "live",
        reason: "suspended",
        detail: "listing is SUSPENDED — new runs are blocked",
      },
      busy: false,
      loadError: null,
      canBegin: true,
      onBegin: () => undefined,
      onRequestConfirmation: () => undefined,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    }),
  );
  assert.match(refused, /Refused — suspended/);
  assert.match(refused, /listing is SUSPENDED — new runs are blocked/);
  assert.match(refused, /role="alert"/);
});

test("W11B-3 render: StatusPanel keeps a refusal a refusal and shows evidence + screen links on admit", () => {
  const base = selectWorkbenchListing(
    selectWorkbenchSource(initialWorkbenchFlow(), {
      feedKind: "prerecorded",
      sourceRef: "studio-sample-feed",
      label: "Recorded sample feed",
      evidenceLine: "5-event prerecorded sample feed",
    }),
    "list:fixture-studio-published",
  );
  const idle = render(
    createElement(StatusPanel, {
      flow: base,
      preview: null,
      onOpenRuns: () => undefined,
      onOpenLibrary: () => undefined,
    }),
  );
  assert.match(idle, /No launch confirmed yet/);

  const refused = render(
    createElement(StatusPanel, {
      flow: markWorkbenchLaunch(base, "refused"),
      preview: null,
      onOpenRuns: () => undefined,
      onOpenLibrary: () => undefined,
    }),
  );
  assert.match(refused, /Refused — nothing ran/);
  assert.match(refused, /the refusal IS the status/);

  const admitted = render(
    createElement(StatusPanel, {
      flow: markWorkbenchLaunch(base, "admitted"),
      preview: {
        pipelineId: "pipe:fixture-highlights-trim",
        version: "1.0.0",
        inputSummary: "5 frames drained",
        outputSummary: "1 output revision (rev:measured-1)",
        semanticEvidence: "3 kept byte-exact, 2 dropped",
        evidenceGrade: "measured",
      },
      onOpenRuns: () => undefined,
      onOpenLibrary: () => undefined,
    }),
  );
  assert.match(admitted, /Admitted/);
  assert.match(admitted, /3 kept byte-exact, 2 dropped/);
  assert.match(admitted, /Open Runs/);
  assert.match(admitted, /Open Library/);
});

test("W11B-3 render: the legacy tabs render as concise summaries pointing at Worker C's screens", async () => {
  const marketplace = render(
    createElement(MarketplaceSummary, {
      listings: await fixtureListings(),
      onOpenMarketplace: () => undefined,
    }),
  );
  assert.match(marketplace, /1 published pipeline\(s\)/);
  assert.match(marketplace, /1 suspended \(shown honestly, not selectable\)/);
  assert.match(marketplace, /Open Marketplace/);

  const apps = render(
    createElement(AppsSummary, {
      apps: await fixtureApps(),
      appsLoading: false,
      appsError: null,
      onOpenConnectedApps: () => undefined,
    }),
  );
  assert.match(apps, /granted: observe — expires/);
  assert.match(apps, /revoked \(was: observe\)/);
  assert.match(apps, /learning consent NOT granted/);
  assert.match(apps, /learning consent granted/);
  assert.match(apps, /Open Connected Apps/);
});
