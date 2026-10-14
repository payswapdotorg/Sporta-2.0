/**
 * sporta-product — W11 TL Wave 0 FREEZE: the route/screen + host-port
 * contracts shared by the W11 UI workers (TL-frozen; workers implement
 * BEHIND these names additively; semantic changes require an ADR).
 *
 * Source of truth: docs/work-orders/sporta-native-ui-work-orders.md,
 * docs/architecture/sporta-product-ui.md,
 * docs/testing/sporta-native-ui-acceptance.md (UI-01..UI-22).
 *
 * THE BOUNDARY LAW (W11): ZCode is internal runtime/workspace/tool
 * infrastructure ONLY. The /sporta route owns its product shell, theme,
 * navigation and screens. No ZCode Root, no ZCode navigation, no Zai
 * brand, no dependency on @zcode/ui/styles.css for the Sporta
 * presentation (the TL integration isolates the entrypoint).
 *
 * THE STATE-OWNER LAW (work orders, Wave 0 item 3): workers may NOT
 * invent a parallel state owner for marketplace, app attachments, runs,
 * artifact lineage, consent or execution — every screen reads/writes
 * through the EXISTING ports mapped in SCREEN-PORTS.md.
 */

/** The closed vocabulary of W11 product screens (UI-04). */
export type SportaScreenId =
  | "home"
  | "studio"
  | "marketplace"
  | "my-pipelines"
  | "runs"
  | "library"
  | "connected-apps";

/** Visual acceptance breakpoints (UI-16/UI-17: desktop 1440x900, mobile 390x844). */
export type SportaVisualBreakpoint = "desktop" | "mobile";

/** A resolved product route (URL/state restoration per UI-04). */
export interface SportaScreenRoute {
  readonly screen: SportaScreenId;
  /** Optional in-screen focus (e.g. a listing id, a run id). */
  readonly focus?: string;
}

/** Navigation result: typed refusal — never a silent no-op (UI-06 law). */
export interface SportaNavigationRefusal {
  readonly screen: SportaScreenId;
  readonly reason: string;
}

/** What each screen registers with the shell (Worker A's registry law). */
export interface SportaScreenRegistration {
  readonly id: SportaScreenId;
  /** Product navigation label (Sporta copy, never ZCode vocabulary). */
  readonly navLabel: string;
  /** One-line product purpose shown in nav/empty contexts. */
  readonly purpose: string;
}

/**
 * The product shell port (Worker A implements; the TL integration wires).
 * The shell OWNS navigation + route state restoration; screens never
 * mutate the URL directly.
 */
export interface SportaProductShellPort {
  /** Current resolved route (restorable from URL/state per UI-04). */
  currentRoute(): SportaScreenRoute;
  /** Navigate; a typed refusal carries the reason (UI-06). */
  navigate(route: SportaScreenRoute): Promise<{ ok: true } | { ok: false; refusal: SportaNavigationRefusal }>;
  /** The registered screens (nav order is the registration order). */
  registrations(): readonly SportaScreenRegistration[];
}

/**
 * The Sporta theme-token namespace law (UI-02/UI-03/UI-21): every visual
 * token the product uses is Sporta-owned and namespaced `--sporta-*`.
 * The typed record enumerates the token NAMES (the contract); values are
 * the theme's business (Worker A), never ZCode's.
 */
export interface SportaThemeTokens {
  readonly colorBg: "--sporta-color-bg";
  readonly colorFg: "--sporta-color-fg";
  readonly colorAccent: "--sporta-color-accent";
  readonly colorMuted: "--sporta-color-muted";
  readonly colorSurface: "--sporta-color-surface";
  readonly colorBorder: "--sporta-color-border";
  readonly radius: "--sporta-radius";
  readonly radiusSmall: "--sporta-radius-small";
  readonly fontBody: "--sporta-font-body";
  readonly fontHeading: "--sporta-font-heading";
  readonly spaceUnit: "--sporta-space-unit";
}

/** The single legal token namespace constant (asserted in tests). */
export const SPORTA_THEME_TOKENS: SportaThemeTokens = {
  colorBg: "--sporta-color-bg",
  colorFg: "--sporta-color-fg",
  colorAccent: "--sporta-color-accent",
  colorMuted: "--sporta-color-muted",
  colorSurface: "--sporta-color-surface",
  colorBorder: "--sporta-color-border",
  radius: "--sporta-radius",
  radiusSmall: "--sporta-radius-small",
  fontBody: "--sporta-font-body",
  fontHeading: "--sporta-font-heading",
  spaceUnit: "--sporta-space-unit",
};

/** Fail-closed route validation (screens never guess ids). */
export function validateSportaScreenRoute(
  route: SportaScreenRoute
): { ok: true } | { ok: false; reason: string } {
  const known: readonly SportaScreenId[] = [
    "home",
    "studio",
    "marketplace",
    "my-pipelines",
    "runs",
    "library",
    "connected-apps",
  ];
  if (!known.includes(route.screen)) {
    return { ok: false, reason: `unknown screen id "${String(route.screen)}" (closed vocabulary)` };
  }
  if (route.focus !== undefined && (typeof route.focus !== "string" || route.focus.length === 0)) {
    return { ok: false, reason: "focus, when present, must be a non-empty string" };
  }
  return { ok: true };
}

/**
 * Evidence-grade reporting at the point of use (UI-15): every screen
 * reports the grade of the data it shows — verbatim from the seams,
 * never inflated, fixture labeled as fixture.
 */
export type SportaScreenEvidenceGrade = "real" | "real-local" | "fixture";
