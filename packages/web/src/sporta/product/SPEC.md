# SPEC — W11 Worker A lane: Sporta product shell, navigation, and Home

Worker: w11a (W11, Worker A — product shell, navigation, Home). Authority
order: `docs/work-orders/sporta-native-ui-work-orders.md` (Worker A lane) →
`docs/architecture/adr-sporta-native-product-ui.md` +
`docs/architecture/sporta-product-ui.md` (the product-vs-substrate boundary
law) → `packages/web/src/sporta/product/contract.ts` (the TL-FROZEN W11 Wave 0
contracts — implementations go BEHIND the frozen names, additively) →
`packages/web/src/sporta/product/SCREEN-PORTS.md` (the state-owner law) →
`docs/testing/sporta-native-ui-acceptance.md` (UI-01..UI-22).

This SPEC is committed BEFORE implementation (SPEC-first law). Frozen names
are never edited; every new public name in this lane is additive.

## 1. Ownership and placement

- Owned root: `packages/web/src/sporta/product/**` (+ this SPEC) and
  `docs/implementation/worker-ui-a.md`. ZERO edits to `main.tsx`,
  `SportaPanel.tsx`, `sportaPanel.css`, shared package manifests, the
  studio/marketplace/apps/runs/library screen roots, or the lockfile.
- The shell is a MOUNTABLE React surface the TL integration wires into the
  /sporta route (TL-owned integration step). No route/entrypoint edits happen
  in this lane.
- File-size law: < 400 lines per src file (TS and CSS alike).

## 2. Theme tokens (W11A-1) — `theme.ts` + `theme.css`

The 11 frozen `--sporta-*` token names (`SPORTA_THEME_TOKENS`) get Sporta-owned
VALUES — a coherent sports-media production identity ("broadcast control room
under floodlights": deep green-tinted charcoal, match-day volt-green accent,
condensed sporty headings). NOT a code IDE, NOT ZCode brand, NOT a debug
dashboard; no ZCode theme classes, no external UI framework imports.

- `theme.ts` (pure, node-testable) exports:
  - `SPORTA_THEME_VALUES: Readonly<Record<keyof SportaThemeTokens, string>>` —
    exactly one value per frozen token name (completeness asserted in tests).
  - `sportaThemeDeclarations(): string` — the `--sporta-*: value;` declaration
    list (for programmatic application).
  - `applySportaTheme(element)` — sets the 11 custom properties on an element.
  - `SPORTA_DESKTOP_MIN_WIDTH` + `resolveSportaBreakpoint(width):
    SportaVisualBreakpoint` — the single visual breakpoint (desktop ≥ 1024px;
    the acceptance targets are 1440x900 desktop and 390x844 mobile).
- `theme.css` declares the same 11 tokens SCOPED to `.sporta-app` (the shell
  root class) — never `:root` — so the tokens cannot leak into or from the
  ZCode surface. All lane CSS consumes ONLY `var(--sporta-*)` values.
- Contrast: fg/muted/accent on bg/surface are chosen for WCAG-AA-plus text
  contrast; state is never color-alone (chips carry text + border treatment).

## 3. Unbranded control primitives (W11A-1) — `controls.tsx`

Small primitives consuming only sporta tokens/classes (no ZCode UI imports):

- `SportaButton` — variants primary/secondary/ghost; supports
  `disabledReason` (UI-06): a disabled-by-reason control renders the reason
  VISIBLY next to the control (plus `aria-describedby`), never a silent no-op.
- `SportaPanelCard` — titled surface section (`section` + heading semantics).
- `SportaNavItem` — nav button with `aria-current="page"` on the active item,
  visible focus, purpose text available to the active item.
- `SportaStatusChip` — honest evidence/status label; renders the grade string
  VERBATIM (`real` / `real-local` / `fixture` / `measured` / `declared`);
  fixture uses a dashed border so grade is never color-alone.
- `SportaEmptyState` — titled empty/missing block with optional hint + action.

## 4. Navigation (W11A-2) — `navigation.ts` (pure) + `shell.tsx` (React)

### 4.1 Registrations

`SPORTA_PRODUCT_SCREENS: readonly SportaScreenRegistration[]` — the canonical
7 registrations in nav order (the registration order IS the nav order, frozen
law): home, studio, marketplace, my-pipelines, runs, library, connected-apps,
each with product copy for `navLabel` + `purpose` (Sporta vocabulary: Feed,
Pipeline, Run, Output…; never ZCode/runtime jargon in nav).

