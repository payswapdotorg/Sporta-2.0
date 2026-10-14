/**
 * The studio screen registration + cross-screen link routes (PURE;
 * W11B).
 *
 * The studio registers as the `studio` screen through the TL-FROZEN
 * W11 product contracts (packages/web/src/sporta/product/contract.ts —
 * Worker A's shell registry consumes registrations; the studio NEVER
 * reimplements the shell). Cross-screen destinations are declared as
 * `SportaScreenRoute` values and validated FAIL-CLOSED with
 * `validateSportaScreenRoute` (screens never guess ids); navigation
 * itself always goes through the shell port — the studio never mutates
 * a URL (the shell owns route state).
 *
 * SCREEN EVIDENCE GRADE (UI-15): the studio projects its host evidence
 * onto `SportaScreenEvidenceGrade` verbatim — `real` stays `real`,
 * `fixture` stays `fixture`; nothing inflates.
 */
import {
  validateSportaScreenRoute,
  type SportaScreenEvidenceGrade,
  type SportaScreenRegistration,
  type SportaScreenRoute,
} from "../product/contract.js";
import type { StudioHostEvidence } from "./studioPorts.js";

/** The studio's screen registration (consumed by Worker A's registry). */
export const STUDIO_SCREEN_REGISTRATION: SportaScreenRegistration = {
  id: "studio",
  navLabel: "Studio",
  purpose:
    "The feed-to-output workbench: pick a source, inspect the pipeline graph, preview, launch with disclosure, and read the run evidence.",
};

/** One cross-screen destination (Worker C's first-class screens). */
export interface StudioLinkRoute {
  readonly route: SportaScreenRoute;
  readonly label: string;
  readonly purpose: string;
}

/**
 * The legacy Marketplace/Apps TAB destinations, reworked per the work
 * order: concise links pointing at Worker C's first-class screens —
 * no second marketplace/app authority lives here.
 */
export const STUDIO_LINK_ROUTES: readonly StudioLinkRoute[] = [
  {
    route: { screen: "marketplace" },
    label: "Open Marketplace",
    purpose: "Browse the full listing catalog and publisher details",
  },
  {
    route: { screen: "connected-apps" },
    label: "Open Connected Apps",
    purpose: "Grant scopes, audit actions, revoke access",
  },
  {
    route: { screen: "runs" },
    label: "Open Runs",
    purpose: "Run history, per-step evidence and typed failures",
  },
  {
    route: { screen: "library" },
    label: "Open Library",
    purpose: "Output assets, revisions and provenance lineage",
  },
];

/**
 * Fail-closed route check over every declared link (asserted by the
 * battery; the UI navigates only through this validated set).
 */
export function studioLinkRoutesValid(): boolean {
  return STUDIO_LINK_ROUTES.every((link) => validateSportaScreenRoute(link.route).ok);
}

/**
 * The screen-level evidence grade (UI-15): projected VERBATIM from the
 * host evidence. `real-local` is part of the screen vocabulary but has
 * no studio-host counterpart — a studio host is either the REAL
 * headless composition or the labeled FIXTURE browser host.
 */
export function studioEvidenceGrade(hostEvidence: StudioHostEvidence): SportaScreenEvidenceGrade {
  return hostEvidence;
}

/** The registration routes valid + the id is the frozen `studio` id. */
export function studioRegistrationValid(): boolean {
  return (
    STUDIO_SCREEN_REGISTRATION.id === "studio" &&
    STUDIO_SCREEN_REGISTRATION.navLabel.length > 0 &&
    STUDIO_SCREEN_REGISTRATION.purpose.length > 0 &&
    studioLinkRoutesValid()
  );
}
