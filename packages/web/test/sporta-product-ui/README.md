# sporta-product-ui — W11C browser-journey evidence (Worker C lane)

Worker C's Playwright lane (W11 work orders, "Worker C — … and browser evidence").
`@playwright/test` is the Wave-0-frozen web dev-dependency; this lane adds NO
manifest/lockfile changes.

## What lives here

| File | Role |
|---|---|
| `playwright.config.ts` | Lane config: boots the REAL `packages/web` vite dev server (port 5199) and runs every journey at BOTH acceptance breakpoints (`desktop-1440x900`, `mobile-390x844`). |
| `journey-sporta-route.spec.ts` | **The route journey (UI-16/UI-17 evidence):** drives the REAL `/sporta` route as wired at the w11c base SHA — product surface → consent write → Studio (honest disabled action) → Marketplace listing with verbatim grade → Feed launch → disclosure → confirmation → admission surfaced verbatim → Attached apps permission + revoked state. Console/network failures captured and asserted. |
| `journey-destination-screens.spec.ts` | The five Worker-C destination screens in a real browser through `screens-harness.html` — **component-level browser evidence, honestly labeled** (the screens' route/shell integration is Worker A/TL; recorded in the w11c report's NEXT DEPENDENCIES). |
| `screens-harness.html` | TEST-ONLY page (this lane's test root) that mounts the five screens over their labeled FIXTURE hosts. NOT the product route; the page itself says so. |
| `artifacts/` | Committed screenshot evidence (one per journey step × breakpoint) + Playwright failure artifacts (`test-results/`, git-ignorable noise). |

## Run

```bash
cd packages/web
corepack pnpm exec playwright test --config test/sporta-product-ui/playwright.config.ts
```

The web server boots automatically (or set `reuseExistingServer` by just having
`vite` running). Chromium must be installed for the resolved Playwright
(`corepack pnpm exec playwright install chromium`).

## Honesty notes for reviewers

- The route journey exercises the ONLY product surface that exists at the w11c
  base SHA (SportaPanel + TransformStudio over labeled browser FIXTURE hosts).
  Every fixture value is labeled at the point of use; the admission result, the
  grade labels and the typed refusals are the fixture hosts' verbatim outputs.
- The harness journey is real-browser interaction with Worker C's screens, but
  it is NOT route evidence — do not relabel it as such (work orders, item 6).
- The REAL (headless) counterparts for every fixture path here are proven in
  `packages/web/test/sportaScreens.test.ts` (node:test + tsx).
