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

---

# W12 Worker B — the My-Pipelines REAL Host SPEC (lane-level addendum)

**Worker:** w12b · **Base SHA:** c963c6d (W12 Wave 0 freeze + W12-A merged) · **Branch:** wave12/worker-b
**Authority order:** docs/work-orders/w12-composition-seams-work-orders.md (Worker B lane + Non-negotiables) → docs/architecture/adr-w12-composition-seams.md → docs/testing/w12-acceptance.md (W12-10/11/12) → docs/implementation/worker-w12a.md (the sibling lane's REAL-host precedent) → packages/web/src/sporta/marketplace/marketplaceScreenPorts.ts (FROZEN screen ports) → packages/web/src/sporta/marketplace/marketplaceFixtureHost.ts (the fixture host the demo rows retire from) → packages/sporta-marketplace/src/contract.ts (the frozen contract surface) → packages/sporta-marketplace/src/app/creatorQueryService.ts (the W12-03 freeze query service) → packages/sporta-marketplace/src/domain/lifecycle.ts + app/submissionService.ts + app/reviewService.ts (the lifecycle + typed errors) → packages/web/test/sportaScreens.test.ts (W11C precedent) → packages/web/test/sportaSeamsRuns.test.ts + sportaSeamsLibrary.test.ts (the W12-A battery pattern).

## W1. Scope (this addendum)

| Task | File (owned, new) | Gate | Service exercised |
|---|---|---|---|
| W12B-1 — the my-pipelines REAL host | `packages/web/src/sporta/marketplace/myPipelinesRealHost.ts` | W12-10, W12-11 | `CreatorCandidateQueryService.listByCreator()/listAll()` (the W12-03 freeze read) |
| W12B-2 — creator version-status reads through the REAL review seam | same file (`readCreatorVersionStatus`) | W12-12 | the frozen review-decision seam (`DecisionStorePort.byCandidate` read — the same seam the studio composition's `readReviewStatus` rides) |

Plus the new test file `packages/web/test/sportaSeamsMarketplace.test.ts` and the worker
report `docs/implementation/worker-w12b.md`. ZERO edits to any `packages/sporta-*/**`
file (the service packages are frozen to this lane), ZERO edits to the frozen
`marketplaceScreenPorts.ts`, `marketplaceScreenHost.ts` (the public-listings read
authority — ALREADY REAL, untouched), `marketplaceFixtureHost.ts` (the labeled browser
fixture host stays), `marketplaceScreenViews.ts` (pure views, untouched), the
`MyPipelinesScreen.tsx`/`MarketplaceScreen.tsx` mounts, any package manifest, or the
lockfile. Additive-only; file-size law < 400 lines per src file.

## W2. Base-SHA facts (honest, verified)

- The frozen `MyPipelinesScreenPort` has exactly two reads —
  `listCreatorRecords(creator)` and `readCreatorVersionStatus(pipelineId, version)` —
  and NO write methods at this SHA. DRAFT/SUBMITTED writes are not on any read model:
  the host surfaces the typed refusal law the port documents (never a silent no-op,
  never a stringly null) via the per-record `note` + the screen's existing disabled
  action reasons.
- The W12-03 freeze gives this lane its enumeration read:
  `CreatorCandidateQueryService.listAll()` (insertion order) and
  `listByCreator(creator)` (the creator's own view — drafts included, other creators
  excluded, `submittedBy` = the creator scope). The frozen `CandidateStorePort` is
  untouched.
- The review seam: the durable review decisions live in the frozen
  `DecisionStorePort`; its `byCandidate(candidateDigest)` read is the exact seam the
  studio composition's `readReviewStatus` rides (the precedent for
  `readCreatorVersionStatus`). `ReviewService.latestApprovalForDigest` reads
  APPROVALS ONLY — it cannot serve a version-status read (a changes-requested or
  rejected decision is a REAL decision and must project, never be misreported as
  "no review decision recorded"). Recorded in the report's DEVIATIONS.
- The REAL typed errors this lane must preserve verbatim (W12-11):
  - changed-resubmit — `TransformCandidateImmutableError`:
    `pipeline <id> version <v> is already submitted with a frozen digest — a changed candidate requires a NEW version and separate review (P9-09)`
  - already-submitted refusal — `TransformLifecycleError`:
    `candidate <id> is already <lifecycle> — submitted candidates are immutable`
- The honest refusal law for version-status reads (W12-12) — the exact
  `no review decision recorded` phrase the W11C host established, with the honest
  cause appended per arm (unknown pipeline+version / DRAFT / submitted-but-unreviewed).
- The fixture host's `origin: "fixture-demo"` demo rows (DRAFT/SUBMITTED/
  CHANGES_REQUESTED) retire on the REAL side: the REAL host produces ZERO of them —
  the same creator states now come from REAL `TransformCandidateRecord`s with
  `origin: "record"`. The fixture host itself STAYS for the browser demo (sibling,
  not replacement — the w12a law).

## W3. The host (W12B-1 + W12B-2)

`createMyPipelinesRealHost(deps: { query: CreatorCandidateQueryService; review: CreatorReviewDecisionRead }): MyPipelinesRealHost`