### 4.2 Route scheme + restoration

- URL scheme (the TL integration adopts it when wiring the route):
  `/sporta/<screen>` with optional `?focus=<id>`; the parser also accepts the
  `/cn/sporta/<screen>` prefix. `sportaRouteToPath` serializes the canonical
  form; `parseSportaLocation(pathname, search)` parses fail-closed:
  - no screen segment → `{ route: { screen: "home" } }`;
  - unknown screen segment → home + `invalidScreen` flag (a typed refusal is
    surfaced by the shell banner; never a guess, never a crash);
  - `focus` is taken only when non-empty (the frozen
    `validateSportaScreenRoute` remains the single validation authority).
- Route persistence is an injected seam `SportaRoutePersistence`
  (`read()/write()`); default `createBrowserRoutePersistence()` (history
  pushState, browser-guarded), `createMemoryRoutePersistence()` for tests and
  non-browser mounts. A reload restores the current screen THROUGH the frozen
  `validateSportaScreenRoute` (UI-04).

### 4.3 The shell controller behind the frozen port

`createSportaProductShell(options?)` returns `SportaShellPortWithSubscription`
— implements the FROZEN `SportaProductShellPort` plus additive
`subscribe(listener)` / `lastRefusal()` (implementations go BEHIND the frozen
names additively):

- `navigate(route)` — fail-closed, in order: (1) frozen
  `validateSportaScreenRoute` — a failure returns
  `{ ok: false, refusal: { screen, reason } }` with the validator's reason
  VERBATIM (unknown screen ids are typed refusals, never guesses); (2) the
  screen must be registered in THIS shell (closed registration check); (3)
  only then commit route + persist + notify listeners. Refusals set
  `lastRefusal()` (surfaced as a banner) and never mutate the route.
- `currentRoute()` — the live route (restored from persistence at creation).
- `registrations()` — the registered screens (nav order).

### 4.4 The React shell (`shell.tsx` + `shell.css`)

`SportaProductShell({ host, studio?, modules?, shell?, breakpoint? })`:

- Root `<div className="sporta-app">` (theme tokens scoped here); skip-link;
  product top bar with the Sporta wordmark — no ZCode logo/brand (UI-01/02).
- Desktop (≥1024px): left nav rail listing the 7 registrations. Mobile
  (<1024px): collapsing top nav (menu button with aria-expanded/controls,
  Escape closes, focus visible). All nav items are real buttons (keyboard
  operable, UI-18).
- Content region mounts the registered screen module for the current route;
  screens with NO registered module render the honest placeholder
  `SportaScreenNotAvailable`: "Not yet available in this build — nothing here
  is simulated", the screen's purpose, and the technical screen id (the shell
  never fakes content; Workers B/C + TL integration ship those screens).
- A refused navigation surfaces a `role="alert"` banner with the typed refusal
  (screen + reason) and a dismiss control (UI-06: surfaced, not hidden).
- Screen modules: `SportaScreenModule { screen; render(context) }` with
  `SportaScreenContext { route, shell, host, studio?, breakpoint }` — screens
  navigate ONLY through the shell port (screens never mutate the URL).
- Default modules = the Home module only (this lane). The TL integration
  passes Workers B/C modules in.
- `document.title` follows the active screen ("Sporta — <navLabel>",
  browser-guarded).

## 5. Home (W11A-3) — `home/homeModel.ts` (pure) + `home/HomeScreen.tsx`

Home is the feed/media task entrypoint (UI-05/07): product-task-first, with
the raw 12-stage trace demoted to secondary expandable technical evidence.

### 5.1 State-owner law (SCREEN-PORTS.md, home row)

- Work/intent state + recent runs/outputs needing attention:
  `SportaHostPort.readState()` (`hostPorts.ts`) — the EXISTING host port,
  never a parallel state owner. The Home write action (learning consent) uses
  the SAME port's existing write path (`submitConsent`) — no new write seams.
- Run/manifest reads: the studio composition's seam — the EXISTING
  `TransformStudioHostPort` (optional): `listListings()` → the first
  PUBLISHED listing → `readSamplePreview(pipelineId, approvedVersion)` for the
  "latest run" card. No other studio surface is consumed by Home.
