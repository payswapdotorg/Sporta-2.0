# W14 — the REAL composition behind the desktop window (TL lane)

## Trigger

The W13 record's typed-future, unblocked by W12-D's landing: "Mounting the
headless REAL composition behind the desktop window is typed-future after
w12d lands." The operator's standing "continue with the rest of the
roadmap" (the W10/W11/W12 trigger phrase) + today's "continue" — the one
remaining implementable item on the board.

## Scope and lane type

TL-owned integration + packaging lane (the W12-D/W13 precedents: the
composition wiring and distribution/integration/serialization territory
is the TL's; no worker dispatch — the agent-generation drought persists,
the eca9637/c1db91e station-execution precedent). Delivered as a lane
branch `wave14/desktop-real-composition` → serial merge.

What the lane does: the Sporta desktop window is now backed by the REAL
headless composition running in the Electron main process —

- the **W12-D `createSportaProductComposition`** (the four REAL screen
  hosts: runs / library / my-pipelines / connected-apps);
- the **W10A `createOperatorStudioHostComposition`** (the REAL studio
  host with its own studioSeeds world — the Studio + Marketplace screens);
- the **demo seeds** (the studioSeeds precedent: fixture-labeled demo
  CONTENT driven through REAL lifecycles — a REAL deterministic trim run
  on real pipes with real FS blob writes, a REAL draft + submitted
  marketplace candidate pair, a REAL attached app the operator can
  revoke through the ONE write path);
- the **preload IPC bridge** (`sportaDesktopPorts`) + the typed
  renderer-side bridge (`desktopScreenBridge.ts`) — the browser bundle
  never carries Node code; in a plain browser the same bundle honestly
  falls back to the labeled fixture hosts.

## Files

- `packages/web/src/sporta/product/desktopComposition.ts` (NEW) — the
  desktop boot composition (one wiring point, honest per-leg seed facts).
- `packages/web/src/sporta/product/desktopScreenBridge.ts` (NEW) — the
  typed browser-safe bridge (type-only imports from the Node side).
- `packages/web/src/main.tsx` (additive) — the /sporta mount branch reads
  the bridge, injects `realScreenPorts` + the REAL studio host; absent or
  failing bridge = the fixture mount (labels carry).
- `packages/web/src/sporta/product/productComposition.ts` (additive) —
  optional `nodeExecutable` for the deterministic-filter child legs
  (default unchanged: `process.execPath`).
- `packages/web/src/sporta/studioComposition.ts` (additive) — the same
  optional `nodeExecutable`, threaded through
  `createOperatorStudioHostComposition`.
- `packages/web/test/sportaDesktopComposition.test.ts` (NEW, 7 tests).
- `packages/web/tsconfig.w14-scoped-check.json` (NEW, the W12-D scoped
  precedent).
- `apps/sporta-desktop/main.js` — the composition boot + the IPC channel
  map + the node wrapper + best-effort dispose.
- `apps/sporta-desktop/preload.js` — the `sportaDesktopPorts` bridge.
- `apps/sporta-desktop/scripts/build-desktop.sh` — the esbuild bundle
  step (`--banner` + `--define:import.meta.url` — the zcodeAgentRuntime
  adapter's top-level `import.meta.url` URL resolution law preserved via
  `__filename`).
- `apps/sporta-desktop/electron-builder.yml` — `composition/` packaged
  (verified inside `app.asar`).
- Version 1.0.0 → 1.1.0; README updated.

## The node-wrapper law (the packaged child-process legs)

The deterministic trim runs spawn an isolated child on real pipes with an
EMPTY env (the W12-A law: no host secrets, no network). The packaged app
has no `node` on PATH — but the Electron binary IS node under
`ELECTRON_RUN_AS_NODE=1`. The main process writes an absolute-path
`/bin/sh` wrapper into userData (set the flag, exec the binary — no PATH
needed) and passes it as the composition's `nodeExecutable`. The child
laws are unchanged: real pipes, real exit codes, empty env.

## Honest boundaries (typed-future, never silent)

