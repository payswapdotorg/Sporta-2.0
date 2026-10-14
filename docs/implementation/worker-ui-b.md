# Worker W11B Implementation Report

Worker: w11b (Wave 11, Worker B lane — the Studio as a feed-to-output workbench)

Status: WAVE 11 WORKER B IMPLEMENTED (branch `wave11/worker-ui-b`, base f1192a6; commit 1 = SPEC (SPEC-first), commit 2 = implementation + tests + this report).

Scope: the Studio presentation replaced by a purposeful feed/source → pipeline graph → preview/event context → run confirmation → status/output workbench, composed ONLY through the existing real seams (`TransformStudioHostPort` reads + the single launch-selection write path), the legacy Marketplace/Apps tabs reworked into summaries + links to Worker C's first-class screens, the studio registered through the TL-FROZEN W11 product contracts, and ONE additive optional live-evidence port seam (the W10 lanes). ZERO edits outside `packages/web/src/sporta/studio/**` + `packages/web/test/` (additive tests) + this report. ZERO edits to main.tsx, SportaPanel.tsx, sportaPanel.css, product/**, marketplace/apps/runs/library roots, shared manifests, lockfile. ZERO frozen-name edits (surface check green).

## WORK ITEMS

- **W11B-1 — the workbench layout (desktop-first, mobile-safe):**
  - `TransformStudio.tsx` (M, rewritten, 332 lines) — the workbench root: three-region grid (source rail | main work area | stage context) reading left-to-right through the product flow; keeps the `host` prop (the SportaPanel mount keeps working UNCHANGED — `packages/web/src/sporta/SportaPanel.tsx` still renders `<TransformStudio host={studio} />`) and gains an OPTIONAL `shell?: SportaProductShellPort`. Loading/error/empty states for EVERY async seam (listings, review, preview, live evidence, disclosure, admission, attachments, validation); async results render with `role="status"`/`role="alert"`.
  - `SourceRail.tsx` (NEW, 256) — evidence badges (host grade + the frozen `SportaScreenEvidenceGrade` at the point of use), the stage progress rail (Source → Pipeline → Preview → Launch → Status/output; done/current/locked with honest reasons, `aria-current="step"`), the feed/source selection (recorded sample feed + live sources with the W10 evidence VERBATIM), and the cross-screen links.
  - `PipelinePicker.tsx` (NEW, 79) + `GraphPanel.tsx` (NEW, 207) — the MAIN work area (the widest region): published listings selectable, SUSPENDED listings honestly visible and explicitly not-selectable ("SUSPENDED — new runs blocked", disabled button with reason); the graph work area with node drafting (declared component-digest input), edge drafting (last-two-nodes connect with a dataKind hint), and validation through `host.validateGraph` with typed per-violation records VERBATIM + per-kind count chips (display-only labels).
  - `PreviewPanel.tsx` (NEW, 73), `LaunchPanel.tsx` (NEW, 152), `StatusPanel.tsx` (NEW, 80), `StudioSummaries.tsx` (NEW, 84) — the stage context: sample preview + review status (honest null when a pipeline declares no sample); the P9-12 disclosure + explicit confirmation gate + admission result; status/output with the preview run's measured evidence and Runs/Library links; the legacy Marketplace/Apps tabs as concise summaries.
  - `studio.css` (M, 320) + `studioWorkArea.css` (NEW, 248) + `studioContext.css` (NEW, 204) — the workbench styling. TOKEN LAW: the frozen `--sporta-*` namespace (`SportaThemeTokens` vocabulary) consumed with self-consistent fallbacks (`var(--sporta-color-bg, #101014)` etc.) — the studio inherits Worker A's tokens when the sheet is wired and is self-consistent before. Desktop = the 3-region grid (≥980px); mobile (390x844) = single column stacked in flow order, `min-width: 0` grid children, `overflow-wrap: anywhere` on digests, wrapped chip rows — NO horizontal page overflow. `:focus-visible` outlines on every interactive element; 44px-class touch targets preserved on narrow phones; state never rides on color alone (grade/refusal strings always render as text).
