/**
 * LaunchTab — pipeline selection at prerecorded/live feed launch
 * (W9C-8): the disclosure gate, the explicit confirmation, and the
 * fail-closed admission result surfaced verbatim.
 *
 * BUILD-VERIFIED/UNTESTED (the SportaPanel honesty law): compiled by
 * `pnpm exec tsc -b packages/web`; the pure state machine it consumes
 * is battery-tested (app-environments test/studioViews.test.ts).
 */
import { useCallback, useEffect, useState } from "react";
import type { StudioListingView, TransformStudioHostPort } from "./studioPorts.js";
import { gradeLabel, priceLine, projectDisclosure } from "./marketplaceViews.js";
import {
  beginLaunchSelection,
  cancelLaunchConfirmation,
  confirmLaunch,
  launchButtonEnabled,
  requestLaunchConfirmation,
  type StudioLaunchSelectionState,
} from "./launchSelection.js";

export function LaunchTab({
  host,
  onError,
}: {
  host: TransformStudioHostPort;
  onError: (message: string | null) => void;
}) {
  const [listings, setListings] = useState<readonly StudioListingView[] | null>(null);
  const [selection, setSelection] = useState<StudioLaunchSelectionState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const raw = await host.listListings();
        if (!disposed) setListings(raw.filter((listing) => listing.status === "PUBLISHED"));
      } catch (cause) {
        if (!disposed) onError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [host, onError]);

  const begin = useCallback(
    async (listingId: string) => {
      setBusy(true);
      try {
        const disclosure = await host.readLaunchDisclosure(listingId);
        setSelection(
          beginLaunchSelection({
            feedKind: "prerecorded",
            disclosure: projectDisclosure(disclosure),
          }),
        );
        onError(null);
      } catch (cause) {
        onError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [host, onError],
  );

  const confirm = useCallback(async () => {
    if (selection === null || selection.stage !== "awaiting-confirmation") return;
    setBusy(true);
    try {
      const admission = await host.selectForLaunch(selection.disclosure.listingId);
      setSelection(confirmLaunch(selection, admission));
      onError(null);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [selection, host, onError]);

  if (listings === null) {
    return <p className="studio-loading">Loading launchable pipelines…</p>;
  }
  return (
    <section className="studio-section" aria-label="Feed launch pipeline selection">
      <h2>Feed launch</h2>
      <p className="studio-hint">
        Choose an approved pipeline for a prerecorded or live feed. The disclosure below is
        shown before launch; the admission result is surfaced verbatim.
      </p>
      <ul className="studio-launch-options">
        {listings.map((listing) => (
          <li key={listing.listingId}>
            <button
              type="button"
              className="studio-button studio-button-secondary"
              disabled={busy}
              onClick={() => void begin(listing.listingId)}
            >
              Select {listing.title} v{listing.approvedVersion} ({priceLine(listing.offer)})
            </button>
          </li>
        ))}
        {listings.length === 0 ? (
          <li className="studio-empty">No published listings to launch.</li>
        ) : null}
      </ul>
      {selection !== null ? (
        <LaunchSelectionView
          state={selection}
          busy={busy}
          onConfirm={() => void confirm()}
          onRequestConfirmation={() => setSelection(requestLaunchConfirmation(selection))}
          onCancel={() => setSelection(cancelLaunchConfirmation(selection))}
        />
      ) : null}
    </section>
  );
}

function LaunchSelectionView({
  state,
  busy,
  onConfirm,
  onRequestConfirmation,
  onCancel,
}: {
  state: StudioLaunchSelectionState;
  busy: boolean;
  onConfirm: () => void;
  onRequestConfirmation: () => void;
  onCancel: () => void;
}) {
  if (state.stage === "disclosure" || state.stage === "awaiting-confirmation") {
    const disclosure = state.disclosure;
    return (
      <div className="studio-disclosure" role="region" aria-label="Launch disclosure">
        <h3>
          Launch disclosure — {disclosure.publisher} v{disclosure.approvedVersion}
        </h3>
        <p>
          Release {disclosure.releaseDigest.slice(0, 19)}… · reviewed{" "}
          {disclosure.reviewedAt} · grade {gradeLabel(disclosure.evidenceGrade)}
        </p>
        <p>
          Terms: {priceLine(disclosure.terms)} · license {disclosure.terms.termsLicense}
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
          Expectations: ~{disclosure.latencyExpectations.typicalLatencyMs}ms ·{" "}
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
            <button
              type="button"
              className="studio-button studio-button-secondary"
              onClick={onCancel}
            >
              Back to disclosure
            </button>
          </div>
        )}
      </div>
    );
  }
  if (state.stage === "admitted") {
    return (
      <div className="studio-admission studio-admission-ok" role="status">
        <h3>Admitted</h3>
        <p>
          Pinned release {state.releaseDigest.slice(0, 19)}… under entitlement{" "}
          {state.entitlementId} — the run pins this exact approved digest.
        </p>
      </div>
    );
  }
  return (
    <div className="studio-admission studio-admission-refused" role="alert">
      <h3>Refused — {state.reason}</h3>
      <p>{state.detail}</p>
    </div>
  );
}