- The **Home screen keeps its labeled fixture host** in every mount: the
  full `bootSportaLocal` host leg (ProductLoopProjection + the arena/CLI
  legs) cannot ship in the app (no zcode CLI, no arena server on the
  operator's desktop; faking either would violate the honesty law). The
  W13 record's boundary narrows to this one screen.
- The **run ledger + the in-memory stores** (candidates, decisions,
  descriptor/attachment/session/audit stores) are session-scoped
  fixture-grade in-memory (the lane gradeNotes carry verbatim — never
  re-badged); the FS blob store is durable on disk
  (`~/.config/Sporta/sporta-store`).
- The My Pipelines demo seeds ride the screen's default creator query
  (`publisher:fixture-market` — the W11C UI default) so the product opens
  populated; the records themselves are REAL lifecycle records.
- A composition boot failure degrades honestly: every channel rejects,
  the bridge probe fails, the mount falls back to the labeled fixture
  hosts — never a fake half-real state.

## TL gates (measured at the station — never trust reported numbers)

- arch **0/0/0** · surface **OK additive-only** (frozen counts intact).
- scoped `tsc -p tsconfig.w14-scoped-check.json` **exit 0**; the FULL
  web closure `tsc -b packages/web` **exit 0** (the dependency-warming
  discipline — the closed parked item, standing).
- Full battery **882/882 / 0 fail** (41.0s) · web suite **137/137 / 0
  fail** (the 7 new W14 tests, incl. the REAL child-process run through
  the bundled composition).
- lint **0 errors / 70 warnings — exact baseline** (the one new
  `no-useless-spread` warning fixed before the record).
- **lockfile + manifests byte-identical** (zero new dependencies: esbuild
  resolves from the workspace's existing vite toolchain; the desktop
  toolchain stays inside `apps/sporta-desktop`).
- File-size law OK: desktopComposition 260, desktopScreenBridge 132,
  the test 227, main.js 293, preload.js 49 (< 400).
- The **bundled composition** (esbuild, 207KB cjs) functionally verified
  standalone: runs=1 (succeeded steps), artifacts=2, pipelines=2, apps=1,
  studio listings=2, every seed leg "ok".

## E2E verification of the PACKAGED binary (deb-extracted, Xvfb + CDP)

- Window at `http://127.0.0.1:<port>/sporta`, title "Sporta — Home"; the
  composition booted in main (`node-wrapper.sh` + `sporta-store` created
  in userData).
- **Runs**: `BACKING: REAL` + the real run record —
  `pipe:desktop-demo v1.0.0`, work graph `wg:desktop-demo`, started/
  finished timestamps ~156ms apart (the REAL child-process execution),
  outputs 1, "Finished — succeeded".
- **Library**: `BACKING: REAL` + both real artifacts (the run's derived
  output + the editable `art:desktop-demo-board`).
- **My Pipelines**: `BACKING: REAL` + the real DRAFT and SUBMITTED
  records under the default creator.
- **Connected Apps**: `BACKING: REAL` + the real attachment; **the revoke
  write exercised E2E** (button → IPC → main-process host → service →
  honest `revoked at 2026-10-17T05:29:59.699Z` projected back).
- **Studio**: `REAL HOST`, `screen evidence: real`; the honest
  live-source empty state carries (the omitted optional seam).
- **Marketplace**: `BACKING: REAL` + the two studio-seeded listings
  (PUBLISHED + SUSPENDED).
- **Product-only guard exercised**: forced `window.location.href = <root>`
  bounced back to `/sporta` — the ZCode surface never rendered.
- Zero renderer page errors; independent vision-model review of the Runs
  screenshot confirms the SPORTA product UI with the REAL backing badge,
  no IDE chrome, no error dialogs. Station evidence:
  `w14-runs-real.png`, `w14-studio-real.png` (archived in the mission
  kit).

## Release

GitHub release `sporta-desktop-v1.1.0` (deb + AppImage + SHA256SUMS,
anonymously downloadable) — the install instructions in the README
(wget → sha256 → `sudo apt install ./…deb` / AppImage chmod+run).
