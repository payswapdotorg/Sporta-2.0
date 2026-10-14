/**
 * W11B-3 — the workbench pure-view-model tests (packages/web,
 * node:test + tsx — the project law).
 *
 * EVIDENCE CLASS: the fixtures here are REAL TYPED records from the
 * frozen contracts (the W10 live shapes, the W11 product-UI contract,
 * the studio port shapes) fed through the pure display/flow mappings;
 * the mappings themselves are PURE (no react, no IO). The REAL live
 * composition evidence lives in studioLiveEvidence.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialWorkbenchFlow,
  markWorkbenchLaunch,
  markWorkbenchPreview,
  selectWorkbenchListing,
  selectWorkbenchSource,
  workbenchCurrentStage,
  workbenchLaunchReady,
  workbenchProgress,
  WORKBENCH_STAGE_ORDER,
  type WorkbenchSourceState,
} from "../src/sporta/studio/workbench.js";
import {
  liveGradeBadge,
  liveRefusalLine,
  liveSessionHealthy,
  liveSessionRows,
  liveSourceFromEvidence,
  liveSourceRows,
} from "../src/sporta/studio/liveSourceViews.js";
import {
  STUDIO_LINK_ROUTES,
  STUDIO_SCREEN_REGISTRATION,
  studioEvidenceGrade,
  studioLinkRoutesValid,
  studioRegistrationValid,
} from "../src/sporta/studio/studioRegistration.js";
import { validateSportaScreenRoute } from "../src/sporta/product/contract.js";
import type { StudioLiveSourceView } from "../src/sporta/studio/studioPorts.js";

const RECORDED: WorkbenchSourceState = {
  feedKind: "prerecorded",
  sourceRef: "studio-sample-feed",
  label: "Recorded sample feed",
  evidenceLine: "5-event prerecorded sample feed (window 1500ms..4500ms)",
};

const LIVE: WorkbenchSourceState = {
  feedKind: "live",
  sourceRef: "live:match-1",
  label: "live:match-1",
  evidenceLine: "real-local-live",
};

/** A REAL-typed W10 session-evidence fixture (the LiveSessionEvidence shape). */
const REAL_SESSION_EVIDENCE = {
  descriptor: {
    sourceId: "live:match-1",
    grade: "real-local-live" as const,
    contentKind: "application/jsonl",
    cadenceMs: 25,
    queueBound: 8,
  },
  framesConsumed: 5,
  openedAt: "2026-10-14T12:00:00.000Z",
  closedAt: "2026-10-14T12:00:01.000Z",
  closeReason: "completed" as const,
  refusal: null,
};

test("W11B-3 registration: the studio registers through the FROZEN SportaScreenRegistration contract", () => {
  assert.equal(studioRegistrationValid(), true);
  assert.equal(STUDIO_SCREEN_REGISTRATION.id, "studio");
  assert.equal(STUDIO_SCREEN_REGISTRATION.navLabel, "Studio");
  assert.ok(STUDIO_SCREEN_REGISTRATION.purpose.length > 0);
  // every declared link route validates fail-closed against the closed vocabulary
  for (const link of STUDIO_LINK_ROUTES) {
    assert.equal(validateSportaScreenRoute(link.route).ok, true, link.route.screen);
  }
  assert.equal(studioLinkRoutesValid(), true);
  // the legacy tabs' destinations point at Worker C's first-class screens
  assert.deepEqual(
    STUDIO_LINK_ROUTES.map((link) => link.route.screen),
    ["marketplace", "connected-apps", "runs", "library"],
  );
});

test("W11B-3 registration: the screen evidence grade projects VERBATIM (never inflated)", () => {
  assert.equal(studioEvidenceGrade("real"), "real");
  assert.equal(studioEvidenceGrade("fixture"), "fixture");
});

test("W11B-3 flow: the stage rail starts at source with honest locked reasons", () => {
  const state = initialWorkbenchFlow();
  assert.equal(workbenchCurrentStage(state), "source");
  assert.equal(workbenchLaunchReady(state), false);
  const progress = workbenchProgress(state);
  assert.deepEqual(
    progress.map((row) => row.stage),
    [...WORKBENCH_STAGE_ORDER],
  );
  const locked = progress.filter((row) => row.state === "locked");
  assert.ok(locked.length >= 4);
  for (const row of locked) assert.ok(row.detail.length > 0, `locked ${row.stage} carries a reason`);
});

test("W11B-3 flow: source -> pipeline -> preview -> launch -> status advances coherently", () => {
  let state = selectWorkbenchSource(initialWorkbenchFlow(), RECORDED);
  assert.equal(workbenchCurrentStage(state), "pipeline");
  assert.equal(state.source?.feedKind, "prerecorded");

  state = selectWorkbenchListing(state, "list:studio-published");
  assert.equal(workbenchCurrentStage(state), "launch", "no preview yet: launch is the honest next stage");
  assert.equal(workbenchLaunchReady(state), true);

  state = markWorkbenchPreview(state, true);
  assert.equal(workbenchCurrentStage(state), "preview");

  state = markWorkbenchLaunch(state, "disclosure");
  assert.equal(workbenchCurrentStage(state), "launch");
  state = markWorkbenchLaunch(state, "awaiting-confirmation");
  assert.equal(workbenchCurrentStage(state), "launch");
  state = markWorkbenchLaunch(state, "admitted");
  assert.equal(workbenchCurrentStage(state), "status");

  const progress = workbenchProgress(state);
  const byStage = new Map(progress.map((row) => [row.stage, row]));
  assert.equal(byStage.get("source")?.state, "done");
  assert.equal(byStage.get("pipeline")?.state, "done");
  assert.equal(byStage.get("status")?.state, "current");
  assert.match(byStage.get("status")?.detail ?? "", /pinned release/);
});

