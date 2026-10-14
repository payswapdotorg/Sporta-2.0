/**
 * sportaProductApp.test.ts — the W11 TL integration wiring law (node:test
 * + tsx, CSS-free per the project runner law: the root surfaces that
 * import .css stay BUILD-VERIFIED via `tsc -b packages/web`; their
 * rendered proof is the browser journey lane).
 *
 * What this proves: the seven closed screen registrations EXACTLY match
 * the union of the lane registration constants (Home/Studio from Wave 0 +
 * the W11C lane constants), in NAV ORDER — the shell's closed vocabulary
 * and the mounted set agree, so the integration mounts every screen the
 * vocabulary promises and nothing it doesn't.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORTA_PRODUCT_SCREENS } from "../src/sporta/product/navigation.js";
import { createSportaProductShell } from "../src/sporta/product/navigation.js";
import { MARKETPLACE_LANE_REGISTRATIONS } from "../src/sporta/marketplace/registrations.js";
import { RUNS_LANE_REGISTRATIONS } from "../src/sporta/runs/registrations.js";
import { LIBRARY_LANE_REGISTRATIONS } from "../src/sporta/library/registrations.js";
import { APPS_LANE_REGISTRATIONS } from "../src/sporta/apps/registrations.js";
import type { SportaScreenId } from "../src/sporta/product/contract.js";

test("the closed vocabulary equals Wave 0 (home+studio) + the W11C lane registrations, in nav order", async () => {
  const laneIds = [
    ...MARKETPLACE_LANE_REGISTRATIONS,
    ...RUNS_LANE_REGISTRATIONS,
    ...LIBRARY_LANE_REGISTRATIONS,
    ...APPS_LANE_REGISTRATIONS,
  ].map((registration) => registration.id);
  const waveZeroIds: SportaScreenId[] = ["home", "studio"];
  const expected = [...waveZeroIds, ...laneIds];
  const actual = SPORTA_PRODUCT_SCREENS.map((registration) => registration.id);
  assert.deepEqual(actual, expected, "the closed set is exactly the lanes' union in nav order");
  assert.equal(actual.length, 7, "seven closed screens");
});

test("every closed screen navigates through the shell port (the wiring target)", async () => {
  const shell = createSportaProductShell();
  for (const registration of SPORTA_PRODUCT_SCREENS) {
    const verdict = await shell.navigate({ screen: registration.id });
    assert.ok(verdict.ok, `${registration.id} must be navigable in the shell`);
    assert.equal(shell.currentRoute().screen, registration.id);
  }
  const refused = await shell.navigate({ screen: "no-such-screen" as SportaScreenId });
  assert.ok(!refused.ok, "unknown screens are refused");
  assert.equal(
    shell.currentRoute().screen,
    "connected-apps",
    "route unchanged on refusal (the last navigated screen stands)",
  );
});

test("nav labels carry product copy only (no ZCode/runtime jargon)", async () => {
  for (const registration of SPORTA_PRODUCT_SCREENS) {
    assert.ok(!/zcode|zai\b/i.test(registration.navLabel), `${registration.navLabel} must stay Sporta vocabulary`);
    assert.ok(registration.purpose.length > 0, `${registration.id} carries a purpose`);
  }
});
