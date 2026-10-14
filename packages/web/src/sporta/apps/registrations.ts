/**
 * W11C screen registrations for the apps lane — the frozen
 * `SportaScreenRegistration` contract (compile-time; the shell wiring is
 * the TL/Worker-A integration at this base SHA).
 */
import type { SportaScreenRegistration } from "../product/contract.js";

/** "connected-apps" — attached applications, scopes, audit, revocation. */
export const CONNECTED_APPS_SCREEN_REGISTRATION: SportaScreenRegistration = {
  id: "connected-apps",
  navLabel: "Connected Apps",
  purpose: "Inspect attached apps, granted scopes, audit effects and revoke access.",
};

export const APPS_LANE_REGISTRATIONS: readonly SportaScreenRegistration[] = [
  CONNECTED_APPS_SCREEN_REGISTRATION,
];
