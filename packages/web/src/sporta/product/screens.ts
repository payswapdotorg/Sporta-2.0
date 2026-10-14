/**
 * sporta-product screen-module types (W11A-2, SPEC.md §4.4) — what a
 * screen registers with the shell and the context it renders through.
 *
 * TYPE-ONLY module (erased at build): it exists so the shell and the
 * screen modules (Home here; Workers B/C's screens at TL integration)
 * share one import site with no runtime import cycle. Screens navigate
 * ONLY through the injected shell port — never the URL directly (the
 * port law). Screens read/write ONLY through the EXISTING host ports
 * injected here (the state-owner law, SCREEN-PORTS.md).
 */
import type { ReactNode } from "react";
import type { SportaScreenId, SportaScreenRoute, SportaVisualBreakpoint } from "./contract.js";
import type { SportaShellPortWithSubscription } from "./navigation.js";
import type { SportaHostPort } from "../hostPorts.js";
import type { TransformStudioHostPort } from "../studio/studioPorts.js";

/** What the shell hands every screen module on render. */
export interface SportaScreenContext {
  /** The current resolved route (focus carries the in-screen target). */
  readonly route: SportaScreenRoute;
  /** The shell port — the ONLY legal navigation path for a screen. */
  readonly shell: SportaShellPortWithSubscription;
  /** The EXISTING product host port (work/intent state + its write paths). */
  readonly host: SportaHostPort;
  /** The EXISTING studio host port when the mount provides one (optional). */
  readonly studio?: TransformStudioHostPort;
  /** The resolved visual breakpoint (desktop rail / mobile collapsing nav). */
  readonly breakpoint: SportaVisualBreakpoint;
}

/**
 * A screen module: what a screen registers with the shell. Screens not
 * yet implemented register NOTHING — the shell renders its honest
 * placeholder instead (it never fakes content).
 */
export interface SportaScreenModule {
  readonly screen: SportaScreenId;
  render(context: SportaScreenContext): ReactNode;
}
