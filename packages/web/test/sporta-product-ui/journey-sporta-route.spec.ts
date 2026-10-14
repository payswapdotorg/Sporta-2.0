/**
 * W11C-2 journey — the REAL /sporta route through a REAL browser
 * (chromium via @playwright/test). This is the UI-16/UI-17 route
 * evidence AT THE W11 INTEGRATION: main.tsx mounts SportaProductApp —
 * the W11A shell with ALL SEVEN screens (Home, the W11B studio
 * workbench, and the W11C destination screens) — over the labeled
 * browser FIXTURE hosts.
 *
 * Journey (the acceptance walk-through at the integration SHA):
 *   product shell (Home) → honest evidence labels → learning-consent
 *   write through Home → Studio workbench (typed disabled action with
 *   reason) → Marketplace listing with verbatim grade + the honest
 *   review-null → Studio launch: approved listing → disclosure →
 *   confirmation → admission result surfaced verbatim → Connected
 *   Apps: granted + revoked states + learning-consent line.
 *
 * Breakpoints: the config's two projects run this journey at
 * 1440x900 AND 390x844 (the mobile collapsing nav is exercised by the
 * openScreen helper); screenshots land in ./artifacts/.
 * Console/network failures are captured and asserted on.
 */
import { expect, test, type Page } from "@playwright/test";

/** Navigate through the shell nav — opening the mobile menu when needed. */
async function openScreen(page: Page, name: string) {
  const target = page.getByRole("button", { name, exact: true });
  if (!(await target.isVisible())) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  }
  await target.click();
}

test.describe("W11C-2 journey: the REAL /sporta route", () => {
  test("product surface → studio → marketplace listing → launch admission → apps state", async ({
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

    // 1. The route loads the INTEGRATED product shell at Home: the nav
    //    carries all seven closed screens; Home renders through the host
    //    port with its evidence label VERBATIM.
    await page.goto("/sporta");
    await expect(page).toHaveTitle(/Sporta — Home/u);
    // The shell chrome on BOTH breakpoints: the desktop nav rail OR the
    // mobile collapsing topbar's Menu toggle (the nav mounts on open).
    const navRail = page.getByRole("navigation", { name: "Product sections" });
    const menuToggle = page.getByRole("button", { name: "Menu", exact: true });
    await expect(navRail.or(menuToggle)).toBeVisible();
    await expect(page.getByRole("region", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start from a recorded feed" })).toBeVisible();
    // Honesty law: the evidence grade is labeled at the point of use (the
    // chip carries the grade verbatim — DOM lowercase, CSS-uppercased).
    await expect(page.locator('.sporta-chip[data-grade="fixture"]').first()).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-1-home-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // 2. A write path through the host port on the Home surface: the
    //    scoped learning-consent decision (typed outcome verbatim).
    await page.getByRole("button", { name: "Allow selected" }).click();
    await expect(page.getByText(/Allowed — learn:fixture:consent-1/u)).toBeVisible();

    // 3. Studio through the shell nav: the W11B workbench shows an
    //    honestly disabled action (unpinned draft node — reason is copy).
    await openScreen(page, "Studio");
    await expect(page).toHaveTitle(/Sporta — Studio/u);
    await expect(page.getByRole("region", { name: "Transform Studio workbench" })).toBeVisible();
    await page.getByRole("button", { name: "Draft a filter node" }).click();
    await expect(page.getByText(/node node:filter-1 has no pinned component digest/u)).toBeVisible();
    await expect(page.getByRole("button", { name: "Validate graph" })).toBeDisabled();

    // 4. Marketplace through the shell nav — over the REAL studio seam
    //    reads (the listing title/grade flow from the studio host).
    await openScreen(page, "Transform Marketplace");
    await expect(page).toHaveTitle(/Sporta — Transform Marketplace/u);
    await expect(page.getByRole("region", { name: "Transform Marketplace" })).toBeVisible();
    await page.getByRole("button", { name: /Fixture highlights trim \(browser demo\)/u }).click();
    await expect(
      page.getByRole("heading", { name: /Fixture highlights trim \(browser demo\)/u }),
    ).toBeVisible();
    await expect(page.getByText(/grade FIXTURE/u).first()).toBeVisible();
    // HONEST FINDING (w11c report): the W10A-2 browser fixture host keys
    // review snapshots by LISTING id while the port signature passes a
    // PIPELINE id — so the route's review panel honestly renders the null
    // read ("No review decision recorded") instead of inventing a review.
    await expect(page.getByText(/No review decision recorded\./u).first()).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-2-marketplace-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // 5. Feed launch in the studio workbench: select the recorded source
    //    and the approved pipeline → disclosure → confirm → the admission
    //    result surfaces verbatim (fixture-labeled).
    await openScreen(page, "Studio");
    await page
      .locator(".studio-source", { hasText: "Recorded sample feed" })
      .getByRole("button", { name: /^Select$/ })
      .click();
    await page.getByRole("button", { name: /Fixture highlights trim/u }).first().click();
    await page.getByRole("button", { name: "Open launch disclosure" }).click();
    await expect(
      page.getByRole("region", { name: "Launch disclosure", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/license MIT/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-3-disclosure-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Proceed to launch confirmation" }).click();
    await page.getByRole("button", { name: "Confirm launch" }).click();
    await expect(page.getByRole("heading", { name: "Admitted" }).first()).toBeVisible();
    await expect(page.getByText(/Pinned release sha256:4d/u)).toBeVisible();
    await expect(page.getByText(/entitlement ent:fixture-studio-1/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-4-admitted-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // 6. Connected Apps through the shell nav: the granted state AND the
    //    revoked state are visible, with the learning-consent line.
    await openScreen(page, "Connected Apps");
    await expect(page.getByText(/granted: observe, control — expires/u)).toBeVisible();
    await expect(page.getByText(/^revoked at .*\(was: observe\)/u)).toBeVisible();
    await expect(page.getByText(/Learning consent: granted — scope app-highlights/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-5-apps-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // 7. Honest console/network review (recorded AND asserted; the TL
    //    re-runs this gate at the station).
    expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
    expect(failedResponses, `failed responses: ${failedResponses.join(" | ")}`).toEqual([]);
  });
});
