/**
 * W11 freeze tests — the product-UI contract surface (TL Wave 0).
 *
 * Freeze law: the screen vocabulary is closed, routes validate fail-closed,
 * the theme-token namespace is Sporta-owned and exhaustive, and the
 * boundary law's vocabulary is enforced at the type level.
 *
 * W11A additions (Worker A, additive-only — the freeze tests above are
 * never weakened): theme-VALUE completeness over the frozen token names,
 * the canonical registration semantics (7 unique ids, closed vocabulary,
 * nav order = registration order), the fail-closed navigation lanes
 * through the shell controller BEHIND the frozen port, and the
 * /sporta/<screen> URL-scheme parse lanes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPORTA_THEME_TOKENS,
  validateSportaScreenRoute,
  type SportaScreenId,
  type SportaScreenRoute,
} from "../src/sporta/product/contract.js";
import { SPORTA_THEME_VALUES, sportaThemeDeclarations } from "../src/sporta/product/theme.js";
import {
  createSportaProductShell,
  createMemoryRoutePersistence,
  parseSportaLocation,
  SPORTA_PRODUCT_SCREENS,
  sportaRouteToPath,
} from "../src/sporta/product/navigation.js";

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

// ---- W11A additive lanes (SPEC.md §6; the freeze tests above stay intact) ----

test("W11A: every frozen token name carries exactly one non-empty Sporta theme value", () => {
  const names = Object.values(SPORTA_THEME_TOKENS) as string[];
  const valueKeys = Object.keys(SPORTA_THEME_VALUES);
  assert.equal(valueKeys.length, names.length, "one value per frozen token key");
  for (const key of valueKeys) {
    const value = SPORTA_THEME_VALUES[key as keyof typeof SPORTA_THEME_VALUES];
    assert.ok(typeof value === "string" && value.length > 0, `token ${key} needs a value`);
  }
  const declarations = sportaThemeDeclarations();
  for (const name of names) {
    assert.ok(
      declarations.includes(`${name}:`),
      `the declarations string carries ${name}`,
    );
  }
});

test("W11A: the theme values never reference the ZCode namespace", () => {
  for (const value of Object.values(SPORTA_THEME_VALUES)) {
    assert.doesNotMatch(value, /zcode|zai/i, `value "${value}" must not carry ZCode/Zai vocabulary`);
  }
});

test("W11A: the canonical registrations are the 7 closed screens in nav order", () => {
  assert.equal(SPORTA_PRODUCT_SCREENS.length, 7);
  assert.deepEqual(
    SPORTA_PRODUCT_SCREENS.map((registration) => registration.id),
    ["home", "studio", "marketplace", "my-pipelines", "runs", "library", "connected-apps"],
  );
  for (const registration of SPORTA_PRODUCT_SCREENS) {
    assert.ok(registration.navLabel.length > 0, `${registration.id} needs a nav label`);
    assert.ok(registration.purpose.length > 0, `${registration.id} needs a purpose`);
    assert.doesNotMatch(
      `${registration.navLabel} ${registration.purpose}`,
      /zcode|zai/i,
      `${registration.id} copy must not carry ZCode/Zai vocabulary`,
    );
  }
});

test("W11A: navigating an unknown screen id through the shell is a typed refusal, never a guess", async () => {
  const shell = createSportaProductShell({
    persistence: createMemoryRoutePersistence(null),
  });
  const result = await shell.navigate({ screen: "settings" as unknown as SportaScreenId });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.refusal.screen, "settings");
    assert.match(result.refusal.reason, /closed vocabulary/);
  }
  // Fail-closed: the route never moved off Home.
  assert.deepEqual(shell.currentRoute(), { screen: "home" });
});

test("W11A: an unregistered (but valid) screen id refuses typed through the closed registration check", async () => {
  const shell = createSportaProductShell({
    persistence: createMemoryRoutePersistence(null),
    registrations: [SPORTA_PRODUCT_SCREENS[0]!], // Home only
  });
  const result = await shell.navigate({ screen: "studio" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.refusal.screen, "studio");
    assert.match(result.refusal.reason, /not registered/);
  }
  assert.deepEqual(shell.currentRoute(), { screen: "home" });
});

test("W11A: the URL scheme parses fail-closed (unknown screen -> Home + invalid flag)", () => {
  const invalid = parseSportaLocation("/sporta/definitely-not-a-screen", "");
  assert.deepEqual(invalid.route, { screen: "home" });
  assert.equal(invalid.invalidScreen, "definitely-not-a-screen");

  const bare = parseSportaLocation("/sporta", "");
  assert.deepEqual(bare.route, { screen: "home" });
  assert.equal(bare.invalidScreen, null);

  const localized = parseSportaLocation("/cn/sporta/runs", "");
  assert.deepEqual(localized.route, { screen: "runs" });
  assert.equal(localized.invalidScreen, null);

  const focused = parseSportaLocation("/sporta/library", "?focus=art:1");
  assert.deepEqual(focused.route, { screen: "library", focus: "art:1" });
});

test("W11A: the URL scheme round-trips every registered screen (+ focus)", () => {
  for (const registration of SPORTA_PRODUCT_SCREENS) {
    const route: SportaScreenRoute = { screen: registration.id };
    assert.equal(parseSportaLocation(sportaRouteToPath(route), "").route.screen, registration.id);
  }
  const focused: SportaScreenRoute = { screen: "runs", focus: "run 42/details" };
  const [path, query = ""] = sportaRouteToPath(focused).split("?");
  const reparsed = parseSportaLocation(path, `?${query}`);
  assert.deepEqual(reparsed.route, focused);
  // A query attached to the pathname is tolerated (path part only routes).
  assert.deepEqual(parseSportaLocation(sportaRouteToPath(focused), "").route, {
    screen: "runs",
  });
});
