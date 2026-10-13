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