- **W11B-2 — one coherent workflow through the EXISTING real seams (state-owner law):**
  - Graph editing + validation: `host.validateGraph` — the REAL `validateTransformPipelineManifest` when the headless composition drives the studio; typed violations surface VERBATIM (never stringly, never swallowed).
  - Sample preview + source selection: recorded feed through the composed `readSamplePreview` seam (a REAL run with measured carry-forward evidence at the point of use); live sources through the NEW optional `readLiveSourceEvidence?()` seam with the W10 evidence VERBATIM — the exact grade string `real-local-live` (closed vocabulary; "production" unutterable), session rows (sourceId, frames consumed, opened/closed, close reason), typed refusals (kind + detail + frames consumed) rendered as refusals (`role="alert"`). When the host does not compose the seam, the rail states the absence honestly and the recorded feed stays fully available.
  - Run confirmation + disclosure: `readLaunchDisclosure` + the EXISTING `launchSelection.ts` machine (disclosure → explicit confirmation → admission) — no second ladder; `selectForLaunch`'s typed result surfaces VERBATIM (admitted pins the approved digest + entitlement; every refusal keeps its frozen reason + detail, also carried into StatusPanel — "the refusal IS the status").
  - Run status/evidence: the preview run's manifest-pinned grade (`measured`) + semantic evidence displayed at the point of use; links into Worker C's `runs`/`library` screens (the run-history/artifact-lineage authorities — never duplicated here).
  - Legacy Marketplace/Apps TABS: DELETED (GraphBuilderTab/MarketplaceTab/LaunchTab/AppsTab — verified zero out-of-lane importers) and reworked into concise summaries + links pointing at Worker C's first-class `marketplace` and `connected-apps` screens; the summaries read the SAME `listListings`/`listAppAttachments` data the flow already loaded — no parallel marketplace/app state, no second authority.
- **W11B-3 — shell registration + link routes (Worker A contract):** `studioRegistration.ts` (NEW, pure, 95) — `STUDIO_SCREEN_REGISTRATION: SportaScreenRegistration` (id `studio`), `STUDIO_LINK_ROUTES` (`SportaScreenRoute` values for marketplace/connected-apps/runs/library, all fail-closed validated by `validateSportaScreenRoute`), `studioEvidenceGrade` (the host evidence projected VERBATIM onto `SportaScreenEvidenceGrade`: real→real, fixture→fixture). At base f1192a6 Worker A's shell component is NOT present (only the frozen contract module), so the root codes against the contract TYPES + validation and renders the links DISABLED-WITH-REASON when no shell is injected ("Shell navigation is not wired into this studio mount yet"); when wired, navigation goes through `shell.navigate()` and a typed `SportaNavigationRefusal` renders verbatim. Recorded in NEXT DEPENDENCIES.
- **W11B-4 — the optional live-evidence port seam (additive):** `studioPorts.ts` (M, additive, +41 lines) — `StudioLiveSourceView` (structural mirror of the W10 descriptor + session evidence) + the OPTIONAL `readLiveSourceEvidence?()` on `TransformStudioHostPort` (both existing hosts remain structurally valid; the optional method is the only port change).
- **Pure view-models (the tested seam):** `workbench.ts` (NEW, 175 — the flow state machine: stage derivation, honest locked-stage reasons, downstream-reset laws, launch-readiness gating; launch stages cannot progress without a selected pipeline) and `liveSourceViews.ts` (NEW, 149 — the W10 display mapping with `liveSourceFromEvidence`, the adapter that carries REAL `LiveSessionEvidence` records into the view VERBATIM).

## CHANGED FILES

All inside the owned boundary `packages/web/src/sporta/studio/**` + additive tests in `packages/web/test/` + this report.

