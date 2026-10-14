/**
 * W11C screen registrations for the runs lane — the frozen
 * `SportaScreenRegistration` contract (compile-time; the shell wiring is
 * the TL/Worker-A integration at this base SHA).
 */
import type { SportaScreenRegistration } from "../product/contract.js";

/** "runs" — run history and per-run evidence. */
export const RUNS_SCREEN_REGISTRATION: SportaScreenRegistration = {
  id: "runs",
  navLabel: "Runs",
  purpose: "Inspect run history, per-step evidence and typed failures.",
};

export const RUNS_LANE_REGISTRATIONS: readonly SportaScreenRegistration[] = [
  RUNS_SCREEN_REGISTRATION,
];
