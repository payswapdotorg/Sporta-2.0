# W13 — TL record: the Sporta product desktop distribution (Ubuntu)

**Directive:** operator request, 2026-10-16 — "Make sure there's a downloadable
desktop app my local agent can install on my Ubuntu desktop. The app should be
the product we're building and not zcode."

**Lane type:** TL-owned packaging/distribution lane (no product-source change;
TL-serialization law — root-adjacent packaging, artifact build, release
publishing are TL integration territory). No worker dispatch (the lane adds
zero product source; the platform drought record stands for the w12d lane).

## WORK ITEMS

- `apps/sporta-desktop/` — a NEW standalone Electron packaging lane for the
  SPORTA product (deliberately OUTSIDE the pnpm workspace globs so the daily
  workspace install, lockfile and every station gate are untouched):
  - `main.js` — the Electron main: a loopback-only static server over the
    staged product bundle + one window hard-locked to the product route
    (`/sporta`). The PRODUCT-ONLY guard: `will-navigate` blocks every
    non-product internal route (bounce-back to `/sporta`) and sends external
    URLs to the system browser — the ZCode surface (workspace IDE / auth /
    share routes of the same SPA) is unreachable by construction.
  - `preload.js` — minimal sandboxed contextBridge (app facts only).
  - `electron-builder.yml` — Sporta branding (appId `org.sporta.desktop`,
    productName `Sporta`, `/opt/Sporta`, `StartupWMClass=Sporta`), deb +
    AppImage targets for linux x64.
  - `icons/icon.png` — the Sporta mark (brand tokens `#0c1210`/`#2fe089`,
    the wordmark's rounded-square + inset-ring + media play), rasterized
    exactly from SVG at 512px.
  - `scripts/build-desktop.sh` — the release build: product web bundle
    (`packages/web` vite build) → stage → electron-builder → artifacts.
  - `README.md` — install instructions for a local agent (wget + sha256 +
    `sudo apt install ./sporta-desktop_1.0.0_amd64.deb`, or AppImage).
- Robustness fix baked into `main.js`: `disable-dev-shm-usage` (the GPU
  process death-loop in low-/dev/shm environments — no-op on real desktops).

## CHANGED FILES

- `apps/sporta-desktop/{package.json,package-lock.json,main.js,preload.js,electron-builder.yml,icons/icon.png,scripts/build-desktop.sh,README.md,.gitignore}` (new, 9 files; no existing file modified — `git status` at the merge tree shows zero modifications outside the new directory).
- Zero TS/TSX changes; zero workspace-manifest changes; `pnpm-lock.yaml` byte-identical.

## TESTS

Station re-measured six-gate battery on the lane tree (never trust, re-measure):

| gate | result |
| --- | --- |
| architecture check | 0 violations / 0 baseline / 0 new |
| sporta surface check | OK — 67 frozen names intact (6+31+16+14), growth additive-only |
| scoped tsc (`tsc -b packages/web`) | exit 0 |
| full battery (`tsx --test packages/sporta-*/test/**`) | 882/882, 0 fail |
| web suite (`tsx --test packages/web/test/**`) | 125/125, 0 fail |
| lint (oxlint, repo-wide) | 0 errors / 70 warnings — exact baseline |
| lock | `pnpm-lock.yaml` identical |
| file-size law | main.js 190 lines < 400 |

## REAL EVIDENCE

- Artifacts built at the station from the lane tree:
  `sporta-desktop_1.0.0_amd64.deb` (118,992,996 bytes) and
  `sporta-desktop-1.0.0-x86_64.AppImage` (150,345,992 bytes).
- `.deb` verified structurally: `dpkg -c/-x` — `/opt/Sporta/sporta-desktop`
  + `resources/renderer/` (the staged product bundle: index.html, assets,
  material-icons, pdfjs), `usr/share/applications/Sporta.desktop`
  (`Name=Sporta`, `StartupWMClass=Sporta`, `Icon=sporta-desktop`).
- **E2E launch verification of the PACKAGED binary** (the deb-extracted
  `/opt/Sporta/sporta-desktop` under Xvfb, CDP on a debug port):
  - window loads `http://127.0.0.1:<port>/sporta`, title `Sporta — Home`;
  - every product screen navigated and verified by title:
    `Sporta — Studio`, `— Transform Marketplace`, `— My Pipelines`,
    `— Runs`, `— Library`, `— Connected Apps`;
  - **product-only guard exercised**: forcing `window.location.href` to the
    SPA root (the ZCode surface route) bounced the window back to `/sporta`
    (`Sporta — Home`) — the ZCode surface never rendered;
  - zero page errors in the renderer console;
  - independent vision-model review of the 1440x900 screenshot confirms the
    SPORTA product shell (wordmark, sports-media-production copy, product
    nav, Home cards) with no IDE/developer chrome and no error dialogs
    (evidence: station screenshot `sporta-desktop-verified.png`).

## FIXTURE EVIDENCE

- The desktop app renders the product's browser demo hosts — REAL domain
  code with honestly-labeled fixture demo data (the same honesty law as the
  web product's `/sporta` browser surface; nothing is faked as
  production-live). The app is the product's demo/distribution surface, not
  a claim of production-live backing.

## CONTRACT CHANGES

- None. No frozen surface touched; no workspace manifest changed; the
  desktop lane is additive-only and outside the workspace.

## SECURITY

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`; the renderer loads loopback-only content; external
  navigation is denied in-app and delegated to the system browser; the
  static server 404s every non-product route (no SPA fallback).
- No secrets, tokens or credentials in the app or bundle (the web bundle's
  baked constants are the repo's public link constants, same as the web
  product).

## PERFORMANCE

- Bundle: 146MB staged renderer (the web product bundle incl.
  material-icons + pdfjs); packaged app 119MB (.deb) / 150MB (AppImage).
- App startup to product shell: < 10s on the station's constrained runner.

## RISKS

- Ubuntu 20.04+ x64 glibc assumed (the standard electron-builder linux-x64
  baseline); arm64 not packaged yet (typed-future).
- The deb icon path uses the hicolor theme; minimal images without
  `libgtk-3-0` need the documented one-line install.

## BLOCKERS

- None.

## DEVIATIONS

- The app mounts the product's browser demo hosts (fixture-labeled) rather
  than a headless `bootSportaLocal` REAL-FS composition — the W12 TL
  integration (w12d, in flight) owns the headless REAL composition seams;
  wiring the desktop app onto that composition is typed-future follow-up
  (`apps/sporta-desktop/README.md` documents this honestly).

## NEXT DEPENDENCIES

- w12d (the W12 TL integration — productComposition + app wiring) proceeds
  independently; when it lands, a desktop follow-up can mount the REAL
  headless composition behind the same window.
- Release channel: `sporta-desktop-v1.0.0` tag + GitHub release with the two
  artifacts + SHA256SUMS (the downloadable for the operator's local agent).