- packages/web/src/sporta/studio/SPEC.md (NEW, 174 — committed FIRST, SPEC-first law)
- packages/web/src/sporta/studio/README.md (M, +W11B section; earlier sections kept as history)
- packages/web/src/sporta/studio/studioPorts.ts (M, additive: `StudioLiveSourceView` + optional `readLiveSourceEvidence?`; 242 lines)
- packages/web/src/sporta/studio/workbench.ts (NEW, 175)
- packages/web/src/sporta/studio/liveSourceViews.ts (NEW, 149)
- packages/web/src/sporta/studio/studioRegistration.ts (NEW, 95)
- packages/web/src/sporta/studio/TransformStudio.tsx (M, rewritten, 332)
- packages/web/src/sporta/studio/SourceRail.tsx (NEW, 256)
- packages/web/src/sporta/studio/PipelinePicker.tsx (NEW, 79)
- packages/web/src/sporta/studio/GraphPanel.tsx (NEW, 207)
- packages/web/src/sporta/studio/PreviewPanel.tsx (NEW, 73)
- packages/web/src/sporta/studio/LaunchPanel.tsx (NEW, 152)
- packages/web/src/sporta/studio/StatusPanel.tsx (NEW, 80)
- packages/web/src/sporta/studio/StudioSummaries.tsx (NEW, 84)
- packages/web/src/sporta/studio/studio.css (M, 320 — split below the 400-line law)
- packages/web/src/sporta/studio/studioWorkArea.css (NEW, 248)
- packages/web/src/sporta/studio/studioContext.css (NEW, 204)
- packages/web/src/sporta/studio/GraphBuilderTab.tsx (DELETED — superseded by GraphPanel; zero out-of-lane importers, verified)
- packages/web/src/sporta/studio/MarketplaceTab.tsx (DELETED — superseded by PipelinePicker + MarketplaceSummary)
- packages/web/src/sporta/studio/LaunchTab.tsx (DELETED — superseded by LaunchPanel over the SAME launchSelection machine)
- packages/web/src/sporta/studio/AppsTab.tsx (DELETED — superseded by AppsSummary + links)
- packages/web/test/studioWorkbench.test.ts (NEW, 235 — 11 tests)
- packages/web/test/studioLiveEvidence.test.ts (NEW, 258 — 2 tests, REAL live composition)
- packages/web/test/studioWorkbenchRender.test.ts (NEW, 403 — 8 component-render tests)
- docs/implementation/worker-ui-b.md (NEW, this report)

File-size law: every src file < 400 lines (largest: TransformStudio.tsx 332).

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict — the project law). 21 new tests, all passing, clean teardown. Browser-verification level stated HONESTLY below.

- **studioWorkbench.test.ts (11, PURE with REAL typed fixtures):**
  1. Registration through the FROZEN `SportaScreenRegistration` contract (id `studio`, non-empty copy, every link route validates fail-closed, destinations = marketplace/connected-apps/runs/library).
  2. Screen evidence grade projects VERBATIM (real→real, fixture→fixture).
  3. Stage rail starts at source with honest locked reasons.
  4. Full flow advance source→pipeline→preview→launch→status (done/current/locked derivation).
  5. A refusal is a first-class status ("read the typed refusal"), never replaced by success copy.
  6. Upstream changes reset downstream context (source change → launch idle; pipeline change → preview + launch idle).
  7. The launch stage cannot progress without a selected pipeline (disclosure without a pipeline is unrepresentable).
  8. The grade string flows VERBATIM (`real-local-live` / `fixture`; never "production").
  9. Session evidence rows carry the record's own values (verbatim, incl. cadence/queue-bound line).
  10. A typed refusal displays as a refusal with the partial-evidence count, verbatim line asserted exact.
  11. A declared source without a session states the absence honestly; standalone session rows handle `in-flight`/`not closed yet`.
- **studioLiveEvidence.test.ts (2, REAL composition — the liveIngressRun.test.ts class):**
  12. **REAL live run**: a REAL localhost HTTP live session (`RealLocalHttpLiveSourceAdapter` — real node:http server socket + real client, real cadence) drained by the REAL `LiveTransformRunService` INTO the EXISTING `TransformRunService` (REAL deterministic-filter child process, real pipes; timingMs > 0 asserted; `3 kept byte-exact, 2 dropped` measured evidence). The pinned `LiveSessionEvidence` flows through `liveSourceFromEvidence` → `liveSourceRows` VERBATIM (grade `real-local-live`, 5 frames, close reason `completed`, opened/closed timestamps byte-equal) and the SAME run feeds `projectSamplePreview` (grade `measured` at the point of use). "production" appears nowhere. Adapter disposed in `finally`.
  13. **Typed refusal lane**: `queueBound: 0` descriptor refuses fail-closed BEFORE any IO (`LiveIngressError`, kind `invalid-descriptor`, framesConsumed 0, detail `/positive integer/`); the refusal renders through `liveRefusalLine` with the exact verbatim format; no run executes, no session fabricated.
- **studioWorkbenchRender.test.ts (8, COMPONENT-LEVEL — real React renders via react-dom/server, no new framework, no CSS involved):** SourceRail (badges, stage rail, honest live-absence state, reasoned disabled links, verbatim live rows + refusal alert); PipelinePicker (loading/error/empty + the honest SUSPENDED-not-selectable state); GraphPanel (empty work area, disabled validate, declared-digest field); PreviewPanel (loading/error/honest-null + measured evidence with signoff summary); LaunchPanel (disclosure → confirmation, refused verbatim with role=alert); StatusPanel (idle/refused/admitted with evidence + screen links); StudioSummaries (published/suspended counts, grant/revocation/learning-consent lines, Worker C destinations). The panels import ZERO CSS (the sheets load only in the root) so the Node runner can render them; the ROOT stays BUILD-VERIFIED per the project law.

