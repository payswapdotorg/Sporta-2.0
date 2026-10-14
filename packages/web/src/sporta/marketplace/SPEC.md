# W11 Worker C — Destination Screens SPEC (lane-level)

**Worker:** w11c · **Base SHA:** f1192a6 (W11 Wave 0 frozen) · **Branch:** wave11/worker-ui-c
**Authority order:** docs/work-orders/sporta-native-ui-work-orders.md → docs/architecture/adr-sporta-native-product-ui.md + docs/architecture/sporta-product-ui.md → packages/web/src/sporta/product/contract.ts (TL-frozen) → packages/web/src/sporta/product/SCREEN-PORTS.md.

## 1. Scope

Product-native destination screens for the five Worker-C screen ids of the closed
7-screen vocabulary (`SportaScreenId`), plus the browser-journey evidence:

| Root (owned) | Screen ids | Reads through (SCREEN-PORTS.md) |
|---|---|---|
| `packages/web/src/sporta/marketplace/**` | `marketplace`, `my-pipelines` | `@sporta/marketplace` records via the studio composition's read models (`TransformStudioHostPort.listListings/readReviewStatus/readLaunchDisclosure/readSamplePreview`) |
| `packages/web/src/sporta/runs/**` | `runs` | `TransformRunManifest` records (`@sporta/transforms/contract`) |
| `packages/web/src/sporta/library/**` | `library` | `@sporta/artifacts` artifact/revision/lineage records |
| `packages/web/src/sporta/apps/**` | `connected-apps` | `@sporta/app-environments` attachment/capability/audit records |
| `packages/web/test/sporta-product-ui/**` | — | Playwright journeys over the REAL `/sporta` route + a labeled lane test harness |
| `docs/implementation/worker-ui-c.md` | — | the worker report |

ZERO edits outside those roots: no `main.tsx`, no `SportaPanel.tsx`, no
`sportaPanel.css`, no `product/**` (Worker A), no `studio/**` (Worker B), no
shared package manifests, no lockfile. Additive-only. Every src file < 400 lines.

## 2. Base-SHA facts (honest, verified)

- `packages/web/src/sporta/product/` at f1192a6 contains ONLY `contract.ts` +
  `SCREEN-PORTS.md` — **Worker A's shell is NOT present**. Per the work order,
  the screens therefore code against the frozen contract TYPES only
  (`SportaScreenRegistration`, `SportaProductShellPort`, `SPORTA_THEME_TOKENS`,
  `validateSportaScreenRoute`, `SportaScreenEvidenceGrade`) — compile-time
  registration, runtime wiring is the TL/Worker-A integration. Recorded in
  NEXT DEPENDENCIES.
- The REAL `/sporta` route IS wired at this base: `main.tsx` mounts
  `SportaPanel` + `TransformStudio` over the labeled browser FIXTURE hosts.
  The route journey drives THAT surface (the only product surface that exists).
- Worker C's own screens are not mounted on the route at this SHA (no shell);
  their browser rendering is proven through a PLAYWRIGHT-SERVED test harness
  page under the test root — labeled as component-level browser evidence,
  never claimed route-integrated.

## 3. Screen ports (the state-owner law)

Each root declares a TYPE-ONLY screen-port module (the `studioPorts.ts`
precedent) and PURE view-model projections (the `marketplaceViews.ts`
precedent). Screens are React components that consume ONLY the injected port;
they own zero store state beyond local view state (selection, busy, error) and
never import repositories/services/runtime composition.

- `MarketplaceScreenPort` — `listPublicListings()`, `readListingDetail(listingId)`
  (summary + review status + launch disclosure fields + sample preview).
- `MyPipelinesScreenPort` — `listCreatorRecords(creator)` (the same marketplace
  records classified by status) + `readCreatorVersionStatus(pipelineId, version)`.
- `RunsScreenPort` — `listRuns()`, `readRun(runId)` projecting `TransformRunManifest`
  (steps, typed failure/success, evidence grade, audit/workgraph refs).
- `LibraryScreenPort` — `listArtifacts()`, `readArtifact(artifactId)` (revisions,
  lineage, export availability).
- `ConnectedAppsScreenPort` — `listAttachments()`, `readAuditTrail(attachmentId)`,
  `revoke(attachmentId)` (the ONE write; result surfaced verbatim).

## 4. Adapter + fixture law (no parallel state)

- Where the existing read model carries the data, the port is satisfied by an
  adapter over the injected `TransformStudioHostPort` (the W10-composed seam) —
  the screens read the SAME records the studio reads. No new marketplace/app/
  run store is created anywhere in the lane.
