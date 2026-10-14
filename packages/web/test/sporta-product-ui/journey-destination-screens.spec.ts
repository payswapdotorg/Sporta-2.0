/**
 * W11C-2 journey — Worker C's five destination screens in a REAL
 * browser (chromium via @playwright/test), mounted through the lane
 * test harness (screens-harness.html, served by the same dev server).
 *
 * HONEST EVIDENCE CLASS (stated exactly): this is COMPONENT-LEVEL
 * browser evidence for the screens — the /sporta ROUTE journey (the
 * UI-16/17 route evidence) is journey-sporta-route.spec.ts. The screens'
 * route/shell integration is NEXT DEPENDENCIES (Worker A's shell is not
 * at the W11C base SHA). All data here is the labeled FIXTURE hosts.
 *
 * Covered per screen: browse/detail, creator filter + labeled demo
 * states, run detail with typed failure + evidence grade, library
 * revision lineage, app scopes/audit/revocation (fixture-labeled local
 * transition — the REAL revocation path is the node battery).
 */
import { expect, test } from "@playwright/test";

test.describe("W11C-2 journey: the five destination screens (test harness)", () => {
  test("marketplace detail → my-pipelines → runs → library → connected apps", async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });

    await page.goto("/test/sporta-product-ui/screens-harness.html");
    await expect(page).toHaveTitle(/W11C TEST HARNESS/u);
    await expect(page.getByTestId("harness-note")).toContainText("NOT the /sporta product route");

    // --- Marketplace: browse → detail with full disclosure fields ---
    const marketplace = page.locator("#w11c-marketplace");
    await expect(marketplace.getByRole("heading", { name: "Marketplace" })).toBeVisible();
    await expect(marketplace.getByText("BACKING: FIXTURE (browser demo)")).toBeVisible();
    await marketplace
      .getByRole("button", { name: /Fixture highlights trim \(marketplace demo\)/u })
      .click();
    await expect(marketplace.getByRole("heading", { name: "Fixture highlights trim (marketplace demo)" })).toBeVisible();
    await expect(marketplace.locator(".sporta-fact", { hasText: "Approved version" })).toContainText("1.0.0");
    await expect(marketplace.locator(".sporta-fact", { hasText: "Evidence grade" })).toContainText("FIXTURE");
    // Disabled action WITH its typed reason (the work-order law).
    await expect(marketplace.getByRole("button", { name: "Open in Studio" })).toBeDisabled();
    await expect(marketplace.getByText(/Open in Studio is disabled/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/screens-1-marketplace-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- My Pipelines: creator filter + honest state groups + demo labels ---
    const pipelines = page.locator("#w11c-my-pipelines");
    await expect(pipelines.getByRole("heading", { name: "My Pipelines" })).toBeVisible();
    await expect(pipelines.getByRole("heading", { name: "Released", exact: true })).toBeVisible();
    await expect(pipelines.getByRole("heading", { name: "Suspended", exact: true })).toBeVisible();
    await expect(pipelines.getByRole("heading", { name: "Draft", exact: true })).toBeVisible();
    await expect(pipelines.getByText("FIXTURE DEMO").first()).toBeVisible();
    await pipelines
      .getByRole("button", { name: /Fixture draft pipeline \(demo\)/u })
      .click();
    await expect(pipelines.getByText(/No approved version yet — drafts have no review decision/u)).toBeVisible();
    await expect(pipelines.getByRole("button", { name: "Submit for review" })).toBeDisabled();
    await expect(pipelines.getByText(/Submit for review is disabled/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/screens-2-my-pipelines-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- Runs: history + typed-failure evidence + disabled run control ---
    const runs = page.locator("#w11c-runs");
    await expect(runs.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
    await runs.getByRole("button", { name: /run:fixture-failure-1/u }).click();
    await expect(runs.getByText("Finished — typed failure").first()).toBeVisible();
    await expect(runs.getByText(/output-size envelope exceeded; nothing written/u)).toBeVisible();
    await expect(runs.getByRole("button", { name: "Retry run" })).toBeDisabled();
    await expect(runs.getByText(/Retry is disabled/u)).toBeVisible();
    // The success run row shows its honest state label too.
    await expect(runs.getByText("Finished — succeeded").first()).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/screens-3-runs-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- Library: immutable revision lineage + disabled export (reason) ---
    const library = page.locator("#w11c-library");
    await expect(library.getByRole("heading", { name: "Library" })).toBeVisible();
    await library.getByRole("button", { name: /art:fixture-project-1/u }).click();
    await expect(library.getByText(/rev:fixture-project-2 · HEAD/u)).toBeVisible();
    await expect(library.getByText(/parent rev:fixture-project-1/u)).toBeVisible();
    await expect(library.getByText(/fixture demo lineage — agent run seeded/u)).toBeVisible();
    await expect(library.getByRole("button", { name: "Export latest" })).toBeDisabled();
    await expect(library.getByText(/Export is disabled on the fixture host/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/screens-4-library-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // --- Connected Apps: scopes, learning consent, audit, REVOKE (fixture) ---
    const apps = page.locator("#w11c-apps");
    await expect(apps.getByRole("heading", { name: "Connected Apps" })).toBeVisible();
    await expect(apps.getByText(/granted: observe, control — expires/u)).toBeVisible();
    await expect(apps.getByText(/Learning consent: granted — scope app-highlights/u)).toBeVisible();
    await expect(apps.getByText(/^revoked at .*\(was: observe\)/u)).toBeVisible();
    await apps
      .getByRole("button", { name: /att:fixture-observe-1/u })
      .first()
      .click();
    await expect(apps.getByRole("button", { name: "Revoke access" })).toBeEnabled();
    await apps.getByRole("button", { name: "Revoke access" }).click();
    await expect(apps.getByText(/Revoked — attachment att:fixture-observe-1 revoked at/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/screens-5-apps-revoked-${testInfo.project.name}.png`,
      fullPage: false,
    });

    // Honest console/network review (the harness imports TSX through vite;
    // any transform error would surface here).
    expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
    expect(failedResponses, `failed responses: ${failedResponses.join(" | ")}`).toEqual([]);
  });
});