- MISSING SEAM (recorded, not invented): a run-LIST port (recent runs with
  timestamps/ids). Home shows an honest "not connected in this build" note
  where a runs feed would be — never a fabricated list. → NEXT DEPENDENCIES.

### 5.2 View model (pure `homeModel.ts`, node-testable)

`deriveSportaHomeView(state: SportaHostState, sampleRun?: StudioSamplePreviewView | null)`:

- `evidence` — the host's evidence VERBATIM (UI-15: "real" stays "real" — the
  host port's own label for the real-legged headless composition; "fixture"
  stays "fixture"; never inflated, never re-badged).
- `project` — the resumable current work graph: product summary
  ("N of 12 stages complete · in flight"), per-state stage counts, and the raw
  trace as secondary technical evidence (expandable in the UI).
- `attention` — items derived from trace stage STATES (product copy, source
  stage kept as technical label): blocked/refused stages first, actionable
  items next (learning-consent decision pending; escalation with the Arena in
  flight; result awaiting validation; run in flight), info last. Stage detail
  strings surface VERBATIM where shown. No string-parsing of details for
  logic (state-driven only).
- `startActions` — recorded feed (enabled → Studio), live source (DISABLED
  with reason: no live-source seam exists in this build), resume current
  project (enabled → Studio).
- `learning` — the learning stage state + the scoped consent decision card
  (offered when the decision is genuinely open: learning stage pending).
- `runsAndOutputs` — the sample-run card (when the studio seam provides one)
  with its grade VERBATIM ("measured"/"fixture"/"declared"), plus the honest
  missing-seam note for the runs feed.

### 5.3 Home behaviors (React `HomeScreen.tsx`)

- Loads `host.readState()` on mount; loading skeleton, error card with a
  functional Retry, and empty states are designed (UI-20).
- "Start from a recorded feed" / "Resume" navigate through the shell port
  (typed refusals surface in the shell banner).
- The learning-consent card: scope checkboxes (the intent's declared learning
  scopes with product labels), Grant/Decline through `host.submitConsent`
  (the existing write path), outcome surfaced VERBATIM (granted artifact id
  or the typed refusal detail), state refreshed after the write.
- The sample-run card renders outputSummary + semanticEvidence + grade
  verbatim, with an "Open in Studio" action (shell navigation).
- Nothing on Home is a placeholder button: every action is functional or
  visibly disabled with its reason (the live-source action).

## 6. Tests (W11A-4) — named, REAL where the seam is real

- `packages/web/test/sportaProductContract.test.ts` — EXTENDED (never
  weakened): theme-value completeness over the 11 frozen tokens; the negative
  route lanes through the frozen validator AND the shell controller; the
  registration semantics (7 unique ids, closed vocabulary, nav order);
  URL-scheme parse negative lanes.
- `packages/web/test/sportaProductShell.test.ts` — the shell controller
  through the REAL frozen `SportaProductShellPort` contract: success/refusal
  lanes, focus validation, persistence round-trip (memory + URL), route
  restoration (valid, missing, unknown screen), registration check,
  subscribe/notify, lastRefusal semantics.
- `packages/web/test/sportaProductHome.test.ts` — `homeModel` fed by the REAL
  headless composition (`createSportaHost` with the labeled stand-in CLI +
  Stub arena role — the sportaHost.test.ts precedent: temp dir, real stores,
  clean teardown) at honest loop points, plus the labeled browser-fixture
  state; attention/consent/sample-run/empty-state derivations asserted.
- Evidence labels: the React render layer (`shell.tsx`, `controls.tsx`,
  `HomeScreen.tsx`) is BUILD-VERIFIED (`tsc -b packages/web`), the SportaPanel
  precedent — no browser harness run is claimed in this lane (Worker C owns
  journey coverage; the TL integration mounts this shell on /sporta first).

## 7. Boundary laws (restated for this lane)

- No ZCode UI components/theme/styles are imported; the product identity is
  Sporta's own (ADR binding requirement 1–3).
- Reads/writes through the EXISTING ports only (SCREEN-PORTS.md); missing
  seams go to NEXT DEPENDENCIES (the run-list seam).
- Additive-only: frozen contract names untouched; new public names appended;
  < 400 lines per src file; honest evidence labels; never fabricate success.