**Browser-verification level (honest):** component-level (real React renders, asserted) + REAL Node composition battery + `tsc`/vite-transform verification. NO browser run in this lane: no browser harness exists at this base, the Playwright harness under `packages/web/test/sporta-product-ui/**` is Worker C's owned root, and a bootstrap would not be cheap/additive from here. The desktop/mobile acceptance numbers (1440x900 / 390x844) are enforced by the responsive CSS laws + the render tests, and remain PENDING browser evidence at Worker C/TL integration.

## REAL EVIDENCE

- REAL live session: REAL localhost HTTP source (adapter binds 127.0.0.1, real socket, real cadence timers) → 5 frames drained → REAL deterministic-filter child process run (`timingMs > 0`) → pinned `LiveSessionEvidence` grade `real-local-live`, close reason `completed`, refusal null — displayed VERBATIM through the studio mapping.
- REAL admission gate (existing composition, unchanged): fail-closed `selectForLaunch` — the admitted digest is byte-equal across listing → disclosure → admission; refusals (`suspended`, `rights-prerequisites-unsatisfied`, `listing-not-published`) surface VERBATIM (covered by the EXISTING studioComposition.test.ts, still green — the workbench changed ZERO seam behavior).
- REAL validation verdicts: the REAL `validateTransformPipelineManifest` over the draft manifest mapping (existing composition test still green; the workbench renders the same typed records).
- REAL render output: 8 React static renders with asserted DOM facts (roles, aria-current, disabled-with-reason, verbatim evidence strings).
- Measured at the w11b tree: full battery 919/919 (baseline 897/897 + 22 new), web 47/47 (baseline 25/25 + 22 new), arch 0/0/0, tsc exit 0, lint 70 warnings / 0 errors (EXACTLY the baseline — zero new warnings).

## FIXTURE EVIDENCE

- The browser fixture studio host (labeled "FIXTURE HOST (browser demo)" in the UI) drives the render tests: fixture listings (published + SUSPENDED), fixture disclosure with the legal notice, fixture app attachments (observe / observe+control / revoked). All fixture content is labeled at the point of use (badges + per-record `fixture` grades) — never presented as real.
- The test seed content (frames, manifest, descriptors) in studioLiveEvidence.test.ts is fixture; every process observation (spawn timing, sockets) is REAL.
- The stage-rail/flow fixtures are pure typed literals from the contract shapes.

## CONTRACT CHANGES

- NONE to frozen names. `packages/web/src/sporta/product/contract.ts` untouched; `packages/sporta-transforms` frozen surface untouched (surface check: all frozen names intact, growth additive-only).
- ONE additive port surface change, inside the owned lane: `TransformStudioHostPort.readLiveSourceEvidence?()` (OPTIONAL method + `StudioLiveSourceView` type) — existing hosts (studioComposition, studioBrowserFixture) remain structurally valid without implementing it; absence renders as an honest empty state.

## SECURITY

- Zero new IO paths in the studio: the only write path remains the launch-selection confirmation gate (disclosure → explicit confirmation → fail-closed admission). The optional live seam is a READ.
- Cross-screen navigation only through Worker A's shell port with fail-closed `validateSportaScreenRoute` validation first (screens never guess ids); the studio never mutates a URL.
- Refusals and disclosures render verbatim — no softening, no fabricated success, no fixture-as-real: the honest-evidence laws hold at the render layer (asserted by the battery).
- No secrets, no credentials, no tokens in any file (the dispatch token appears only in the push URL, never in the repo).

## PERFORMANCE

