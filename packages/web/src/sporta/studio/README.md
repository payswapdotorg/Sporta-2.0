# Transform Studio (W9C-8)

The Sporta studio surface for P9: pipeline graph building + validation,
marketplace/review status, feed-launch pipeline selection, and attached-app
permission disclosure.

## Layout (the surface law)

- `studioPorts.ts` — TYPE-ONLY host seam (`TransformStudioHostPort`). The
  studio renders whatever the host reports; the host carries the evidence
  grade and surfaces it honestly (`real` vs `fixture`).
- `graphStudio.ts`, `marketplaceViews.ts`, `launchSelection.ts`,
  `appAttachmentViews.ts`, `samplePreview.ts` — PURE view-model modules
  (no react, no IO). These are the tested seam: the battery tests in
  `packages/sporta-app-environments/test/studioViews.test.ts` feed REAL
  `@sporta/transforms` validation results and REAL `@sporta/marketplace`
  records through them and assert the projections.
- `TransformStudio.tsx` + `studio.css` — the render surface. BUILD-VERIFIED
  (the SportaPanel honesty law): `pnpm exec tsc -b packages/web` compiles it;
  no browser test harness exists in this repo and none is claimed.

## Wave 11 Worker B — the feed-to-output workbench (SPEC-first)

See SPEC.md ("Wave 11B") for the full presentation law. The W9C narrow/tab
surface is REPLACED by a purposeful workbench: source rail (feed/source
selection + stage progress + cross-screen links) | main work area (pipeline
picker + graph, the widest region) | stage context (preview, launch
disclosure/confirmation, status/output, concise summaries). Desktop reads
left-to-right through the flow; mobile stacks with no horizontal overflow.
Theme tokens are the Sporta-owned `--sporta-*` namespace with self-consistent
fallbacks.

- `workbench.ts` (NEW, pure) — the flow state machine (source → pipeline →
  preview → launch → status) with honest locked-stage reasons and
  downstream-reset laws. Battery-tested.
- `liveSourceViews.ts` (NEW, pure) — the W10 live evidence display mapping
  (grade `real-local-live`, session rows, typed refusals — all VERBATIM).
  Battery-tested with REAL `LiveTransformRunService` evidence.
- `studioRegistration.ts` (NEW, pure) — the `studio` screen's frozen
  `SportaScreenRegistration` + the cross-screen `SportaScreenRoute` links
  (fail-closed validated) + the `SportaScreenEvidenceGrade` projection.
- `studioPorts.ts` (M, additive) — the optional `readLiveSourceEvidence?()`
  seam + `StudioLiveSourceView` (hosts without a live composition omit it;
  the workbench states the absence honestly).
- `SourceRail/PipelinePicker/GraphPanel/PreviewPanel/LaunchPanel/
  StatusPanel/StudioSummaries.tsx` (NEW) — the workbench panels; the legacy
  GraphBuilder/Marketplace/Launch/Apps tabs are DELETED (no out-of-lane
  importer existed). Marketplace/Apps are now concise summaries + links to
  Worker C's first-class screens (no second authority). Component-level
  render tests cover the panels (react-dom/server under node:test).
- `TransformStudio.tsx` (M) — the workbench root; keeps the `host` prop
  (the SportaPanel mount) + optional `shell?: SportaProductShellPort`
  (navigation through Worker A's shell; typed refusals render as refusals;
  honest disabled links when the shell is not wired).
- Tests: `packages/web/test/studioWorkbench.test.ts` (pure flow/registration/
  live-views), `packages/web/test/studioLiveEvidence.test.ts` (REAL
  localhost HTTP live session → REAL run → verbatim display), and
  `packages/web/test/studioWorkbenchRender.test.ts` (panel renders).

### Input-shape compatibility (unchanged law)

The studio render modules never import `@sporta/*` at runtime; the W10 live
types reach the display layer as structural mirrors through
`liveSourceFromEvidence` (proven by feeding REAL `LiveTransformRunService`
records through it in the battery).

The W9C layout/input notes below stay for history; the W11B section above
states the current presentation law.

## Input-shape compatibility

`StudioValidationResult` is structurally the `@sporta/transforms`
`TransformGraphValidation`; `StudioListingShape`/`StudioDisclosureShape`/
`StudioReviewDecisionShape` mirror the `@sporta/marketplace` records;
`StudioDescriptorShape`/`StudioAttachmentShape` mirror the
`@sporta/app-environments` records. Structural compatibility is proven by
the studio battery tests plus the ad-hoc `tsc --noEmit` typecheck over the
compat module (W9C evidence). The studio never imports those packages
directly (the web package's dependency set is frozen outside this lane's
roots); the composition passes their records in.

## Composition wiring (TL seam — intentionally NOT done in this lane)

`packages/web/src/sporta/composition.ts` (or a future studio composition)
implements `TransformStudioHostPort` over the real seams:

- `validateGraph` — `@sporta/transforms` `validateTransformPipelineManifest`
  (draft nodes map 1:1 onto `TransformNode` fields; the composition adds the
  declared envelopes the manifest requires);
- `listListings` / `readReviewStatus` / `readLaunchDisclosure` — the
  `@sporta/marketplace` listing/review/disclosure read ports;
- `selectForLaunch` — `FeedLaunchAdmissionService.selectForLaunch` (the
  fail-closed admission; the typed result is surfaced verbatim);
- `listAppAttachments` — the `@sporta/app-environments`
  descriptor/attachment reads projected through `appAttachmentViews.ts`.

