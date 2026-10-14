# Worker W11A Implementation Report — Product shell, navigation, and Home

Worker: w11a (W11, Worker A lane — Sporta-native product shell, navigation, Home)

Status: WAVE 11 WORKER A IMPLEMENTED (branch wave11/worker-ui-a; spec commit 8e7e2e0 "w11a spec: product shell, navigation, Home (SPEC-first)" precedes the implementation commit that carries the code + tests + this report).

Scope: the Sporta-native product shell, the 7-screen product navigation, and the Home screen — implemented BEHIND the TL-frozen W11 Wave 0 contracts (`product/contract.ts`), reading through the EXISTING ports only (SCREEN-PORTS.md). ZERO edits to main.tsx, SportaPanel.tsx, sportaPanel.css, the studio/marketplace/apps/runs/library screen roots, shared package manifests, or the lockfile. The shell is a mountable React surface awaiting the TL integration step that wires it into /sporta (TL-owned per the work orders).

## WORK ITEMS

- W11A-0 — SPEC-first: `packages/web/src/sporta/product/SPEC.md` (NEW, 221 lines) committed BEFORE implementation (commit 8e7e2e0): ownership, the theme-token law + values, the control primitives, the navigation law (registrations/URL scheme/fail-closed refusal semantics/restoration), the shell layout law, the Home model + behaviors, the test plan with honest evidence labels.
- W11A-1 — Sporta theme tokens + unbranded controls:
  - `theme.ts` (61): `SPORTA_THEME_VALUES` — exactly one Sporta-owned value per frozen `--sporta-*` token name (a "broadcast control room under floodlights" sports-media identity: deep green-tinted charcoal `#0c1210`, match-day volt-green accent `#2fe089`, sage muted, condensed sporty heading stack — clearly not an IDE, not ZCode, not a debug dashboard); `sportaThemeDeclarations()` + `applySportaTheme(element)` for programmatic application; `SPORTA_DESKTOP_MIN_WIDTH` (1024) + `resolveSportaBreakpoint(width)` (1440→desktop, 390→mobile).
  - `theme.css` (258): the same 11 tokens SCOPED to `.sporta-app` (never `:root` — no leak in either direction across the product-vs-substrate boundary) + the control-primitive styles; every style consumes ONLY `var(--sporta-*)`.
  - `controls.tsx` (140): the unbranded primitives — `SportaButton` (primary/secondary/ghost; `disabledReason` renders the reason VISIBLY + `aria-describedby` — UI-06), `SportaPanelCard`, `SportaNavItem` (`aria-current="page"`, visible focus), `SportaStatusChip` (grade string VERBATIM; fixture = dashed border so grade is never color-alone — UI-15/UI-18), `SportaEmptyState`. No ZCode UI imports, no external UI framework.
