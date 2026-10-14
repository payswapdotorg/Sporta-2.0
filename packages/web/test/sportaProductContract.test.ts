/**
 * W11 freeze tests — the product-UI contract surface (TL Wave 0).
 *
 * Freeze law: the screen vocabulary is closed, routes validate fail-closed,
 * the theme-token namespace is Sporta-owned and exhaustive, and the
 * boundary law's vocabulary is enforced at the type level.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPORTA_THEME_TOKENS,
  validateSportaScreenRoute,
  type SportaScreenId,
  type SportaScreenRoute,
} from "../src/sporta/product/contract.js";

const KNOWN_SCREENS: readonly SportaScreenId[] = [
  "home",
  "studio",
  "marketplace",
  "my-pipelines",
  "runs",
  "library",
  "connected-apps",
];

test("W11 freeze: every known screen id routes valid", () => {
  for (const screen of KNOWN_SCREENS) {
    const route: SportaScreenRoute = { screen };
    const result = validateSportaScreenRoute(route);
    assert.equal(result.ok, true, `screen ${screen} must route`);
  }
});

test("W11 freeze: unknown screen ids refuse fail-closed (closed vocabulary)", () => {
  const bad = { screen: "settings" as unknown as SportaScreenId };
  const result = validateSportaScreenRoute(bad);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /closed vocabulary/);
});

test("W11 freeze: empty focus refuses; valid focus passes", () => {
  const empty = validateSportaScreenRoute({ screen: "runs", focus: "" });
  assert.equal(empty.ok, false);
  const valid = validateSportaScreenRoute({ screen: "runs", focus: "run-42" });
  assert.equal(valid.ok, true);
});

test("W11 freeze: the theme-token namespace is Sporta-owned and exhaustive", () => {
  const tokens = Object.values(SPORTA_THEME_TOKENS) as string[];
  assert.equal(tokens.length, 11);
  for (const token of tokens) {
    assert.match(token, /^--sporta-/, `token ${token} must live in the --sporta-* namespace`);
  }
  // no duplicates
  assert.equal(new Set(tokens).size, tokens.length);
});

test("W11 freeze: the token names never reference the ZCode namespace", () => {
  const tokens = Object.values(SPORTA_THEME_TOKENS) as string[];
  for (const token of tokens) {
    assert.doesNotMatch(token, /zcode|zai/i, `token ${token} must not carry ZCode/Zai vocabulary`);
  }
});
