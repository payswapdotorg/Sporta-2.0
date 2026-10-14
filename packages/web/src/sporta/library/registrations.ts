/**
 * W11C screen registrations for the library lane — the frozen
 * `SportaScreenRegistration` contract (compile-time; the shell wiring is
 * the TL/Worker-A integration at this base SHA).
 */
import type { SportaScreenRegistration } from "../product/contract.js";

/** "library" — output assets, editable projects and lineage. */
export const LIBRARY_SCREEN_REGISTRATION: SportaScreenRegistration = {
  id: "library",
  navLabel: "Library",
  purpose: "Browse output artifacts, revision history and source lineage.",
};

export const LIBRARY_LANE_REGISTRATIONS: readonly SportaScreenRegistration[] = [
  LIBRARY_SCREEN_REGISTRATION,
];
