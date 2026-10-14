/**
 * sporta-product navigation (W11A-2, SPEC.md §4) — the pure navigation
 * model: the canonical screen registrations, the /sporta/<screen>?focus=
 * URL scheme (parse + serialize, fail-closed), the route-persistence
 * seam, and the shell controller implementing the FROZEN
 * `SportaProductShellPort` (contract.ts) BEHIND the frozen names with
 * additive subscribe/lastRefusal surface.
 *
 * PURE module (no React, no CSS, no DOM at import time) — node-testable
 * through the REAL frozen contract. The shell OWNS navigation + route
 * state; screens never mutate the URL directly (the port law).
 */
import type {
  SportaNavigationRefusal,
  SportaProductShellPort,
  SportaScreenId,
  SportaScreenRegistration,
  SportaScreenRoute,
} from "./contract.js";
import { validateSportaScreenRoute } from "./contract.js";

/**
 * The canonical 7 product screens in NAV ORDER (the registration order
 * IS the nav order — the frozen shell-port law). Product copy only:
 * Sporta vocabulary (Feed, Pipeline, Run, Output…), never ZCode or
 * runtime jargon (the product-copy conventions).
 */
export const SPORTA_PRODUCT_SCREENS: readonly SportaScreenRegistration[] = [
  {
    id: "home",
    navLabel: "Home",
    purpose: "Start from a feed, resume work, and see what needs attention.",
  },
  {
    id: "studio",
    navLabel: "Studio",
    purpose: "Choose a source, build a pipeline, preview, and run it.",
  },
  {
    id: "marketplace",
    navLabel: "Transform Marketplace",
    purpose: "Browse approved pipelines with terms, rights, and evidence.",
  },
  {
    id: "my-pipelines",
    navLabel: "My Pipelines",
    purpose: "Draft, submit, and manage your pipeline releases.",
  },
  {
    id: "runs",
    navLabel: "Runs",
    purpose: "Track run progress, evidence, and typed outcomes.",
  },
  {
    id: "library",
    navLabel: "Library",
    purpose: "Manage output assets with provenance and lineage.",
  },
  {
    id: "connected-apps",
    navLabel: "Connected Apps",
    purpose: "Attach apps and control their capability scopes.",
  },
];

/** The URL path prefix the scheme serializes (parse also accepts /cn/sporta). */
const SPORTA_PATH_PREFIX = "/sporta";

/**
 * Serialize a route to its canonical URL path form:
 * `/sporta/<screen>` + optional `?focus=<id>` (SPEC.md §4.2).
 */
export function sportaRouteToPath(route: SportaScreenRoute): string {
  const focus = route.focus === undefined ? "" : `?focus=${encodeURIComponent(route.focus)}`;
  return `${SPORTA_PATH_PREFIX}/${route.screen}${focus}`;
}

/** The result of parsing a location into a route (fail-closed). */
export interface SportaLocationParse {
  /** The resolved route (home when no screen segment or when invalid). */
  readonly route: SportaScreenRoute;
  /** The raw screen segment when it was NOT a known screen id (honest flag). */
  readonly invalidScreen: string | null;
  /** The raw non-empty focus value when present. */
  readonly focus: string | null;
}

/**
 * Parse a pathname + search into a route, fail-closed (SPEC.md §4.2):
 * no screen segment → home; an unknown screen segment → home with the
 * invalidScreen flag (the shell surfaces a typed refusal — never a
 * guess, never a crash); focus is taken only when non-empty. Every
 * candidate screen id passes through the FROZEN validateSportaScreenRoute.
 */