- `MyPipelinesRealHost extends MyPipelinesScreenPort` with ONE additive field
  `gradeNote: string` — the honest store-grade label
  `"BACKING: REAL (candidate + decision stores: fixture-grade in-memory)"`
  (the w12a precedent; the TL composition root reads it for the badge). Never
  re-badged as `production`.
- `CreatorReviewDecisionRead` is the READ-ONLY structural slice of the frozen
  review seam — `byCandidate(candidateDigest): readonly TransformReviewDecision[]`.
  Structurally satisfied by `InMemoryDecisionStore` and any REAL decision store
  implementing the frozen `DecisionStorePort` (the `MarketplaceStudioReadShape`
  precedent: a structural mirror, no cross-lane import, no write surface exposed).
- `listCreatorRecords(creator)` — `query.listByCreator(creator)` (the freeze read),
  each `TransformCandidateRecord` projected into `CreatorPipelineRecord`:
  - `origin: "record"` for EVERY row — ZERO `fixture-demo` rows;
  - `status` = the record's REAL lifecycle state VERBATIM (DRAFT, SUBMITTED,
    AUTOMATED_CHECKS, HUMAN_REVIEW, APPROVED, PUBLISHED, CHANGES_REQUESTED, REJECTED);
  - `creatorState` — a PURE, TOTAL, EXPLICIT projection of the lifecycle (never
    guessed, never the frozen view default):
    DRAFT→`draft`; SUBMITTED/AUTOMATED_CHECKS/HUMAN_REVIEW→`submitted` (review in
    progress — the exact phase carries in `status` verbatim);
    APPROVED/PUBLISHED→`released` (the release decision exists; publication is the
    follow-through); CHANGES_REQUESTED/REJECTED→`changes-requested` (the negative
    review-outcome bucket — REJECTED's terminal nature carries in `status` + the
    per-record note; the frozen creatorState vocabulary has no rejected bucket);
  - `publisher` = `submittedBy` (the creator scope — the same field the listing
    service promotes to `publisher` at publication);
  - `approvedVersion`: `null` while DRAFT (nothing frozen); the submitted version
    once the digest is frozen (the version whose review status the screen reads);
  - `reviewedAt`: the latest decision's `decidedAt` through the review seam, `null`
    when no decision is on record;
  - `listingId`: `null` — an HONEST GAP: the candidate store carries no listing id
    and the listing read is not on this host's seam (the public-listings authority
    is the untouched `createMarketplaceScreenHost`);
  - `title`: the candidate identity `<pipelineId> v<version>` — the candidate store
    carries no marketing title (honest derivation, labeled in the note);
  - `note`: the per-lifecycle law note + the honest-gap clause.
- `readCreatorVersionStatus(pipelineId, version)`:
  1. the candidate for (pipelineId, version) over `query.listAll()` (a pure filter);
  2. no candidate → `ScreenRefusal` carrying the exact
     `no review decision recorded for <pipelineId> v<version>` law;
  3. DRAFT (no frozen digest) → the same law with the DRAFT cause;
  4. the frozen digest → `review.byCandidate(digest)`, the LATEST decision
     (any outcome — approved/changes-requested/rejected are all REAL decisions);
  5. none on record → the same law with the submitted-but-unreviewed cause;
  6. else the decision projects VERBATIM into `MarketplaceReviewShape`:
     `outcome`, `decidedAt`, `policyVersion`, `rationale`, `reviewerRoles`
     (the humanReview roles, sorted — the studio projection precedent),
     `automatedChecks` (checkId/outcome/evidenceKind verbatim).
- State-owner law: the host owns NO store, NO second state — it is a pure
  projection over the injected REAL services. Typed errors propagate verbatim.

## W4. Verification battery (the project law)

```bash
node scripts/architecture/architecture-check.mjs check       # 0 violations
node scripts/architecture/sporta-surface-check.mjs          # OK additive-only
pnpm exec tsc -b packages/sporta-marketplace packages/web   # scoped tsc exit 0
pnpm exec tsx --test packages/web/test/sportaSeamsMarketplace.test.ts  # the lane battery
pnpm exec tsx --test packages/web/test/*.test.ts            # the web suite (additive)
pnpm lint                                                   # 0 errors / 70 warnings (baseline)
find packages/sporta-* packages/web/src -name "*.ts" -path "*/src/*" | xargs wc -l | awk '$1 > 400 && $2 != "total"'  # scoped size law: nothing
```

## W5. Acceptance checklist (lane gates)

- [x] SPEC committed before code (this addendum).
- [ ] W12-10 named test: REAL records, `origin: "record"` rows, pure lifecycle
      projection, zero `fixture-demo` rows.
- [ ] W12-11 named tests: the changed-resubmit typed error + the already-submitted
      refusal asserted by their EXACT verbatim messages, with the host's projection
      of the immutable SUBMITTED record.
- [ ] W12-12 named tests: BOTH arms — a REAL decision projects as
      `MarketplaceReviewShape` verbatim; the honest `no review decision recorded`
      refusal carries the exact law.
- [ ] Battery green; arch/surface/tsc/lint no new violations; both numbers reported.
- [ ] Report `docs/implementation/worker-w12b.md` with the standard sections.
