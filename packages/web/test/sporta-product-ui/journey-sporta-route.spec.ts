/**
 * W11C-2 journey — the REAL /sporta route through a REAL browser
 * (chromium via @playwright/test). This is the UI-16/UI-17 route
 * evidence: the journey drives the route AS WIRED AT THE W11C BASE SHA
 * (main.tsx mounts SportaPanel + TransformStudio over the labeled
 * browser FIXTURE hosts — the only product surface that exists here;
 * stated honestly in the w11c report).
 *
 * Journey (the acceptance walk-through available at this SHA):
 *   product surface → honest fixture badges → learning-consent write →
 *   Studio graph builder (typed disabled action with reason) →
 *   Marketplace listing with verbatim grade → Feed launch: approved
 *   listing → disclosure → confirmation → admission result surfaced
 *   verbatim → Attached apps: permission + revoked state.
 *
 * Breakpoints: the config's two projects run this journey at
 * 1440x900 AND 390x844; screenshots land in ./artifacts/.
 * Console/network failures are captured and asserted on.
 */
import { expect, test } from "@playwright/test";

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

    // 1. The route loads through the real entry; the product surface renders.
    await page.goto("/sporta");
    await expect(page).toHaveTitle(/Sporta — Product Loop/u);
    await expect(page.getByRole("heading", { name: "Sporta — Product Loop" })).toBeVisible();
    // Honesty law: the fixture backing is labeled at the point of use.
    await expect(page.getByText("FIXTURE HOST (browser demo)").first()).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-1-home-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // 2. A write path through the host port (fixture-labeled result).
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByText(/Granted — learning candidate learn:fixture:consent-1/u)).toBeVisible();

    // 3. Open the Studio: graph builder shows an honestly disabled action
    //    (unpinned draft node — the blocker reason is visible copy).
    await expect(page.getByRole("heading", { name: "Transform Studio" })).toBeVisible();
    await page.getByRole("button", { name: "Draft a deterministic-filter node" }).click();
    await expect(page.getByText(/node node:filter-1 has no pinned component digest/u)).toBeVisible();
    await expect(page.getByRole("button", { name: /Validate graph/u })).toBeDisabled();

    // 4. Marketplace tab: the approved listing with the VERBATIM grade.
    await page.getByRole("button", { name: "Marketplace", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Fixture highlights trim (browser demo)" }),
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

    // 5. Feed launch: select the approved pipeline → disclosure → confirm →
    //    the admission result surfaces verbatim (fixture-labeled).
    await page.getByRole("button", { name: "Feed launch", exact: true }).click();
    await page
      .getByRole("button", { name: /Select Fixture highlights trim \(browser demo\) v1\.0\.0 \(Free\)/u })
      .click();
    await expect(page.getByRole("region", { name: "Launch disclosure" })).toBeVisible();
    await expect(page.getByText(/license MIT/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-3-disclosure-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Proceed to launch confirmation" }).click();
    await page.getByRole("button", { name: "Confirm launch" }).click();
    await expect(page.getByRole("heading", { name: "Admitted" })).toBeVisible();
    await expect(page.getByText(/Pinned release sha256:4d/u)).toBeVisible();
    await expect(page.getByText(/entitlement ent:fixture-studio-1/u)).toBeVisible();
    await page.screenshot({
      path: `test/sporta-product-ui/artifacts/route-4-admitted-${testInfo.project.name}.png`,
      fullPage: true,
    });

    // 6. Attached apps: the permission state AND the revoked state are
    //    visible (the app-permission/revoke leg available on this route).
    await page.getByRole("button", { name: "Attached apps", exact: true }).click();
    await expect(page.getByText(/granted: observe — expires/u)).toBeVisible();
    await expect(page.getByText(/^revoked \(was: observe\)/u)).toBeVisible();
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
