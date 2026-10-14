/**
 * W11C Playwright config — the Worker-C lane harness (packages/web/test/
 * sporta-product-ui). The Wave-0 decision serialized @playwright/test as
 * a WEB dev-dependency (already in packages/web/package.json — this lane
 * touches no manifest/lockfile); the config lives in the test root.
 *
 * What it boots: the REAL packages/web vite dev server (the REAL
 * /sporta route entry at this base SHA) on port 5199.
 *
 * Breakpoints (UI-16/UI-17): desktop 1440x900 and mobile 390x844 — one
 * project each; every journey runs at BOTH and saves its screenshots to
 * ./artifacts/ (committed evidence).
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB_ROOT = resolve(HERE, "..", "..");
const PORT = 5199;

export default defineConfig({
  testDir: HERE,
  outputDir: resolve(HERE, "artifacts", "test-results"),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  webServer: {
    command: `corepack pnpm exec vite --port ${PORT} --strictPort --host 127.0.0.1`,
    cwd: WEB_ROOT,
    url: `http://127.0.0.1:${PORT}/sporta`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "desktop-1440x900",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-390x844",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
});
