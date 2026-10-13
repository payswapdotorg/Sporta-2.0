/**
 * Launch-time pipeline selection (PURE — no react, no IO; W9C-8).
 *
 * The state machine the feed-launch picker walks: disclosure is shown
 * FIRST (P9-12 — publisher, approved version, terms/price, rights
 * prerequisites, dependencies, outputs, limitations, expectations,
 * evidence grade, review date, the fixed legal notice), the user
 * confirms explicitly, and only then does the host run the
 * fail-closed marketplace admission whose typed result (or typed
 * refusal) is surfaced verbatim. Live and prerecorded feeds share the
 * same machine; the feed kind is carried for disclosure only.
 */
import type {
  StudioDisclosureView,
  StudioLaunchAdmissionResult,
} from "./studioPorts.js";

/** The feed being launched (prerecorded or live — same contract). */
export type StudioFeedKind = "prerecorded" | "live";

export type StudioLaunchSelectionState =
  | {
      /** The disclosure stage: shown before any launch write happens. */
      stage: "disclosure";
      feedKind: StudioFeedKind;
      disclosure: StudioDisclosureView;
    }
  | {
      /** Awaiting the user's explicit confirmation (the launch gate). */
      stage: "awaiting-confirmation";
      feedKind: StudioFeedKind;
      disclosure: StudioDisclosureView;
    }
  | {
      /** The admission ran and admitted the pinned release. */
      stage: "admitted";
      feedKind: StudioFeedKind;
      releaseDigest: string;
      entitlementId: string;
    }
  | {
      /** The admission refused — the typed refusal is the surface. */
      stage: "refused";
      feedKind: StudioFeedKind;
      reason: string;
      detail: string;
    };

/** Begin selection: the disclosure is ALWAYS the first stage. */
export function beginLaunchSelection(input: {
  feedKind: StudioFeedKind;
  disclosure: StudioDisclosureView;
}): StudioLaunchSelectionState {
  return { stage: "disclosure", feedKind: input.feedKind, disclosure: input.disclosure };
}

/** The user asks to proceed: move to the explicit confirmation gate. */
export function requestLaunchConfirmation(
  state: StudioLaunchSelectionState,
): StudioLaunchSelectionState {
  if (state.stage !== "disclosure") return state;
  return {
    stage: "awaiting-confirmation",
    feedKind: state.feedKind,
    disclosure: state.disclosure,
  };
}

/** The user goes back to the disclosure (never past the gate). */
export function cancelLaunchConfirmation(
  state: StudioLaunchSelectionState,
): StudioLaunchSelectionState {
  if (state.stage !== "awaiting-confirmation") return state;
  return {
    stage: "disclosure",
    feedKind: state.feedKind,
    disclosure: state.disclosure,
  };
}

/**
 * The user confirms: only now does the admission result land. The
 * typed result maps onto the terminal stages verbatim — a refusal is
 * displayed with its frozen reason + detail, never paraphrased away.
 */
export function confirmLaunch(
  state: StudioLaunchSelectionState,
  admission: StudioLaunchAdmissionResult,
): StudioLaunchSelectionState {
  if (state.stage !== "awaiting-confirmation") return state;
  if (admission.admitted) {
    return {
      stage: "admitted",
      feedKind: state.feedKind,
      releaseDigest: admission.releaseDigest,
      entitlementId: admission.entitlementId,
    };
  }
  return {
    stage: "refused",
    feedKind: state.feedKind,
    reason: admission.reason,
    detail: admission.detail,
  };
}

/** Restart from a fresh disclosure (new launch attempt). */
export function restartLaunchSelection(input: {
  feedKind: StudioFeedKind;
  disclosure: StudioDisclosureView;
}): StudioLaunchSelectionState {
  return beginLaunchSelection(input);
}

/** Which launch stages a UI should disable the launch button in. */
export function launchButtonEnabled(state: StudioLaunchSelectionState): boolean {
  return state.stage === "awaiting-confirmation";
}
