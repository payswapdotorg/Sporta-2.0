/**
 * W11A-2 shell/navigation tests — the shell controller through the REAL
 * frozen `SportaProductShellPort` contract (node:test + tsx — the
 * project law; no new framework, no browser harness).
 *
 * EVIDENCE CLASS: REAL contract tests — the controller, the URL-scheme
 * parse/serialize pair and the persistence seam run for real in-process
 * (pure logic; no fixtures, no stores). The React render layer
 * (shell.tsx) is BUILD-VERIFIED via tsc -b (the SportaPanel precedent).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SportaProductShellPort, SportaScreenRoute } from "../src/sporta/product/contract.js";
import {
  createBrowserRoutePersistence,
  createMemoryRoutePersistence,
  createSportaProductShell,
  SPORTA_PRODUCT_SCREENS,
  sportaRouteToPath,
  type SportaShellPortWithSubscription,
} from "../src/sporta/product/navigation.js";

test("W11A shell: a fresh shell starts at Home and never guesses a screen", () => {
  const shell = createSportaProductShell({
    persistence: createMemoryRoutePersistence(null),
  });
  assert.deepEqual(shell.currentRoute(), { screen: "home" });
  assert.equal(shell.lastRefusal(), null);
  assert.equal(shell.restoredFromInvalidScreen(), null);
});

test("W11A shell: successful navigation commits, persists and notifies subscribers", async () => {
  const persistence = createMemoryRoutePersistence(null);
  const shell = createSportaProductShell({ persistence });
  const seen: SportaScreenRoute[] = [];
  const unsubscribe = shell.subscribe((route) => seen.push(route));

  const result = await shell.navigate({ screen: "studio" });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(shell.currentRoute(), { screen: "studio" });
  assert.deepEqual(persistence.read()?.route, { screen: "studio" }, "the route persisted");
  assert.equal(seen.length, 1, "subscribers notified once");
  assert.deepEqual(seen[0], { screen: "studio" });
  assert.equal(shell.lastRefusal(), null);

  unsubscribe();
  await shell.navigate({ screen: "runs" });
  assert.equal(seen.length, 1, "an unsubscribed listener hears nothing more");
});

test("W11A shell: navigation with focus round-trips the focus through persistence", async () => {
  const persistence = createMemoryRoutePersistence(null);
  const shell = createSportaProductShell({ persistence });
  const result = await shell.navigate({ screen: "runs", focus: "run:abc" });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(shell.currentRoute(), { screen: "runs", focus: "run:abc" });
  assert.deepEqual(persistence.read()?.route, { screen: "runs", focus: "run:abc" });
});

test("W11A shell: an empty focus is a typed refusal (the frozen validation, verbatim)", async () => {
  const shell = createSportaProductShell({ persistence: createMemoryRoutePersistence(null) });
  await shell.navigate({ screen: "runs" });
  const result = await shell.navigate({ screen: "runs", focus: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.refusal.reason, /focus, when present, must be a non-empty string/);
    assert.deepEqual(shell.lastRefusal(), result.refusal);
  }
  // Fail-closed: the route is unchanged and subscribers still heard the attempt.
  assert.deepEqual(shell.currentRoute(), { screen: "runs" });
});

test("W11A shell: a refusal does not mutate the route; the next success clears it", async () => {
  const shell = createSportaProductShell({ persistence: createMemoryRoutePersistence(null) });
  await shell.navigate({ screen: "library" });
  const refused = await shell.navigate({ screen: "nope" as SportaScreenRoute["screen"] });
  assert.equal(refused.ok, false);
  assert.deepEqual(shell.currentRoute(), { screen: "library" });

  const recovered = await shell.navigate({ screen: "marketplace" });
  assert.deepEqual(recovered, { ok: true });
  assert.equal(shell.lastRefusal(), null, "a successful navigation clears the refusal banner");
});

test("W11A shell: route restoration returns the persisted screen (UI-04)", () => {
  const shell = createSportaProductShell({
    persistence: createMemoryRoutePersistence({ route: { screen: "connected-apps" }, invalidScreen: null }),
  });
  assert.deepEqual(shell.currentRoute(), { screen: "connected-apps" });
  assert.equal(shell.lastRefusal(), null);
});

test("W11A shell: restoring an UNKNOWN screen falls back to Home with a typed refusal banner", () => {
  const shell = createSportaProductShell({
    persistence: createMemoryRoutePersistence({
      route: { screen: "home" },
      invalidScreen: "definitely-not-a-screen",
    }),
  });
  assert.deepEqual(shell.currentRoute(), { screen: "home" });
  assert.equal(shell.restoredFromInvalidScreen(), "definitely-not-a-screen");
  const refusal = shell.lastRefusal();
  assert.ok(refusal !== null);
  assert.match(refusal.reason, /unknown screen "definitely-not-a-screen"/);
  assert.match(refusal.reason, /restored to Home/);
});

test("W11A shell: registrations default to the canonical 7 in nav order", () => {
  const shell: SportaProductShellPort = createSportaProductShell({
    persistence: createMemoryRoutePersistence(null),
  });
  assert.deepEqual(
    shell.registrations().map((registration) => registration.id),
    SPORTA_PRODUCT_SCREENS.map((registration) => registration.id),
  );
});

test("W11A shell: the browser persistence guard falls back to memory outside a browser", () => {
  assert.equal(typeof globalThis.window, "undefined", "these tests run headless");
  const persistence = createBrowserRoutePersistence();
  assert.equal(persistence.read(), null, "nothing restored outside a browser");
  persistence.write({ screen: "studio" });
  assert.deepEqual(persistence.read()?.route, { screen: "studio" });
});

test("W11A shell: the serialized path form is canonical (no /cn prefix, focus encoded)", () => {
  assert.equal(sportaRouteToPath({ screen: "home" }), "/sporta/home");
  assert.equal(sportaRouteToPath({ screen: "my-pipelines" }), "/sporta/my-pipelines");
  assert.equal(sportaRouteToPath({ screen: "runs", focus: "r 1" }), "/sporta/runs?focus=r%201");
});

test("W11A shell: the frozen port type is satisfied by the controller (compile-time law)", () => {
  const shell: SportaShellPortWithSubscription = createSportaProductShell({
    persistence: createMemoryRoutePersistence(null),
  });
  // The frozen three-method surface + the additive subscription surface.
  const port: SportaProductShellPort = shell;
  assert.equal(typeof port.currentRoute, "function");
  assert.equal(typeof port.navigate, "function");
  assert.equal(typeof port.registrations, "function");
  assert.equal(typeof shell.subscribe, "function");
  assert.equal(typeof shell.lastRefusal, "function");
});
