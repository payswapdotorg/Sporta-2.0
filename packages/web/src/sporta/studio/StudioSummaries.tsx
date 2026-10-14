/**
 * StudioSummaries — the legacy Marketplace/Apps TABS reworked (W11B-2)
 * into concise summaries that point at Worker C's first-class
 * `marketplace` and `connected-apps` screens. The summaries read the
 * SAME data the flow already loaded (listListings / listAppAttachments
 * projections) — no parallel marketplace/app state, no second
 * authority; the full catalogs live in Worker C's screens.
 */
import { permissionSummary } from "./appAttachmentViews.js";
import type { StudioAppAttachmentView, StudioListingView } from "./studioPorts.js";

export function MarketplaceSummary({
  listings,
  onOpenMarketplace,
}: {
  listings: readonly StudioListingView[];
  onOpenMarketplace: () => void;
}) {
  const published = listings.filter((listing) => listing.status === "PUBLISHED");
  const suspended = listings.filter((listing) => listing.status !== "PUBLISHED");
  return (
    <section className="studio-context-card" aria-label="Marketplace summary">
      <h3>Marketplace</h3>
      <p className="studio-hint">
        {String(published.length)} published pipeline(s)
        {suspended.length > 0 ? `, ${String(suspended.length)} suspended (shown honestly, not selectable)` : ""}{" "}
        — the full catalog with publisher details and terms lives in the Marketplace.
      </p>
      <ul className="studio-mini-list">
        {published.slice(0, 3).map((listing) => (
          <li key={listing.listingId}>
            {listing.title} v{listing.approvedVersion}
          </li>
        ))}
        {published.length > 3 ? <li>… and {String(published.length - 3)} more in the Marketplace</li> : null}
      </ul>
      <button type="button" className="studio-link" onClick={onOpenMarketplace}>
        Open Marketplace
        <span className="studio-link-purpose">browse approved pipelines, publishers, terms</span>
      </button>
    </section>
  );
}

export function AppsSummary({
  apps,
  appsLoading,
  appsError,
  onOpenConnectedApps,
}: {
  apps: readonly StudioAppAttachmentView[];
  appsLoading: boolean;
  appsError: string | null;
  onOpenConnectedApps: () => void;
}) {
  return (
    <section className="studio-context-card" aria-label="Attached apps summary">
      <h3>Attached apps</h3>
      {appsLoading ? <p className="studio-loading">Loading attached applications…</p> : null}
      {appsError !== null ? (
        <p className="studio-refusal" role="alert">
          Attached apps failed to load: {appsError}
        </p>
      ) : null}
      {!appsLoading && appsError === null && apps.length === 0 ? (
        <p className="studio-empty">No applications attached.</p>
      ) : null}
      {apps.length > 0 ? (
        <ul className="studio-mini-list">
          {apps.map((app) => (
            <li key={app.attachmentId}>
              {app.applicationId} v{app.appVersion} — {permissionSummary(app)}
              {app.learningConsent.granted ? " · learning consent granted" : " · learning consent NOT granted"}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="studio-link" onClick={onOpenConnectedApps}>
        Open Connected Apps
        <span className="studio-link-purpose">grant scopes, audit actions, revoke access</span>
      </button>
    </section>
  );
}