export function parseSportaLocation(pathname: string, search: string): SportaLocationParse {
  // Tolerate a full path (query/hash attached): only the path part routes.
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? pathname;
  const normalized = pathOnly.length > 1 && pathOnly.endsWith("/") ? pathOnly.slice(0, -1) : pathOnly;
  const match = /^\/(?:cn\/)?sporta(?:\/([^/?#]+))?$/.exec(normalized);
  if (match === null) {
    return { route: { screen: "home" }, invalidScreen: null, focus: null };
  }
  const segment = match[1] ?? undefined;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const focusParam = params.get("focus");
  const focus = focusParam !== null && focusParam.length > 0 ? focusParam : null;
  if (segment === undefined) {
    return { route: { screen: "home" }, invalidScreen: null, focus };
  }
  const candidate: SportaScreenRoute = {
    screen: segment as SportaScreenId,
    ...(focus === null ? {} : { focus }),
  };
  const verdict = validateSportaScreenRoute(candidate);
  if (!verdict.ok) {
    return { route: { screen: "home" }, invalidScreen: segment, focus };
  }
  return { route: candidate, invalidScreen: null, focus };
}

/** What a persistence adapter restores (route + the honest invalid flag). */
export interface SportaRestoredRoute {
  readonly route: SportaScreenRoute;
  /** The raw unknown screen segment when restoration fell back to Home. */
  readonly invalidScreen: string | null;
}

/** Route persistence seam (URL by default; injectable for tests). */
export interface SportaRoutePersistence {
  read(): SportaRestoredRoute | null;
  write(route: SportaScreenRoute): void;
}

/**
 * Browser persistence: /sporta/<screen>?focus= via the History API —
 * a reload restores the current screen (UI-04). Browser-guarded: outside
 * a browser (tests/SSR) it behaves as the memory adapter (nothing read).
 */
export function createBrowserRoutePersistence(): SportaRoutePersistence {
  if (typeof window === "undefined" || typeof window.history === "undefined") {
    return createMemoryRoutePersistence(null);
  }
  return {
    read() {
      return parseSportaLocation(window.location.pathname, window.location.search);
    },
    write(route: SportaScreenRoute): void {
      const path = sportaRouteToPath(route);
      if (window.location.pathname + window.location.search !== path) {
        window.history.pushState({}, "", path);
      }
    },
  };
}

/** Memory persistence (tests, non-browser mounts, headless drives). */
export function createMemoryRoutePersistence(
  initial: SportaRestoredRoute | null,
): SportaRoutePersistence {
  let current: SportaRestoredRoute | null = initial;
  return {
    read: () => current,
    write(route: SportaScreenRoute): void {
      current = { route, invalidScreen: null };
    },
  };
}

/** A route-change listener (additive surface behind the frozen port). */
export type SportaRouteListener = (route: SportaScreenRoute) => void;

/** The frozen port + the additive subscription/refusal surface. */
export interface SportaShellPortWithSubscription extends SportaProductShellPort {
  /** Subscribe to route notifications (fired after every navigate attempt). */
  subscribe(listener: SportaRouteListener): () => void;
  /** The last typed refusal (for the honest banner); null after a success. */
  lastRefusal(): SportaNavigationRefusal | null;
  /** The invalid screen restored at creation, if any (typed banner data). */
  restoredFromInvalidScreen(): string | null;
}

/** Options for the shell controller. */
export interface SportaProductShellOptions {
  /** Persistence seam (default: the browser URL adapter). */
  readonly persistence?: SportaRoutePersistence;
  /** Registrations (default: the canonical 7 screens, nav order). */
  readonly registrations?: readonly SportaScreenRegistration[];
}

/**
 * The shell controller — implements the FROZEN SportaProductShellPort
 * fail-closed (SPEC.md §4.3): (1) the frozen route validation (unknown
 * screen ids and empty focus are typed refusals, never guesses); (2) the
 * closed registration check; (3) only then commit + persist + notify.
 * Refusals never mutate the route. A restored invalid screen is surfaced
 * as a creation-time typed refusal (banner data), never a guess.
 */
export function createSportaProductShell(
  options: SportaProductShellOptions = {},
): SportaShellPortWithSubscription {
  const registrations = options.registrations ?? SPORTA_PRODUCT_SCREENS;
  const persistence = options.persistence ?? createBrowserRoutePersistence();
  const listeners = new Set<SportaRouteListener>();

  const restored = persistence.read();
  let route: SportaScreenRoute = restored?.route ?? { screen: "home" };
  let restoredInvalid: string | null = restored?.invalidScreen ?? null;
  let refusal: SportaNavigationRefusal | null =
    restoredInvalid === null
      ? null
      : {
          screen: "home",
          reason: `unknown screen "${restoredInvalid}" — restored to Home (closed vocabulary)`,
        };
  if (restored === null) {
    // Nothing persisted: start at Home (never a guessed screen).
    persistence.write(route);
  }

  const shell: SportaShellPortWithSubscription = {
    currentRoute(): SportaScreenRoute {
      return { ...route };
    },
    async navigate(
      target: SportaScreenRoute,
    ): Promise<{ ok: true } | { ok: false; refusal: SportaNavigationRefusal }> {
      const verdict = validateSportaScreenRoute(target);
      if (!verdict.ok) {
        refusal = { screen: target.screen, reason: verdict.reason };
        for (const listener of listeners) listener(shell.currentRoute());
        return { ok: false, refusal };
      }
      const registered = registrations.some((registration) => registration.id === target.screen);
      if (!registered) {
        refusal = {
          screen: target.screen,
          reason: `screen "${target.screen}" is not registered in this shell`,
        };
        for (const listener of listeners) listener(shell.currentRoute());
        return { ok: false, refusal };
      }
      route = { ...target };
      refusal = null;
      restoredInvalid = null;
      persistence.write(route);
      for (const listener of listeners) listener(shell.currentRoute());
      return { ok: true };
    },
    registrations(): readonly SportaScreenRegistration[] {
      return registrations;
    },
    subscribe(listener: SportaRouteListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastRefusal(): SportaNavigationRefusal | null {
      return refusal;
    },
    restoredFromInvalidScreen(): string | null {
      return restoredInvalid;
    },
  };
  return shell;
}
