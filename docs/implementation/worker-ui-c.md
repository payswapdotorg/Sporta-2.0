# Worker W11C Implementation Report — Marketplace, creator, runs, library, Connected Apps + browser evidence

Worker: w11c (W11 Wave C lane — product-native destination screens + browser journey evidence)
Base SHA: f1192a6 (W11 Wave 0 frozen — verified by checkout; measured baseline BELOW before any lane code).
Branch: wave11/worker-ui-c (SPEC-first: the SPEC commit precedes every code commit).
Status: W11C IMPLEMENTED + BROWSER-VERIFIED ON THIS SANDBOX (all lane gates measured; the TL re-runs every gate at the integration station; browser gates are station-re-runnable per the Wave-0 harness decision).

## WORK ITEMS

- W11C-1 — the five destination screens of the closed Worker-C vocabulary, as NEW screen roots (additive-only; zero edits to any existing file — `git diff` on tracked files is EMPTY at delivery):
  - `marketplace/` (screen id `marketplace` + screen id `my-pipelines` — the same marketplace records, both sides):
    - `marketplaceScreenPorts.ts` — TYPE-ONLY screen ports (`MarketplaceScreenPort`, `MyPipelinesScreenPort`) whose shapes are STRUCTURAL MIRRORS of the read models AS THE STUDIO HOST PORT PROJECTS THEM (the `marketplaceViews.ts` mirror precedent; no studio/** import, no cross-lane coupling).
    - `marketplaceScreenViews.ts` — PURE projections: listing cards (publisher, approved version, status incl. honestly-SUSPENDED, price line, verbatim grade badge, digest head), the full P9-12 disclosure fact rows (publisher / approved version / release digest / terms+license / cost / latency expectation+grade / rights prerequisites / outputs / limitations / dependencies / evidence grade / reviewedAt), review-signoff completeness (all-three-roles law), creator-state classification (released/suspended/withdrawn/superseded), disabled-action reason constants.
    - `marketplaceScreenHost.ts` — the adapter over an injected STRUCTURAL read shape of the studio composition's host port (REAL records; compile-time compat with the REAL `TransformStudioHostPort` asserted in the battery). Unknown-listing detail is a typed verbatim refusal; the disclosure seam's typed error degrades WITH its reason (never silently). The my-pipelines side surfaces the missing submission-read seam as a declared note row (`seam:submission-reads`), never disguised data.
    - `MarketplaceScreen.tsx` / `MyPipelinesScreen.tsx` — React screens: browse → detail, creator filter, review feedback, disabled "Open in Studio" / "Submit for review" / "Withdraw" each WITH its typed reason in the UI.
    - `marketplaceFixtureHost.ts` — the labeled FIXTURE browser host (the `studioBrowserFixture.ts` law): two listings (one SUSPENDED), a 3-role review, full disclosure, and creator DRAFT/SUBMITTED/CHANGES_REQUESTED demo rows carrying `origin: "fixture-demo"` + a fixture note — never passing as records.
    - `registrations.ts` — `MARKETPLACE_SCREEN_REGISTRATION` + `MY_PIPELINES_SCREEN_REGISTRATION` typed against the FROZEN `SportaScreenRegistration`.
    - `marketplace.css` — lane styles mapped to Worker A's `--sporta-*` token NAMES with standalone fallbacks (renders at this SHA; inherits the product theme at integration). No ZCode vocabulary anywhere.
  - `runs/` (screen id `runs`): `RunsScreen.tsx` over `RunsScreenPort` — run history rows (state labels: succeeded / typed failure / fallback used / cancelled / in-flight), per-run evidence (per-step status, timing, resource + cost facts, provenance), live-session evidence rendered VERBATIM from the record (the `real-local-live` grade string only ever as carried), audit references (work graph, run ref, release digest, config hash, component digests, inputs+rights snapshots, granted app capabilities, retention, semantic fidelity, outputs). Disabled "Retry run"/"Cancel run" with typed reasons. REAL records in the battery; fixture host for the browser.
  - `library/` (screen id `library`): `LibraryScreen.tsx` over `LibraryScreenPort` — artifacts (kind + editability in product language) with their FULL immutable revision lineage (root-first, HEAD marked, parent chain, content hashes, tool versions, provenance incl. confidence), lineage summary, export disabled WITH its typed seam reason, delete-history disabled BY DESIGN (the lineage law). REAL `ArtifactGraphService` lineage in the battery; fixture host for the browser.
  - `apps/` (screen id `connected-apps`): `ConnectedAppsScreen.tsx` over `ConnectedAppsScreenPort` — attachment cards (target identity, attachment id, granted classes, who consented + scope + policy, the SEPARATE learning consent, data scope + network posture, mutating-classes warning, not-granted classes, capability catalog, licensing), audit trail (sanitized decision lines), and the ONE write: `revoke(attachmentId)` with the typed result surfaced verbatim (fixture host: honest LOCAL transition, re-revoke refuses typed; the REAL path is `ApplicationEnvironmentService.revokeAttachment`, driven in the battery). "Attach new app" disabled with the consent-flow reason; "Invoke" documented as the agent lane, never a screen button.
- W11C-2 — browser journey coverage (Playwright, REAL, chromium 156.0.8078.4 / playwright 1.64.1 on this sandbox):
  - `packages/web/test/sporta-product-ui/playwright.config.ts` — the lane config: boots the REAL `packages/web` vite dev server (port 5199, IPv4) and runs every journey under TWO projects — `desktop-1440x900` and `mobile-390x844` (UI-16/UI-17).
  - `journey-sporta-route.spec.ts` — **the route journey (UI-16/17 evidence):** drives the REAL `/sporta` route as wired at this base SHA (main.tsx mounts SportaPanel + TransformStudio over the labeled browser FIXTURE hosts — the only product surface that exists here). Journey: product surface + honest FIXTURE badges → learning-consent write (typed result visible) → Studio graph builder (adds a node; "Validate graph" honestly DISABLED with the unpinned-digest blocker visible) → Marketplace tab (approved listing + verbatim `grade FIXTURE`) → Feed launch: select the approved listing → full launch disclosure (license MIT visible) → explicit confirmation → admission result surfaced VERBATIM ("Admitted — Pinned release sha256:4d… under entitlement ent:fixture-studio-1") → Attached apps (granted: observe state, the revoked attachment state, learning-consent line). Console errors + failed network responses captured AND asserted empty. Screenshots at BOTH breakpoints.
  - `journey-destination-screens.spec.ts` + `screens-harness.html` — the five Worker-C screens in a real browser through the lane TEST HARNESS page (mounted over their labeled FIXTURE hosts). Covers: marketplace browse→detail with disclosure facts + disabled action reasons; my-pipelines groups (Released/Suspended real-shaped + Draft/Submitted/Changes-requested labeled FIXTURE DEMO rows) + draft review empty-state + disabled writes; runs history + typed-failure detail + disabled run control; library two-revision lineage with HEAD marked + disabled export reason; connected-apps scopes/audit/revoke (the fixture revoke interaction executed: card state flips to "revoked at …" and the result message surfaces). **Honestly labeled: this is COMPONENT-LEVEL browser evidence for MY screens — not route evidence** (the screens are not mounted on the route at this SHA; that integration is Worker A's shell + the TL's — NEXT DEPENDENCIES). Screenshots at BOTH breakpoints.
  - 20 committed screenshots under `test/sporta-product-ui/artifacts/` (10 journey steps × 2 breakpoints); the README in that root tells reviewers exactly what each spec proves and what it does NOT claim.
- W11C-3 — this report + the lane battery:
  - `packages/web/test/sportaScreens.test.ts` (node:test + tsx — the project law): 9 tests driving the adapters/views through the REAL seams — the REAL W10 studio composition (marketplace/my-pipelines records: byte-equality listing→disclosure digest, 3-role review, measured sample preview through the port), the REAL `TransformRunService` (a REAL deterministic-filter child-process run → succeeded state + audit lines; a REAL forced model refusal under `fail-closed` → typed-failure; a REAL forced model refusal under the node's DECLARED mode → fallback-used, never relabeled), the REAL `LiveTransformRunService` + `RealLocalHttpLiveSourceAdapter` (a real localhost HTTP live session pinned with the exact `real-local-live` grade, rendered verbatim, "production" absent), the REAL `ArtifactGraphService` lineage chain (root-first, HEAD marked, parent preserved), and the REAL `ApplicationEnvironmentService` grant→revoke path (observe vs observe+control class independence, separate learning consent, revocation stamped + projected), plus registrations-vs-frozen-contract and fixture-host honesty assertions.

## CHANGED FILES

All NEW, all inside the owned boundary + this report. ZERO edits to `main.tsx`, `SportaPanel.tsx`, `sportaPanel.css`, `product/**` (Worker A), `studio/**` (Worker B), any shared root file, any package manifest, or the lockfile (`git diff` empty; `git status` shows only the lane paths below).

- packages/web/src/sporta/marketplace/SPEC.md (NEW, 152 — committed FIRST, before any code)
- packages/web/src/sporta/marketplace/marketplaceScreenPorts.ts (NEW, 175)
- packages/web/src/sporta/marketplace/marketplaceScreenViews.ts (NEW, 229)
- packages/web/src/sporta/marketplace/marketplaceScreenHost.ts (NEW, 150)
- packages/web/src/sporta/marketplace/marketplaceFixtureHost.ts (NEW, 205)
- packages/web/src/sporta/marketplace/MarketplaceScreen.tsx (NEW, 197)
- packages/web/src/sporta/marketplace/MyPipelinesScreen.tsx (NEW, 189)
- packages/web/src/sporta/marketplace/registrations.ts (NEW, 31)
- packages/web/src/sporta/marketplace/marketplace.css (NEW, 299)
- packages/web/src/sporta/runs/runsScreenPorts.ts (NEW, 92)
- packages/web/src/sporta/runs/runsScreenViews.ts (NEW, 160)
- packages/web/src/sporta/runs/RunsScreen.tsx (NEW, 193)
- packages/web/src/sporta/runs/runsFixtureHost.ts (NEW, 145)
- packages/web/src/sporta/runs/registrations.ts (NEW, 17)
- packages/web/src/sporta/runs/runs.css (NEW, 110)
- packages/web/src/sporta/library/libraryScreenPorts.ts (NEW, 67)
- packages/web/src/sporta/library/libraryScreenViews.ts (NEW, 96)
- packages/web/src/sporta/library/LibraryScreen.tsx (NEW, 169)
- packages/web/src/sporta/library/libraryFixtureHost.ts (NEW, 99)
- packages/web/src/sporta/library/registrations.ts (NEW, 17)
- packages/web/src/sporta/library/library.css (NEW, 57)
- packages/web/src/sporta/apps/appsScreenPorts.ts (NEW, 97)
- packages/web/src/sporta/apps/appsScreenViews.ts (NEW, 87)
- packages/web/src/sporta/apps/ConnectedAppsScreen.tsx (NEW, 221)
- packages/web/src/sporta/apps/appsFixtureHost.ts (NEW, 131)
- packages/web/src/sporta/apps/registrations.ts (NEW, 17)
- packages/web/src/sporta/apps/apps.css (NEW, 56)
- packages/web/test/sportaScreens.test.ts (NEW, 651 — node battery)
- packages/web/test/sporta-product-ui/playwright.config.ts (NEW, 55)
- packages/web/test/sporta-product-ui/journey-sporta-route.spec.ts (NEW, 114)
- packages/web/test/sporta-product-ui/journey-destination-screens.spec.ts (NEW, 127)
- packages/web/test/sporta-product-ui/screens-harness.html (NEW, 71)
- packages/web/test/sporta-product-ui/README.md (NEW, 46)
- packages/web/test/sporta-product-ui/artifacts/*.png (NEW, 20 committed screenshots — see EVIDENCE MANIFEST)
- docs/implementation/worker-ui-c.md (NEW — this report)

File-size law: largest src file 229 lines (< 400 everywhere; verified).

## TESTS

Runner law: node:test + tsx for the battery (no new framework); @playwright/test for the browser journeys (the Wave-0 serialized web dev-dep — manifest untouched).

- packages/web/test/sportaScreens.test.ts — 9 tests, 9 pass / 0 fail (~0.6s):
  1. registrations: all five ids validate through the FROZEN `validateSportaScreenRoute`; product copy present; no zcode/zai vocabulary in nav labels/purposes.
  2. marketplace adapter over the REAL composition (compile-time structural-compat assignment asserted): 2 listings surface (PUBLISHED + honestly SUSPENDED); detail rides the SAME read models — 3-role review, disclosure digest BYTE-EQUALITY with the listing, the legal notice, and the REAL measured sample preview (grade `measured`) reaching the detail view; unknown listing rejects typed (`/no listing list:unknown/`).
  3. my-pipelines adapter: the SAME records filtered by creator (2 real rows + the declared `seam:submission-reads` gap row whose note names NEXT DEPENDENCIES); REAL version-status read + honest typed refusal for unknowns; other creators see only the gap row.
  4. runs views over a REAL deterministic run: REAL child-process step (timing > 0), `semanticFidelity: measured`, row state `succeeded`, audit lines carry the work graph + fidelity + output references.
  5. runs views over a REAL typed refusal (`fail-closed` model node): the run service records the `typed-failure` step verbatim; row state `Finished — typed failure`.
  6. runs views over a REAL declared-fallback refusal: the node's DECLARED mode is honored (`fallback-used`), never relabeled as failure.
  7. runs views over a REAL live run: pinned session evidence with the exact `real-local-live` grade over a real localhost HTTP source; the screen line renders it verbatim; "production" appears nowhere; 5 frames counted; row shows 1 live session.
  8. library views over the REAL artifact fabric: 2-revision lineage root-first, HEAD marked on the newest, parent chain + provenance preserved; product-language editability label; provenance chain renders as the lineage summary.
  9. connected apps over the REAL service: observe vs observe+control independence visible (`notGranted` = ["control"] on the observer), separate learning consent line, data scope + network line; the REAL `revokeAttachment` stamps the revocation and the screen view projects "revoked at … (was: observe)".
  10. fixture hosts: every browser fixture host reports `backing: "fixture"`; every demo row carries its fixture note; typed refusals for unknown ids; the fixture revoke transition is honest (re-revoke refuses typed).

## REAL EVIDENCE (measured on THIS sandbox; baseline measured FIRST at f1192a6, lane measured on the final tree)

- Architecture: `node scripts/architecture/architecture-check.mjs check` → `architecture: OK / violations: 0 / baseline: 0 / new: 0` (exit 0) — IDENTICAL to baseline.
- Surface: `node scripts/architecture/sporta-surface-check.mjs` → `OK — frozen surfaces intact, growth is additive-only` (all frozen module counts identical to base — this wave adds ZERO sporta-side names; all changes live in packages/web lane roots).
- Typecheck: `pnpm exec tsc -b packages/web` → exit 0.
- Web battery: `pnpm exec tsx --test packages/web/test/*.test.ts` → 34 pass / 0 fail (baseline 25 + 9 new).
- Full battery: `pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts` → **906 pass / 0 fail / 0 skipped** (baseline at f1192a6, measured BEFORE any lane code on this sandbox: **897 pass / 0 fail**).
- Lint: `pnpm run lint` → 0 errors, 70 warnings (identical to baseline; a transient unused-param warning in my lane was fixed).
- Browser journeys: `pnpm exec playwright test --config test/sporta-product-ui/playwright.config.ts` → **4 passed** (2 specs × 2 breakpoint projects) in ~31s on chromium 156.0.8078.4 (playwright chromium v1248, installed from the official CDN during this session).

## REAL EVIDENCE — the browser-verification statement (honest, exact)

- REAL browser: the journeys ran in headless chromium via @playwright/test against the REAL `packages/web` vite dev server (vite 8.0.8) — real HTTP, real page loads, real clicks, real screenshots. NOT component-mount-only; UI-16/17 route evidence is `journey-sporta-route.spec.ts` on the REAL `/sporta` route.
- What the route journey proves at this SHA: the route loads through the real entry (title "Sporta — Product Loop"), renders product surface with honest FIXTURE badges, executes a consent write (typed result visible), exercises the studio's honestly-disabled action with its reason visible, shows the approved listing with the verbatim `grade FIXTURE`, walks feed-launch selection → disclosure → confirmation → admission result surfaced verbatim, and shows app permission + revoked states. Console errors and failed network responses: ZERO (asserted).
- What it does NOT prove (stated exactly, never relabeled): the route currently mounts the W10 diagnostic panel + studio over labeled FIXTURE hosts — the REAL compositions are headless-only by the W4-C law, so every value the route shows is FIXTURE-labeled; and Worker C's five destination screens are NOT on the route at this SHA (no shell exists). The screens' real-browser interaction evidence is the harness journey, which is COMPONENT-LEVEL by definition. The REAL (headless) counterparts of every fixture path are the node-battery REALs above.
- REAL service paths proven in this wave's battery (headless): the marketplace read gates, the run service's child-process + typed-failure + declared-fallback lanes, the real-local-live HTTP live session, the artifact lineage chain, and the app revoke path.

## FIXTURE EVIDENCE (all labeled at the point of use)

- The browser fixture hosts (`marketplaceFixtureHost`, `runsFixtureHost`, `libraryFixtureHost`, `appsFixtureHost`): static demo records behind the screen ports, every screen rendering a "BACKING: FIXTURE (browser demo)" badge; demo creator rows carry `origin: "fixture-demo"` + a fixture note; fixture refusals are typed (`fixture host: no …`). The harness page itself is labeled "NOT the /sporta product route".
- The route journey's data is the W10A-2 browser fixture host's (pre-existing) — the FIXTURE HOST badge renders on the route at all times.
- Battery fixture legs (labeled in the file header): in-memory stores, the fixture model adapter's forced refusals (the RUN SERVICE lanes they drive are REAL), the fixture probe, in-memory blob store in the runs tests (the FS blob leg is proven by the composition tests).

## CONTRACT CHANGES

NONE. No frozen name touched (`SportaScreenId`, `SportaScreenRoute`, `SportaNavigationRefusal`, `SportaScreenRegistration`, `SportaProductShellPort`, `SPORTA_THEME_TOKENS`, `validateSportaScreenRoute`, `SportaScreenEvidenceGrade` — consumed as-is). No sporta-* package surface change (surface check counts identical). Additive constants only: five `SportaScreenRegistration` exports + lane port/view types in NEW files.

## SECURITY

- No new network surface: screens are local React over injected ports; the only IO in the lane is the battery's real localhost live-source leg (loopback, disposed).
- Least-privilege display: granted vs NOT-granted capability classes side by side; mutating classes carry an explicit confirmation warning; learning consent always explicit (attachment alone never learns); audit lines are sanitized decision records, never payloads; no secrets anywhere in the lane (grep-clean: no tokens/keys).
- Fail-closed honesty preserved end-to-end: every refusal (unknown listing/run/artifact/attachment, suspended listing, missing seam, re-revoke, disabled action) is typed + surfaced with its reason; nothing softened.

## PERFORMANCE

- Battery: web battery 34 tests ~3.5s; full battery 906 tests in seconds-scale runs (no regression vs baseline's shape; the lane's 9 tests add ~0.6s).
- Journeys: 4 browser journeys in ~31s including the dev-server boot; each spec asserts console/network cleanliness so silent perf-degrading failures (error retries, 4xx/5xx storms) would fail the gate.
- Bundle impact: four small screen roots (all pure React + CSS; no new runtime dependencies); CSS uses standard properties only; no layout-jank primitives (grid/flex with min-width:0 containment).

## RISKS

- The screens' `--sporta-*` token consumption uses FALLBACK values until Worker A's shell defines the tokens; if Worker A's final token semantics differ (e.g. dark product theme), the fallbacks are visually replaced at integration — no API coupling (names are the contract, verified against `SPORTA_THEME_TOKENS`).
- The structural-mirror law decouples my lane from studio/** edits, but if Worker B changes the studio host port's VIEW shapes (not the port itself), the mirrors drift — the battery's compile-time compat assignment + REAL-record assertions are the tripwire (they fail loudly).
- The route's fixture-host review-status quirk (see BLOCKERS/finding) makes the route marketplace tab show "No review decision recorded" — cosmetic fixture-host only; the REAL composition is proven correct.

## BLOCKERS

NONE blocking this lane's delivery. One finding for the TL (no action by this worker — shared-root file, not lane-owned):

- FINDING (pre-existing at f1192a6, verified by journey): `packages/web/src/sporta/studioBrowserFixture.ts` keys its review snapshots by LISTING id while the `TransformStudioHostPort.readReviewStatus` signature passes a PIPELINE id — the /sporta route's Marketplace tab therefore honestly renders "No review decision recorded." although the fixture carries a review. The route journey asserts the honest null (never a fabricated review) and the w11c SPEC documents it. TL-owned fix when convenient.

## DEVIATIONS

1. `packages/web/test/sportaScreens.test.ts` sits at `packages/web/test/` (the established battery glob root `packages/web/test/*.test.ts`) rather than inside `test/sporta-product-ui/**` — the packet lists the latter as the Playwright journey root; the node battery follows the EXISTING web-battery precedent (all prior web tests live there). Both roots are lane-owned.
2. The committed screenshots live under `test/sporta-product-ui/artifacts/` (inside the lane's test root). `artifacts/test-results/` (Playwright failure noise) is left uncommitted.
3. The lane config boots its OWN vite instance on port 5199 (config's `webServer`) instead of reusing 5173 — deterministic, parallel-safe, zero shared-state edits.

## NEXT DEPENDENCIES (for the TL to serialize; nothing improvised in this lane)

1. **Worker A's shell + TL route wiring (the big one):** mount the five registered screens on the /sporta route through Worker A's `SportaProductShellPort` (my screens are wired by CONSTRUCTOR INJECTION — each takes its port; the registration constants are ready for the shell's registry). Until then the screens' browser evidence is the labeled harness journey, NOT route evidence.
2. **Run-history read seam on the composition:** expose the TransformRunManifest history (the run service's records) on a composition surface so `RunsScreenPort` can be satisfied by REAL history reads in the browser-adjacent path (the battery proves the REAL record projection; the adapter currently surfaces the missing seam).
3. **Artifact read seam on the composition:** expose artifact + revision/lineage reads (and a gated content/export path) so `LibraryScreenPort` rides the host's artifact fabric (battery proves REAL lineage projection; export stays disabled-with-reason until the content seam exists).
4. **App audit + revoke write on a screen surface:** the audit-read and the revocation write need a composition-level surface (the studio host port's surface law intentionally allows only the launch write). The battery drives the REAL `revokeAttachment`; the browser revocation remains the labeled fixture transition.
5. **Marketplace submission-read seam:** creator DRAFT/SUBMITTED/CHANGES_REQUESTED states need the marketplace candidate-store reads on a screen-accessible surface (my-pipelines currently shows real PUBLISHED/SUSPENDED records + the declared gap row + labeled fixture demo states).
6. **studioBrowserFixture review-key quirk** (see BLOCKERS): align the fixture's review map with the port signature.
7. **Chromium station note:** the station needs `playwright install chromium` for the resolved @playwright/test 1.64.1 (chromium v1248) before re-running the browser gate; the lane config's webServer boots vite itself.

## EVIDENCE MANIFEST (screenshots, committed)

All at `packages/web/test/sporta-product-ui/artifacts/`; `desktop` = 1440x900, `mobile` = 390x844:

| Journey step | File pair (desktop / mobile) | Proves |
|---|---|---|
| Route: product surface after load + consent write | `route-1-home-desktop-1440x900.png` / `route-1-home-mobile-390x844.png` | REAL /sporta route renders; FIXTURE badge; typed consent result |
| Route: marketplace listing + grade | `route-2-marketplace-…` | approved listing, verbatim `grade FIXTURE`, honest review-null |
| Route: launch disclosure | `route-3-disclosure-…` | P9-12 disclosure before launch (license visible) |
| Route: admission result | `route-4-admitted-…` | "Admitted — Pinned release sha256:4d… ent:fixture-studio-1" verbatim |
| Route: attached apps | `route-5-apps-…` | granted observe + revoked states, learning-consent line |
| Harness: marketplace detail | `screens-1-marketplace-…` | disclosure facts, grade FIXTURE, disabled action + reason |
| Harness: my-pipelines | `screens-2-my-pipelines-…` | state groups, FIXTURE DEMO labels, disabled writes + reason |
| Harness: runs detail | `screens-3-runs-…` | typed-failure evidence, disabled run control + reason |
| Harness: library lineage | `screens-4-library-…` | 2-revision lineage, HEAD, disabled export + reason |
| Harness: apps revoke | `screens-5-apps-revoked-…` | scopes/audit empty-state honesty, revoke interaction result |

## GATE TABLE (real measured numbers — baseline FIRST at f1192a6, then the lane tree)

| Gate | Command | Baseline @ f1192a6 | Lane tree (final) |
|---|---|---|---|
| Architecture | node scripts/architecture/architecture-check.mjs check | OK — violations 0, baseline 0, new 0 | OK — violations 0, baseline 0, new 0 (identical) |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact | OK — identical counts (zero sporta-side changes) |
| Typecheck | pnpm exec tsc -b packages/web | exit 0 | exit 0 |
| Tests (web) | pnpm exec tsx --test packages/web/test/*.test.ts | 25 pass / 0 fail | 34 pass / 0 fail |
| Tests (full battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts | 897 pass / 0 fail | 906 pass / 0 fail |
| Lint | pnpm run lint | 0 errors, 70 warnings | 0 errors, 70 warnings (identical) |
| Browser journeys (NEW) | pnpm exec playwright test --config test/sporta-product-ui/playwright.config.ts | n/a (no harness tests at base) | 4 passed (2 specs × 2 breakpoints), ~31s, chromium 156.0.8078.4 |

(The W10-close station battery was 873/873 + web 11/11 — verified stale: this sandbox's f1192a6 measures 897/897 + web 25/25; both lanes' numbers recorded per the verify-don't-trust law.)
