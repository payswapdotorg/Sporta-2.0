/**
 * sporta-product — the Sporta theme values (W11A-1, SPEC.md §2).
 *
 * The 11 FROZEN token names live in contract.ts (SPORTA_THEME_TOKENS —
 * TL Wave 0 freeze). This module gives them Sporta-owned VALUES: a
 * coherent sports-media production identity — "a broadcast control room
 * under floodlights": deep green-tinted charcoal, a match-day volt-green
 * accent, condensed sporty headings, generous radii. Clearly NOT a code
 * IDE, NOT the ZCode brand, NOT a debug dashboard, and free of any ZCode
 * theme class or external UI framework dependency (the boundary law).
 *
 * PURE module (no React, no CSS import, no DOM requirement at import
 * time) so the theme completeness is node-testable; theme.css declares
 * the SAME values scoped to `.sporta-app` for the browser bundle.
 */
import { SPORTA_THEME_TOKENS, type SportaThemeTokens, type SportaVisualBreakpoint } from "./contract.js";

/**
 * The value per frozen token name — exactly one value for each of the 11
 * `--sporta-*` tokens (completeness is asserted by the contract tests).
 */
export const SPORTA_THEME_VALUES: Readonly<Record<keyof SportaThemeTokens, string>> = {
  colorBg: "#0c1210", // deep floodlit-arena charcoal (green-tinted, not IDE black)
  colorFg: "#edf3ee", // soft broadcast white
  colorAccent: "#2fe089", // match-day volt green
  colorMuted: "#93a89c", // sage grey-green for secondary text
  colorSurface: "#141c17", // raised control-room surface
  colorBorder: "#27352c", // turf-line border
  radius: "14px",
  radiusSmall: "8px",
  fontBody: '"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif',
  fontHeading:
    '"DIN Alternate", "Franklin Gothic Medium", "Avenir Next Condensed", "Segoe UI", system-ui, sans-serif',
  spaceUnit: "8px",
};

/** The `--sporta-*: value;` declaration list (one per frozen token). */
export function sportaThemeDeclarations(): string {
  return (Object.keys(SPORTA_THEME_VALUES) as readonly (keyof SportaThemeTokens)[])
    .map((key) => `${SPORTA_THEME_TOKENS[key]}:${SPORTA_THEME_VALUES[key]};`)
    .join("");
}

/** Set the 11 `--sporta-*` custom properties on an element (scoped theming). */
export function applySportaTheme(element: HTMLElement | SVGElement): void {
  for (const key of Object.keys(SPORTA_THEME_VALUES) as readonly (keyof SportaThemeTokens)[]) {
    element.style.setProperty(SPORTA_THEME_TOKENS[key], SPORTA_THEME_VALUES[key]);
  }
}

/**
 * The single visual breakpoint (UI-16/UI-17: desktop 1440x900, mobile
 * 390x844 — one cut, desktop at >= 1024px so both acceptance targets
 * land squarely on their intended side).
 */
export const SPORTA_DESKTOP_MIN_WIDTH = 1024;

/** Resolve the visual breakpoint for a viewport width (pure, testable). */
export function resolveSportaBreakpoint(width: number): SportaVisualBreakpoint {
  return width >= SPORTA_DESKTOP_MIN_WIDTH ? "desktop" : "mobile";
}
