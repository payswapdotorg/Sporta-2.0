/**
 * MarketplaceScreen — the public Transform Marketplace destination
 * (W11C; screen id "marketplace").
 *
 * Product-native browse/detail surface over the injected
 * `MarketplaceScreenPort` (the state-owner law — no store, no seams
 * imported). Listing cards show publisher, approved version, review
 * status, terms/price, rights prerequisites, outputs, limitations,
 * cost/latency expectations and the record's evidence grade VERBATIM
 * (UI-15). Every action is functional or disabled WITH a typed reason.
 *
 * Styling: lane classes map to Worker A's `--sporta-*` token names with
 * standalone fallbacks (SPORTA_THEME_TOKENS namespace law). No ZCode
 * vocabulary, no @zcode/ui imports.
 */
import { useEffect, useState } from "react";
import type {
  MarketplaceListingDetail,
  MarketplaceScreenPort,
  MarketplaceListingShape,
} from "./marketplaceScreenPorts.js";
import {
  disclosureRows,
  listingCard,
  reviewSummaryLine,
  MARKETPLACE_DISABLED_REASONS,
} from "./marketplaceScreenViews.js";
import "./marketplace.css";

export function MarketplaceScreen({ port }: { port: MarketplaceScreenPort }) {
  const [listings, setListings] = useState<readonly MarketplaceListingShape[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<MarketplaceListingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const rows = await port.listPublicListings();
        if (!disposed) setListings(rows);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [port]);

  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      return;
    }
    let disposed = false;
    setBusy(true);
    void (async () => {
      try {
        const loaded = await port.readListingDetail(selected);
        if (!disposed) {
          setDetail(loaded);
          setError(null);
        }
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!disposed) setBusy(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [selected, port]);

  return (
    <section className="sporta-screen" aria-label="Transform Marketplace">
      <header className="sporta-screen-header">
        <h1>Marketplace</h1>
        <p className="sporta-screen-purpose">
          Approved transform pipelines with their review status, terms and honest evidence grades.
        </p>
        <span className={`sporta-backing sporta-backing-${port.backing}`}>
          {port.backing === "fixture" ? "BACKING: FIXTURE (browser demo)" : "BACKING: REAL"}
        </span>
      </header>

      {error !== null ? (
        <p className="sporta-refusal" role="alert">
          {error}
        </p>
      ) : null}

      {listings === null ? (
        <p className="sporta-loading">Loading listings…</p>
      ) : listings.length === 0 ? (
        <p className="sporta-empty">No listings in the marketplace read model yet.</p>
      ) : (
        <ul className="sporta-card-grid">
          {listings.map((listing) => {
            const card = listingCard(listing);
            return (
              <li key={card.listingId}>
                <button
                  type="button"
                  className={`sporta-card sporta-card-${card.stateClass}${selected === card.listingId ? " sporta-card-selected" : ""}`}
                  aria-pressed={selected === card.listingId}
                  onClick={() => setSelected(card.listingId)}
                >
                  <span className="sporta-card-title">{card.title}</span>
                  <span className="sporta-card-meta">
                    {card.publisher} · v{card.approvedVersion} · {card.priceLine}
                  </span>
                  <span className="sporta-card-meta">
                    status {card.status} · release {card.releaseDigestHead}
                  </span>
                  <span className={`sporta-badge ${card.gradeClass}`}>
                    grade {card.gradeLabel}
                  </span>
                  <span className="sporta-card-outputs">{card.outputs.join(", ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected !== null && busy ? <p className="sporta-loading">Loading listing detail…</p> : null}
      {detail !== null ? <ListingDetail detail={detail} /> : null}
    </section>
  );
}

/** The detail pane: full launch-disclosure fields + review status (P9-12). */
function ListingDetail({ detail }: { detail: MarketplaceListingDetail }) {
  const disabledReason = MARKETPLACE_DISABLED_REASONS.openInStudio;
  return (
    <article className="sporta-detail" aria-label={`Listing detail ${detail.listing.title}`}>
      <h2>{detail.listing.title}</h2>
      <p className="sporta-detail-purpose">{detail.listing.description ?? detail.listing.title}</p>
      <dl className="sporta-facts">
        {disclosureRows(detail.disclosure ?? fallbackDisclosureCopy()).map((row) => (
          <div key={row.label} className="sporta-fact">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <h3>Review status</h3>
      {detail.review === null ? (
        <p className="sporta-empty">No review decision recorded.</p>
      ) : (
        <p>
          {reviewSummaryLine(detail.review)} · decided {detail.review.decidedAt} under{" "}
          {detail.review.policyVersion}
        </p>
      )}
      <h3>Sample preview</h3>
      {detail.preview === null ? (
        <p className="sporta-empty">No sample preview available.</p>
      ) : (
        <p>
          {detail.preview.inputSummary} → {detail.preview.outputSummary} ·{" "}
          {detail.preview.semanticEvidence} · grade {detail.preview.evidenceGrade}
        </p>
      )}
      <button type="button" className="sporta-action-button" disabled title={disabledReason}>
        Open in Studio
      </button>
      <p className="sporta-disabled-reason">{disabledReason}</p>
      {detail.disclosure !== null && detail.disclosure.legalNotice !== "unavailable" ? (
        <p className="sporta-legal">{detail.disclosure.legalNotice}</p>
      ) : null}
    </article>
  );
}

/** Copy shown when the disclosure seam refused (the reason stays visible). */
function fallbackDisclosureCopy(): NonNullable<MarketplaceListingDetail["disclosure"]> {
  return {
    listingId: "unavailable",
    publisher: "unavailable",
    approvedVersion: "unavailable",
    releaseDigest: "",
    terms: { kind: "free", price: null, termsLicense: "unavailable" },
    rightsPrerequisites: [],
    dependencies: [],
    outputs: [],
    limitations: ["launch disclosure unavailable for this listing"],
    cost: null,
    latencyExpectations: { typicalLatencyMs: 0, declaredThroughput: "unavailable", evidenceGrade: "declared" },
    evidenceGrade: "declared",
    reviewedAt: "unavailable",
    legalNotice: "unavailable",
  };
}