- W11A-2 — product shell + navigation:
  - `navigation.ts` (264, pure): `SPORTA_PRODUCT_SCREENS` — the canonical 7 registrations in nav order (product copy, Sporta vocabulary); the `/sporta/<screen>?focus=` URL scheme (`sportaRouteToPath` / `parseSportaLocation` — accepts the `/cn/sporta` prefix, fail-closed: unknown screen → Home + `invalidScreen` flag, focus only when non-empty); the injectable `SportaRoutePersistence` seam (browser History adapter, browser-guarded; memory adapter for tests/headless); `createSportaProductShell()` — implements the FROZEN `SportaProductShellPort` with additive `subscribe`/`lastRefusal`/`restoredFromInvalidScreen`: navigate runs the FROZEN `validateSportaScreenRoute` first (unknown screen / empty focus = typed refusals carrying the validator's reason verbatim, route never mutated), then the closed registration check, then commit + persist + notify. Route restoration returns the persisted screen; an invalid persisted screen restores Home with a creation-time typed refusal.
  - `screens.ts` (40, types): `SportaScreenContext` (route, shell, host, studio?, breakpoint) + `SportaScreenModule` — screens navigate ONLY through the shell port, never the URL.
  - `shell.tsx` (259): `SportaProductShell({host, studio?, modules?, shell?, breakpoint?})` — skip-link; Sporta wordmark (Sporta's own mark — no ZCode logo/brand); desktop (≥1024px) left nav rail / mobile collapsing top nav (menu toggle with `aria-expanded`/`aria-controls`, Escape closes, real buttons throughout — keyboard operable, UI-18); content region mounting the registered screen module; the honest `SportaScreenNotAvailable` placeholder for the 6 screens Workers B/C have not shipped ("Not yet available in this build — nothing here is simulated" + purpose + the technical screen id; the shell never fakes content); a dismissible `role="alert"` typed-refusal banner; `document.title` = "Sporta — <navLabel>" per screen; `useSportaBreakpoint` (matchMedia-backed). Default modules = Home only; the TL integration passes Workers B/C's modules in.
  - `shell.css` (234): the shell layout/banner/placeholder styles (tokens only; no page-level horizontal overflow at mobile width — UI-19).
- W11A-3 — Home (`home/`):
  - `homeModel.ts` (304, pure): `deriveSportaHomeView(state, sampleRun)` — evidence VERBATIM (the host's "real"/"fixture" label, never re-badged — UI-15); honest per-state stage counts + product summary ("8 of 12 stages complete · finishing"); `attention` derived from stage STATES only (blocked/refused first with product copy + the seam's detail verbatim + the technical stage label; then actionable: learning-consent decision pending, escalation with the Arena in flight, result awaiting validation — each with an in-product next step; then informational: run in flight, validated result ready, improvement candidate live); `startActions` (recorded feed → Studio, live source DISABLED WITH REASON — no live-source seam exists, resume project → Studio); `learningStage` (drives the consent card); `sampleRun` (the studio seam's latest-run card, grade VERBATIM); the raw trace carried as secondary technical evidence (UI-05). No string-parsing of seam details for logic.
  - `HomeScreen.tsx` (362): reads `SportaHostPort.readState()` on mount (loading skeleton / error card with functional Retry / empty states — UI-20); the start-workflow grid; the attention list with functional next-step navigation through the shell port; the scoped learning-consent decision card (the intent's declared learning scopes with product labels; Grant/Decline through the EXISTING `host.submitConsent` write path; outcome surfaced VERBATIM — granted artifact id or the typed refusal detail; buttons visibly disabled with reasons when no scope is selected); the current-project card (evidence chip + expandable raw trace); the Runs & outputs card (the latest run from the EXISTING studio seam — `listListings()` → first PUBLISHED → `readSamplePreview()` — with outputSummary/semanticEvidence/grade verbatim, plus the honest missing-seam note where a runs FEED would be).
  - `home.css` (225): the Home styles (tokens only).
- W11A-4 — tests (below) + the SPEC-first commit.

## CHANGED FILES

All inside the owned boundary `packages/web/src/sporta/product/**` + `packages/web/test/**` (the task-assigned test locations) + this report. ZERO edits to any frozen contract file, TL-owned file, sporta-* package, manifest, or lockfile.

- packages/web/src/sporta/product/SPEC.md (NEW, 221 — spec commit 8e7e2e0)
- packages/web/src/sporta/product/theme.ts (NEW, 61)
- packages/web/src/sporta/product/theme.css (NEW, 258)
- packages/web/src/sporta/product/controls.tsx (NEW, 140)
- packages/web/src/sporta/product/navigation.ts (NEW, 264)
- packages/web/src/sporta/product/screens.ts (NEW, 40)
- packages/web/src/sporta/product/shell.tsx (NEW, 259)
- packages/web/src/sporta/product/shell.css (NEW, 234)
- packages/web/src/sporta/product/home/homeModel.ts (NEW, 304)
- packages/web/src/sporta/product/home/HomeScreen.tsx (NEW, 362)
- packages/web/src/sporta/product/home/home.css (NEW, 225)
- packages/web/test/sportaProductContract.test.ts (M, 65→181 — 5 freeze tests intact + 7 additive lanes; never weakened)
- packages/web/test/sportaProductShell.test.ts (NEW, 143)
- packages/web/test/sportaProductHome.test.ts (NEW, 252)
- docs/implementation/worker-ui-a.md (NEW — this report)
- UNTOUCHED (verified): contract.ts, SCREEN-PORTS.md, main.tsx, SportaPanel.tsx, sportaPanel.css, studio/**, composition.ts, hostPorts.ts, all manifests, pnpm-lock.yaml. Every src/CSS file < 400 lines (file-size law).

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict — the project law; no new framework). 23 new tests, all passing, deterministic; the REAL-composition tests use real temp dirs + clean teardown (the sportaHost.test.ts precedent).

- packages/web/test/sportaProductContract.test.ts (12 total = 5 frozen + 7 new): theme-VALUE completeness over the 11 frozen token names + the declarations string; theme values carry no ZCode/Zai vocabulary; the canonical registrations are the 7 closed screens in nav order with non-empty product copy (no ZCode vocabulary); unknown screen id through the shell = typed refusal (`closed vocabulary`) with the route never leaving Home; a valid-but-unregistered screen = typed refusal (`not registered`); the URL scheme parses fail-closed (unknown → Home + invalid flag; bare /sporta → Home; /cn/sporta/runs accepted; focus parsed); the URL scheme round-trips all 7 screens + an encoded focus.
- packages/web/test/sportaProductShell.test.ts (11): fresh shell starts at Home (never guesses); successful navigation commits + persists + notifies subscribers (unsubscribe stops delivery); focus round-trips through persistence; empty focus = the frozen validation's typed refusal verbatim (route unchanged); a refusal never mutates the route and the next success clears the banner; route restoration returns the persisted screen (UI-04); an invalid persisted screen restores Home with the typed refusal banner; registrations default to the canonical 7 in nav order; the browser persistence guard falls back to memory outside a browser; the serialized path form is canonical; the frozen 3-method port type is satisfied (compile-time law).
- packages/web/test/sportaProductHome.test.ts (5): (REAL composition) honest mid-loop view — evidence "real" VERBATIM, stage counts honest against the trace itself, attention includes the learning decision pending + the Arena escalation in flight, severity ordering blocked→refused→attention→info, start actions (recorded feed enabled→studio, live source disabled WITH reason, resume enabled), 12-stage trace carried; (REAL write path) the consent card's `host.submitConsent` grant flips learning pending→active and removes the decision item; (FIXTURE host, labeled) the browser fixture state derives honestly ("fixture" verbatim, 8/12 done · finishing, learning decision pending); (PURE) a quiet trace → empty attention ("Nothing needs attention" case) and a blocked stage → blocked-first product copy with the detail VERBATIM; (PURE) the sample-run card carries the studio grade VERBATIM ("measured") + outputSummary/semanticEvidence verbatim.

## REAL EVIDENCE (commands and numbers measured on THIS sandbox, base f1192a6; baseline measured FIRST, then re-measured after the wave)

- Baseline at f1192a6 (todo 0, measured before any edit): architecture `0 violations / baseline 0 / new 0`; surface `OK — frozen surfaces intact`; `tsc -b packages/web` exit 0; web tests **25 pass / 0 fail**; full battery **897 pass / 0 fail / 0 skipped** (~43.9s); lint **0 errors / 70 warnings**.
- Architecture: `node scripts/architecture/architecture-check.mjs check` → `architecture: OK / violations: 0 / baseline: 0 / new: 0` (exit 0) — identical to baseline.
- Surface: `node scripts/architecture/sporta-surface-check.mjs` → `OK — frozen surfaces intact, growth is additive-only` (identical per-module counts — my wave adds ZERO sporta-side names; all changes live in packages/web).
- Typecheck: `pnpm exec tsc -b packages/web` → exit 0, no output (the shell/controls/Home JSX compile in the web program).
- Web tests: `pnpm exec tsx --test packages/web/test/*.test.ts` → **48 pass / 0 fail** (25 baseline + 23 new; ~3.7s).
- FULL battery: `pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts` → **920 pass / 0 fail / 0 skipped** (~44.1s; baseline 897 + my 23).
- Lint: `pnpm run lint` → **0 errors, 70 warnings** — identical to the baseline (my files add zero warnings).
- REAL legs inside the new tests (the sportaHost.test.ts evidence class): the mid-loop Home test drives the REAL composition — a real spawned child process (the labeled stand-in executable) through `loop.runExecution`, a real FS blob store on a real temp dir via `loop.seedRenderArtifact` (stat-clean teardown), a real localhost HTTP arena through `loop.recordGapAndEscalate` (one real POST /escalations), and the real learning-intake write path through `host.submitConsent` (granted artifact id surfaced; the model flips pending→active from the re-read REAL state).

## FIXTURE EVIDENCE (labeled)

- The composition's in-memory stores + seed data behind the REAL services (the composition's own labeled FIXTURE legs — unchanged).
- The scripted Arena ROLE behind the real HTTP transport + the stand-in CLI executable (the sportaHost.test.ts fixture class, unchanged).
- The browser fixture host state in the home test (`createBrowserFixtureHost` — its "fixture" label asserted VERBATIM in the derived view).
- The synthetic quiet/blocked traces and the fixture-shaped sample preview in the PURE edge tests (labeled `evidence: "fixture"` inside the synthetic states).
- The React render layer (`shell.tsx`, `controls.tsx`, `HomeScreen.tsx`) is BUILD-VERIFIED via `tsc -b packages/web` (the SportaPanel/TransformStudio precedent) — NO browser run is claimed: the shell is not yet mounted on /sporta (the TL integration mounts it; Worker C owns the journey coverage), and the local vite build is OOM-bound on this 4GB sandbox (the W10A/W4C precedent — measured exit 137 at base). No Playwright tests were added by this lane (deliberate: journey coverage is Worker C's; a component smoke without the real route mount would not be route-level evidence).

## CONTRACT CHANGES (surface, verified by sporta-surface-check)

- ZERO frozen-name changes. `product/contract.ts` and `SCREEN-PORTS.md` are byte-identical to base. The frozen `SportaProductShellPort` is IMPLEMENTED behind (`createSportaProductShell`), with additive-only extra surface (`subscribe`/`lastRefusal`/`restoredFromInvalidScreen` on `SportaShellPortWithSubscription`).
- `@zcode/web` additive-only NEW public names: `SPORTA_THEME_VALUES`, `sportaThemeDeclarations`, `applySportaTheme`, `SPORTA_DESKTOP_MIN_WIDTH`, `resolveSportaBreakpoint` (theme.ts); `SportaButton`/`SportaPanelCard`/`SportaNavItem`/`SportaStatusChip`/`SportaEmptyState`/`SportaGradeLabel` (controls.tsx); `SPORTA_PRODUCT_SCREENS`, `sportaRouteToPath`, `parseSportaLocation`, `SportaLocationParse`, `SportaRestoredRoute`, `SportaRoutePersistence`, `createBrowserRoutePersistence`, `createMemoryRoutePersistence`, `SportaRouteListener`, `SportaShellPortWithSubscription`, `SportaProductShellOptions`, `createSportaProductShell` (navigation.ts); `SportaScreenContext`, `SportaScreenModule` (screens.ts); `SportaProductShell`, `SportaProductShellProps` (shell.tsx); `deriveSportaHomeView`, `SportaHomeViewModel`, `SportaHomeAttention`, `SportaHomeStartAction`, `SportaHomeStageCounts`, `SportaHomeAttentionSeverity`, `SPORTA_HOME_CONSENT_SCOPES`, `SPORTA_HOME_RUNS_FEED_NOTE`, `SportaHomeScreen`, `SPORTA_HOME_SCREEN` (home/). No existing name changed anywhere.

## SECURITY

- Product-vs-substrate boundary held: ZERO imports of ZCode UI components/theme/styles; all lane CSS is scoped to `.sporta-app` and consumes only `--sporta-*` tokens (the token block cannot leak into or be overridden from the ZCode surface; verified by the namespace tests + the surface check).
- State-owner law held: Home reads ONLY `SportaHostPort.readState` + the studio seam's `listListings`/`readSamplePreview`, and writes ONLY through the port's existing `submitConsent` path. No parallel state owner; no new write seams; navigation state is shell-owned (the URL is written only through the injected persistence seam).
- Fail-closed everywhere: unknown screens / empty focus are typed refusals (validator reason verbatim, route never mutated); unregistered screens refuse typed; invalid restored screens fall back to Home with a surfaced refusal; studio-seam failures surface as honest notes, never fabricated runs; nothing on Home is a placeholder button (every action functional or visibly disabled with its reason).
- No credentials/secrets in any new file; no network calls beyond the existing seams; the push uses the pre-configured token remote (token never echoed, never committed).

## PERFORMANCE

- New web tests: 48 in ~3.7s (my 23 add ~1s total; the two REAL-composition tests each ~50-150ms including one real child process + one real HTTP escalation each).
- Full battery: 920 in ~44.1s (baseline 897 in ~43.9s — the +23 tests account for the delta).
- Runtime cost of the shell: the controller is a plain closure (no timers); the breakpoint hook is one matchMedia listener; Home issues one `readState` + (when the studio port is provided) two studio reads per mount, dependency-narrowed to the port identities (no re-reads on route/focus changes).

## RISKS

- The shell is not yet visible on /sporta (the TL integration mounts it; until then the route still shows the SportaPanel) — expected per the work orders; the visual acceptance review (UI-16/UI-17) happens at the integration SHA with Worker C's journey coverage.
- The URL scheme (`/sporta/<screen>?focus=`) is proposed by this lane and serialized canonically without the `/cn` prefix; the TL integration may localize the serializer — parse already accepts both forms.
- Home's consent card lives in the "Learning preferences" card (the relevant product context per UI-14); if the TL prefers a dedicated consent surface, the card is one cohesive block in HomeScreen to relocate.
- The live-source action is honestly disabled (no seam exists). When a live-source seam lands, the action flips to enabled with a target — one property in `deriveStartActions`.
- The shell's default modules are Home-only; Workers B/C register their screens through the TL integration (the `modules` prop). Until then six nav destinations render the honest placeholder — by design, never a fake.

## BLOCKERS

- None for this lane. (Carried, pre-existing, outside this lane: the vendored apps/zcode-cli remains unbuildable in this sandbox — not needed here; the vite render-phase build OOM is recorded under REAL EVIDENCE/FIXTURE EVIDENCE — the W10A/W4C precedent, PENDING-station.)

## DEVIATIONS

1. **The home lane's files include `home/home.css` (a third CSS file beyond theme.css/shell.css).** The file-size law (<400 lines) made a single shell+Home stylesheet 450 lines; the split is purely mechanical (Home styles moved verbatim into `home/home.css`, loaded through HomeScreen.tsx — the Vite CSS-import law already used by SportaPanel/TransformStudio).
2. **No Playwright smoke tests added** (the packet made them optional "MAY ... ONLY as smoke-level evidence"). Reasoning: the shell is not mounted on any route in this lane (mounting it requires TL-owned main.tsx/index.html edits), the local vite build is OOM-bound on this sandbox (W10A precedent — measured exit 137 ×3 at base), and Worker C owns journey coverage. The honest label is BUILD-VERIFIED for the render layer + REAL contract tests for the logic — stated explicitly rather than papering over with a component-harness run that would not be route-level evidence.
3. **Home's consent card is a functional surface beyond the packet's literal Home task list** (start/resume/attention/empty states). Reasoning: UI-06 requires every visible action functional or disabled-with-reason; the learning-attention item pointed nowhere implemented, and the EXISTING host write path (`submitConsent`) is the state-owner-law-compliant way to make it functional. Scoped checkboxes + verbatim outcomes (UI-14).
4. **Baseline battery count vs the packet's recorded station numbers.** The packet said "W10 close: 873/873 + web 11/11"; THIS sandbox measures at base f1192a6: sporta-side 872 + web-side 25 = 897 full-battery (the web count includes W10-B's sandboxModelAdapter tests added after that station record; the 872-vs-873 sporta-side delta matches the W10A DEVIATIONS 4 platform note). My additive totals: web 48/48, full 920/920. Verified, not trusted — flagged for the TL re-run.
5. `parseSportaLocation` tolerates a query string attached to the pathname (strips it before matching; the search argument remains the focus authority) — a defensive nicety discovered by the round-trip test; documented in the code comment.

## NEXT DEPENDENCIES

- TL INTEGRATION (the mount): wire `SportaProductShell` into the /sporta route in main.tsx (replacing the panel-first entry per the work orders), passing the browser fixture hosts (`createBrowserFixtureHost()` + `createStudioBrowserFixtureHost()`) and Workers B/C's screen modules; isolate the ZCode global styles from the route (UI-03/UI-21). The shell's URL scheme (`/sporta/<screen>?focus=`, `/cn`-tolerant) is ready to adopt; `sportaRouteToPath` centralizes the canonical form.
- MISSING SEAM (recorded per the state-owner law): a run-LIST port (recent runs with ids/timestamps/states) for Home's "Recent runs" region and the Runs screen — Home currently shows the studio seam's latest sample run (labeled) + the honest not-connected note; the seam should be TL-serialized (e.g. a read method on the studio composition's port or the transforms run-service read projected per SCREEN-PORTS.md's runs row).
- MISSING SEAM: a live-source capability (feed capture/attach) — when it lands, Home's live-source start action flips to enabled (`deriveStartActions` one-property change).
- Workers B/C: register `studio`/`marketplace`/`my-pipelines`/`runs`/`library`/`connected-apps` screen modules (`SportaScreenModule`) through the TL; the shell renders them in the content region and the placeholders disappear.
- Optional: adopt `applySportaTheme` if the TL prefers imperative token application over theme.css; screenshot evidence at 1440x900 + 390x844 at the integration SHA (UI-17) with Worker C's harness.

DELIVERY: branch wave11/worker-ui-a @ 15b56c8 (branch HEAD — the report rider; implementation commit 0462dc1 carries code + tests, spec commit 8e7e2e0 precedes both; all pushed to payswapdotorg/Sporta-2.0)

Gate table (real, measured on this sandbox, final pre-commit run):

| Gate | Command | Result |
|---|---|---|
| Architecture | node scripts/architecture/architecture-check.mjs check | OK — violations 0, baseline 0, new 0 (baseline identical) |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact, additive-only (zero sporta-side changes) |
| Typecheck | pnpm exec tsc -b packages/web | exit 0, no output (baseline identical) |
| Tests (web) | pnpm exec tsx --test packages/web/test/*.test.ts | 48 pass / 0 fail (baseline 25 + 23 new) |
| Tests (full battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts | 920 pass / 0 fail / 0 skipped (baseline 897 on this sandbox; packet station record 873+11 — see DEVIATIONS 4) |
| Lint | pnpm run lint | 0 errors, 70 warnings (baseline identical — zero added) |
| Browser E2E | — | NOT CLAIMED by this lane (render layer BUILD-VERIFIED; the TL mounts the shell, Worker C owns journey coverage — see DEVIATIONS 2) |