This lane owns zero edits outside `packages/sporta-app-environments/**` and
`packages/web/src/sporta/studio/**`, so mounting the studio into
`SportaPanel.tsx` / the browser route is left to the TL integration step
(the same serialization the work orders define for shared seams).

## Wave 10 Worker A — the composition seam CLOSED (SPEC-first)

The designated TL seam above is now implemented (w10a; SPEC appended BEFORE
implementation per the SPEC-first law). After this wave a user can open the
product host and SEE the Transform Studio: build a pipeline graph, see typed
validation, browse marketplace listings + review status, read the launch
disclosure, see attached apps with their permission/data-scope disclosure,
and select a pipeline for feed launch through the fail-closed admission.

### What was implemented

- `packages/web/src/sporta/studioComposition.ts` (NEW) + its seed module
  `packages/web/src/sporta/studioSeeds.ts` (NEW — the hostSeeds.ts
  precedent, keeping each file under the 400-line law) — the HEADLESS REAL
  seam implementation of `TransformStudioHostPort` (`evidence: "real"`),
  constructed additively by the composition roots
  (`createStudioHostComposition`; wired into `composition.ts` and
  `boot/boot.ts`). HEADLESS Node only — it NEVER enters the browser bundle
  (the W4-C composition law; no React file imports it).
- `packages/web/src/sporta/studioBrowserFixture.ts` (NEW) — the
  honestly-labeled FIXTURE studio host for the browser route (the
  browserFixtureHost law: imports ONLY types + pure local fixture data; no
  Node dependency enters the bundle; the evidence badge reads FIXTURE).
- `packages/web/src/sporta/SportaPanel.tsx` (M, additive) — mounts the
  "Transform Studio" section rendering `TransformStudio.tsx` through the
  INJECTED studio port (the panel's existing render law; the stage trace
  stays intact — the studio is additive surface, not a replacement).
- `packages/web/src/sporta/composition.ts` + `boot/boot.ts` (M, additive) —
  the composition roots construct and expose the REAL studio host
  (`studioHost`) alongside the existing `SportaHostPort`.
- `packages/web/src/main.tsx` (M, 2 lines) — the browser route injects the
  studio fixture host (the actual route wiring point; boot.ts is headless
  only by its own header — see the w10a report DEVIATIONS).
- `packages/web/src/sporta/sportaPanel.css` (M, additive tail) — the studio
  mount styling.
- `packages/web/test/studioComposition.test.ts` (NEW) — REAL tests (the
  sportaHost.test.ts law: temp dir, REAL stores/services, clean teardown).

### The real/fixture split (honesty law)

REAL legs (labeled, in `studioComposition.ts`):
- `validateGraph` — the REAL `@sporta/transforms`
  `validateTransformPipelineManifest`: the studio draft (nodes/edges) maps
  1:1 onto `TransformNode`/edge fields; the composition adds ONLY the
  declared envelopes the manifest requires (draft manifest identity, safe
  sandbox/resource/error envelopes, the operator policy from hostSeeds);
  the typed result projects VERBATIM into `StudioValidationResult`
  (per-violation records, never stringly errors).
- `listListings` / `readReviewStatus` / `readLaunchDisclosure` — the REAL
  `@sporta/marketplace` read ports over the real services
  (ListingService/ReviewService/FeedLaunchAdmissionService), projected
  through `marketplaceViews.ts` (publisher, approved version, terms/price,
  rights prerequisites, outputs, limitations, evidence grade).
- `selectForLaunch` — the REAL `FeedLaunchAdmissionService.selectForLaunch`
  fail-closed admission; the typed result surfaces VERBATIM (admitted pins
  the entitlement digest; every refusal carries its frozen reason + detail;
  the studio never softens a denial). The operator rights snapshot is the
  host's wiring-time declaration (the UsageDeclaredEditorHistory
  precedent): absent = admission runs WITHOUT a snapshot and refuses typed
  (fail-closed, P9-14) — never softened.
- `listAppAttachments` — REAL `@sporta/app-environments`
  descriptor/attachment reads through the real
  `ApplicationEnvironmentService` (real validation, real
  catalog-stability, real scoped-grant construction), projected through
  `appAttachmentViews.ts` (granted vs NOT-granted classes side by side,
  separate learning consent, data scope, network posture, licensing).
- `readSamplePreview` — the sample-preview seam: a REAL
  `TransformRunService` run of the seeded pipeline over the declared sample
  feed (REAL deterministic-filter child process on real pipes, REAL
  content-addressed FS blob writes, REAL artifact revisions), projected
  through `samplePreview.ts` (measured carry-forward evidence, honest
  grade). Unknown pipeline/version → typed null.

FIXTURE (labeled): the in-memory marketplace/app-environment/work stores
(the packages' own labeled FIXTURE adapters), the seed content (the sample
pipeline manifest, the review/listing/entitlement records, the app
descriptors/attachments — the hostSeeds.ts precedent: fixture seeds behind
REAL ports), the fixture probe adapter used at app-attach seed time (no
real app process in the studio composition — the REAL app-action lane is
owned and evidenced by the app-environments battery + the P9-23 vertical
slice), and the browser fixture host (static snapshot, labeled IN the UI).

### Surface law (unchanged)

The studio port exposes read-only studio state + EXACTLY the
launch-selection write path (disclosure → confirm → admission). The
composition adds no other mutation path. `@sporta/*` resolution for the
three studio packages goes through the transitional gitignored symlinks in
`packages/web/node_modules/@sporta` (no manifest/lockfile edit; manifest
registration remains the TL's NEXT-DEPENDENCIES step, same as W4C).