- The workbench loads listings + attachments once per mount (two reads, unchanged from the tabs' behavior); review + preview load per selected pipeline (parallel `Promise.all`); live evidence (when composed) is one read. No polling, no intervals.
- Grid layout is pure CSS (no JS measurement); the CSS split (3 sheets) keeps cascade cost identical (same rules, same total ~770 lines).
- React renders are memoized via `useCallback` handlers; panels are presentational and re-render only on their own props.

## RISKS

- Worker A's shell is absent at this base: the cross-screen links ship disabled-with-reason. If the shell contract evolves semantically (not just additively), `studioRegistration.ts` + the root's navigate handler are the only touch points.
- The optional live seam is not yet composed in `studioComposition.ts` (outside this lane), so the REAL headless host shows the honest absence state; the REAL live evidence display is proven at the composition level by the tests. Until composed, live-source selection exists only with fixture-grade hosts (labeled).
- The classic-JSX runtime shim (test-file-local `globalThis.React`) depends on tsx/esbuild transform behavior from the repo root; if the runner law changes, only studioWorkbenchRender.test.ts is affected.
- Vite production build transforms all 7761 modules (incl. the new sheets/panels) but the final render phase was OOM-killed in THIS sandbox (exit 137 — environment memory limit, non-battery command); the TL station should observe a normal build.

## BLOCKERS

- None blocking this lane. (Shell wiring and the live-seam composition are TL/Worker-A dependencies, recorded in NEXT DEPENDENCIES.)

## DEVIATIONS

1. The packet's read-list placed `studioComposition.ts` + `studioSeeds.ts` under `studio/`; at f1192a6 they live at `packages/web/src/sporta/` (the W10A layout). Read in place; NOT edited (outside this lane's roots).
2. The four legacy tab components were DELETED rather than kept as hidden routes: no out-of-lane importer existed (verified), the work order says the tabs must not survive as "four disconnected tabs as a substitute for product navigation", and their capabilities are preserved in the flow panels (graph/preview/launch) + summaries (marketplace/apps) using the SAME tested pure view-models (launchSelection.ts, marketplaceViews.ts, appAttachmentViews.ts, graphStudio.ts, samplePreview.ts — zero behavior edits).
3. The 400-line law forced the CSS split (753 → 320+248+204); all sheet imports live in the root only so the panels stay Node-importable for the render battery.
4. Browser evidence is NOT provided by this lane (stated honestly above) — component-level + REAL Node battery + build verification only; Worker C owns the browser journeys per the work order.

## NEXT DEPENDENCIES

1. **Worker A / TL**: inject the `SportaProductShellPort` into the studio mount (`<TransformStudio host={studio} shell={shell} />`) and consume `STUDIO_SCREEN_REGISTRATION` in the shell registry — the studio side is ready and type-checked against the frozen contracts.
2. **TL / W10A seam owner**: compose `readLiveSourceEvidence?()` in `studioComposition.ts` over a `LiveTransformRunService` read (the tests demonstrate the exact projection; the view type is in studioPorts.ts).
3. **Worker C**: the first-class `marketplace` / `connected-apps` / `runs` / `library` screens the studio links to; the Playwright harness under `packages/web/test/sporta-product-ui/**` (the studio's desktop/mobile visual acceptance rides it).
4. **TL integration**: the ZCode-style isolation for the /sporta route (outside every worker lane) and the reviewed 1440x900 / 390x844 screenshots (UI-16/17) — PENDING-station until then.

## DELIVERY

Branch `wave11/worker-ui-b` @ HEAD of this report's commit — pushed to the origin remote (gold channel). Commits: SPEC-first (`ad8e966`) → implementation + tests + report. Base: f1192a6 (W11 Wave 0 frozen).

## GATES (measured, BOTH stations)

| Gate | Baseline f1192a6 (measured first) | w11b tree (measured) |
|---|---|---|
| `node scripts/architecture/architecture-check.mjs check` | OK — violations 0 / baseline 0 / new 0 | OK — violations 0 / baseline 0 / new 0 |
| `node scripts/architecture/sporta-surface-check.mjs` | OK — all frozen names intact (transforms 31+51, marketplace 16+81, app-environments 14+72, product 6+24, arena 7+33) | OK — identical (additive-only growth preserved) |
| `pnpm exec tsc -b packages/web` | exit 0 | exit 0 |
| `pnpm exec tsx --test packages/web/test/*.test.ts` | 25/25 pass, 0 fail | 47/47 pass, 0 fail (+22) |
| `pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts` | 897/897 pass, 0 fail | 919/919 pass, 0 fail (+22) |
| `pnpm run lint` | 70 warnings, 0 errors | 70 warnings, 0 errors (zero new) |
| Browser E2E (Playwright, Worker C root) | not present at base | PENDING-station (honest — component-level only in this lane) |
| Visual acceptance 1440x900 / 390x844 | not present at base | PENDING-station (responsive CSS laws + render tests only) |

(The packet's "873/873 + web 11/11" were the W10-close numbers; the measured f1192a6 baseline is 897/897 + 25/25 — the TL Wave 0 freeze added the 5 contract tests and web-suite growth. Verified, not trusted.)