test("W11B-3 flow: a refusal is a first-class status (never replaced by success copy)", () => {
  let state = selectWorkbenchSource(initialWorkbenchFlow(), LIVE);
  state = selectWorkbenchListing(state, "list:studio-suspended");
  state = markWorkbenchLaunch(state, "refused");
  assert.equal(workbenchCurrentStage(state), "status");
  const progress = workbenchProgress(state);
  const status = progress.find((row) => row.stage === "status");
  assert.match(status?.detail ?? "", /refusal/);
});

test("W11B-3 flow: upstream changes reset downstream context (no stale launch)", () => {
  let state = selectWorkbenchSource(initialWorkbenchFlow(), RECORDED);
  state = selectWorkbenchListing(state, "list:a");
  state = markWorkbenchPreview(state, true);
  state = markWorkbenchLaunch(state, "awaiting-confirmation");
  assert.equal(workbenchCurrentStage(state), "launch");
  // changing the SOURCE invalidates the launch context
  state = selectWorkbenchSource(state, LIVE);
  assert.equal(state.launchStage, "idle");
  assert.equal(state.listingId, "list:a", "the pipeline selection itself persists");
  // changing the PIPELINE invalidates preview + launch
  state = selectWorkbenchListing(state, "list:b");
  assert.equal(state.hasPreview, false);
  assert.equal(state.launchStage, "idle");
  assert.equal(workbenchCurrentStage(state), "launch");
});

test("W11B-3 flow: the launch stage cannot progress without a selected pipeline", () => {
  const noListing = markWorkbenchLaunch(
    selectWorkbenchSource(initialWorkbenchFlow(), RECORDED),
    "admitted",
  );
  assert.equal(noListing.launchStage, "idle", "a disclosure/admission without a pipeline is unrepresentable");
  const nothing = markWorkbenchLaunch(initialWorkbenchFlow(), "disclosure");
  assert.equal(nothing.launchStage, "idle");
});

test("W11B-3 live views: the grade string flows VERBATIM (real-local-live, never 'production')", () => {
  const badge = liveGradeBadge(REAL_SESSION_EVIDENCE.descriptor.grade);
  assert.equal(badge.text, "real-local-live");
  assert.equal(badge.tone, "real");
  assert.equal(liveGradeBadge("fixture").text, "fixture");
  assert.equal(liveGradeBadge("fixture").tone, "fixture");
});

test("W11B-3 live views: session evidence rows carry the record's own values (verbatim)", () => {
  const view = liveSourceFromEvidence(REAL_SESSION_EVIDENCE);
  assert.deepEqual(view.descriptor, REAL_SESSION_EVIDENCE.descriptor);
  assert.equal(view.session?.framesConsumed, 5);
  assert.equal(view.session?.closeReason, "completed");
  const rows = liveSourceRows(view);
  const value = (label: string) => rows.find((row) => row.label === label)?.value;
  assert.equal(value("Session"), "live:match-1");
  assert.equal(value("Grade"), "real-local-live");
  assert.equal(value("Frames consumed"), "5");
  assert.equal(value("Opened"), "2026-10-14T12:00:00.000Z");
  assert.equal(value("Closed"), "2026-10-14T12:00:01.000Z");
  assert.equal(value("Close reason"), "completed");
  assert.equal(value("Cadence / queue bound"), "25ms / 8 frames");
  assert.equal(liveSessionHealthy(view.session!), true);
});

test("W11B-3 live views: a typed refusal displays as a refusal, with partial evidence (verbatim)", () => {
  const refused = liveSourceFromEvidence({
    ...REAL_SESSION_EVIDENCE,
    framesConsumed: 3,
    closedAt: "2026-10-14T12:00:00.500Z",
    closeReason: "refused" as const,
    refusal: { kind: "queue-overflow", detail: "client queue bound (8) exceeded", framesConsumed: 3 },
  });
  assert.equal(liveSessionHealthy(refused.session!), false);
  const rows = liveSourceRows(refused);
  assert.equal(rows.find((row) => row.label === "Close reason")?.value, "refused");
  assert.equal(rows.find((row) => row.label === "Frames consumed")?.value, "3");
  assert.equal(
    liveRefusalLine(refused.session!.refusal!),
    "queue-overflow — client queue bound (8) exceeded (frames consumed before refusal: 3)",
  );
});

test("W11B-3 live views: a declared source without a session states the absence honestly", () => {
  const idle: StudioLiveSourceView = {
    descriptor: REAL_SESSION_EVIDENCE.descriptor,
    session: null,
  };
  const rows = liveSourceRows(idle);
  assert.equal(rows.find((row) => row.label === "Session")?.value, "no session evidence yet");
});

test("W11B-3 live views: the standalone session rows use the explicit descriptor", () => {
  const rows = liveSessionRows(REAL_SESSION_EVIDENCE.descriptor, {
    framesConsumed: 0,
    openedAt: "2026-10-14T12:00:00.000Z",
    closedAt: null,
    closeReason: "in-flight",
    refusal: null,
  });
  assert.equal(rows.find((row) => row.label === "Closed")?.value, "not closed yet");
  assert.equal(rows.find((row) => row.label === "Close reason")?.value, "in-flight");
});