- Where a seam does NOT exist at this SHA (creator DRAFT/SUBMITTED states,
  run-manifest history reads, artifact revision reads, app audit reads, the
  revocation write), the adapter returns/surfaces a TYPED missing-seam refusal
  and the screen shows the reason; the browser fixture host carries explicitly
  FIXTURE-labeled demo data so the screen is exercisable. Every missing seam is
  recorded in NEXT DEPENDENCIES — the TL serializes it; nothing is improvised.
- Evidence grades flow VERBATIM from the seams (`measured|fixture|declared` for
  marketplace/run expectations; `real-local-live` live-session grade rendered
  only as carried on the record; UI-15). Fixture data is labeled FIXTURE at the
  point of use. No grade is ever inflated.

## 5. Every visible action functional or explicitly disabled

- Functional: listing browse/detail, creator filter, review-status read,
  disclosure read, run list/detail read, artifact revision/lineage read,
  attachment scope/grant/audit read, revoke (fixture host: honest local
  transition; real host: the REAL `ApplicationEnvironmentService` path driven in
  the node battery — the screen port write result surfaces verbatim).
- Disabled WITH a typed reason: "Open in Studio" / "Request launch" (product
  shell navigation not wired at this SHA), creator submit/withdraw writes
  (submission-store writes not on the read model), run cancel/retry (run-control
  seam not on the read model), library export from the browser (content-read
  seam not in the browser bundle; the REAL gated read path is proven in the node
  battery), revoke through the real-host adapter (revocation write not on the
  studio host port surface law).

## 6. Registration + tokens

- Each root exports its `SportaScreenRegistration` constants (frozen type,
  frozen ids). A node battery test validates ids through
  `validateSportaScreenRoute` and asserts the registration order/labels.
- Screens consume Worker A's token NAMES only via `SPORTA_THEME_TOKENS`
  (`--sporta-*` namespace); a lane stylesheet (one per root, small) maps local
  classes to `var(--sporta-*)` with safe fallbacks so screens render standalone
  at this SHA and inherit Worker A's theme at integration. No ZCode classes, no
  `@zcode/ui` imports, no `--zai-*`/`zcode` vocabulary anywhere.

## 7. Browser journeys (W11C-2)

Playwright (`@playwright/test`, the Wave-0-frozen web dev-dep — manifest
untouched) under `packages/web/test/sporta-product-ui/` with its own config
(`playwright.config.ts` lives in the test root; the worker-side lane config is
additive and owns no shared files):

1. `journey-sporta-route.spec.ts` — the REAL `/sporta` route through the vite
   dev server (the route IS wired at this base; stated honestly): product
   surface renders → open the Studio sections → marketplace listing with
   verbatim grade label → feed-launch selection of the approved listing →
   disclosure → confirmation → admission result surfaced verbatim → attached
   apps permission state incl. the revoked attachment → console/network failure
   capture. Screenshots at 1440x900 AND 390x844.
2. `journey-destination-screens.spec.ts` — the five Worker-C screens mounted
   through the lane test-harness page (served by the same dev server from the
   test root): browse listing detail, creator filter, run detail with typed
   failure + evidence grade, library revisions/lineage, app scopes/audit/revoke
   (fixture-labeled transitions). Screenshots at BOTH breakpoints. This spec is
   LABELED component-level browser evidence (UI-16/17 route evidence is
   journey 1's job; the screens' route integration is NEXT DEPENDENCIES).

Never green-faked: if the browser runtime is unavailable, the specs are
committed and skipped with the exact blocker, and the browser gates are labeled
PENDING-station. (Verified available in this sandbox: Playwright 1.64.1 +
chromium 1248.)

## 8. Node battery (the project law: node:test + tsx)

`packages/web/test/sportaScreens.test.ts` drives the view-models and adapters:

- over `createStudioHostComposition` (REAL marketplace/app-environment services,
  the W10A-3 evidence class): marketplace + my-pipelines + connected-apps
  adapters read REAL records (listing fields, review roles, disclosure digest
  byte-equality, attachment grant/expiry/revoked state);
- over the REAL `TransformRunService` + REAL `ArtifactGraphService`/FS blob
  legs (same construction law as the composition): a REAL run manifest and REAL
  artifact revisions/lineage project through the runs/library view-models;
- registrations vs the frozen contract; fixture hosts' honest FIXTURE labels;
  the 400-line cap is a review law, enforced by reading, not a test.

## 9. Acceptance checklist (lane gates)

- [ ] SPEC committed before code (this file).
- [ ] Battery green at baseline AND on the lane tree (both numbers reported).
- [ ] arch-check / surface-check / tsc -b web / lint: no new violations.
- [ ] Playwright journeys pass in a real browser; screenshots at 1440x900 +
      390x844 for both specs; console/network failures reviewed and reported.
- [ ] Evidence grades verbatim; fixture labeled; refusals typed and surfaced.
- [ ] Report `docs/implementation/worker-ui-c.md` with the standard sections.
