/**
 * LaunchPanel — the Launch-stage context (W11B-2): the P9-12
 * disclosure shown BEFORE launch, the explicit confirmation gate, and
 * the fail-closed admission result surfaced VERBATIM. The flow state
 * machine is the EXISTING launchSelection.ts (W9C, battery-tested) —
 * this panel is its W11 presentation: no second ladder, no softened
 * refusal, no fabricated success.
 */
import type { StudioDisclosureView } from "./studioPorts.js";
import { gradeLabel, priceLine } from "./marketplaceViews.js";
import {
  launchButtonEnabled,
  type StudioLaunchSelectionState,
} from "./launchSelection.js";

function DisclosureView({
  state,
  busy,
  onRequestConfirmation,
  onConfirm,
  onCancel,
}: {
  state: StudioLaunchSelectionState & { stage: "disclosure" | "awaiting-confirmation" };
  busy: boolean;
  onRequestConfirmation: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const disclosure: StudioDisclosureView = state.disclosure;
  return (
    <div className="studio-disclosure" role="region" aria-label="Launch disclosure">
      <h4>
        Launch disclosure — {disclosure.publisher} v{disclosure.approvedVersion}
      </h4>
      <p className="studio-disclosure-meta">
        Feed: {state.feedKind} · release {disclosure.releaseDigest.slice(0, 19)}… · reviewed{" "}
        {disclosure.reviewedAt} · grade {gradeLabel(disclosure.evidenceGrade)}
      </p>
      <p>
        Terms: {priceLine(disclosure.terms)} · license {disclosure.terms.termsLicense}
        {disclosure.cost !== null
          ? ` · cost ${String(disclosure.cost.amount)} ${disclosure.cost.currency}`
          : ""}
      </p>
      <p>Outputs: {disclosure.outputs.join(", ")}</p>
      <p>
        Limitations:{" "}
        {disclosure.limitations.length > 0 ? disclosure.limitations.join("; ") : "none declared"}
      </p>
      <p>
        Rights prerequisites:{" "}
        {disclosure.rightsPrerequisites.length > 0
          ? disclosure.rightsPrerequisites.join("; ")
          : "none declared"}
      </p>
      <p>
        Dependencies:{" "}
        {disclosure.dependencies
          .map((dependency) => `${dependency.name} (${dependency.kind}, ${dependency.license})`)
          .join(", ") || "none"}
      </p>
      <p>
        Expectations: ~{String(disclosure.latencyExpectations.typicalLatencyMs)}ms ·{" "}
        {disclosure.latencyExpectations.declaredThroughput} · grade{" "}
        {gradeLabel(disclosure.latencyExpectations.evidenceGrade)}
      </p>
      <p className="studio-legal">{disclosure.legalNotice}</p>
      {state.stage === "disclosure" ? (
        <button type="button" className="studio-button" onClick={onRequestConfirmation}>
          Proceed to launch confirmation
        </button>
      ) : (
        <div className="studio-confirmation">
          <button
            type="button"
            className="studio-button"
            disabled={busy || !launchButtonEnabled(state)}
            onClick={onConfirm}
          >
            {busy ? "Admitting…" : "Confirm launch"}
          </button>
          <button type="button" className="studio-button studio-button-secondary" onClick={onCancel}>
            Back to disclosure
          </button>
        </div>
      )}
    </div>
  );
}

export function LaunchPanel({
  selection,
  busy,
  loadError,
  canBegin,
  onBegin,
  onRequestConfirmation,
  onConfirm,
  onCancel,
}: {
  selection: StudioLaunchSelectionState | null;
  busy: boolean;
  loadError: string | null;
  canBegin: boolean;
  onBegin: () => void;
  onRequestConfirmation: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="studio-context-card" aria-label="Launch disclosure and confirmation">
      <h3>Launch</h3>
      {loadError !== null ? (
        <p className="studio-refusal" role="alert">
          Disclosure failed to load: {loadError}
        </p>
      ) : null}
      {selection === null ? (
        <div>
          <p className="studio-empty">
            The disclosure is always shown before launch — rights, terms, dependencies,
            expectations and the legal notice first, then your explicit confirmation.
          </p>
          <button type="button" className="studio-button" disabled={!canBegin || busy} onClick={onBegin}>
            {busy ? "Loading disclosure…" : "Open launch disclosure"}
          </button>
        </div>
      ) : selection.stage === "disclosure" || selection.stage === "awaiting-confirmation" ? (
        <DisclosureView
          state={selection}
          busy={busy}
          onRequestConfirmation={onRequestConfirmation}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : selection.stage === "admitted" ? (
        <div className="studio-admission studio-admission-ok" role="status">
          <h4>Admitted</h4>
          <p>
            Pinned release {selection.releaseDigest.slice(0, 19)}… under entitlement{" "}
            {selection.entitlementId} — the run pins this exact approved digest.
          </p>
        </div>
      ) : (
        <div className="studio-admission studio-admission-refused" role="alert">
          <h4>Refused — {selection.reason}</h4>
          <p>{selection.detail}</p>
        </div>
      )}
    </section>
  );
}
