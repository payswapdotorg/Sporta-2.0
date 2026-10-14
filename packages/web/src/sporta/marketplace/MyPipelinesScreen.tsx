/**
 * MyPipelinesScreen — the creator-side destination (W11C; screen id
 * "my-pipelines"): drafts, submissions, review feedback and released
 * versions — the SAME marketplace records filtered by creator
 * (SCREEN-PORTS.md), with submission-state gaps surfaced as labeled
 * notes/refusals, never disguised. Write actions that need seams the
 * read model does not carry are disabled WITH their typed reason.
 */
import { useEffect, useMemo, useState } from "react";
import type {
  CreatorPipelineRecord,
  MarketplaceReviewShape,
  MyPipelinesScreenPort,
} from "./marketplaceScreenPorts.js";
import {
  creatorStateLabel,
  MARKETPLACE_DISABLED_REASONS,
  recordGradeClass,
  recordGradeLabel,
} from "./marketplaceScreenViews.js";
import "./marketplace.css";

export function MyPipelinesScreen({ port }: { port: MyPipelinesScreenPort }) {
  const [creator, setCreator] = useState("publisher:fixture-market");
  const [records, setRecords] = useState<readonly CreatorPipelineRecord[] | null>(null);
  const [selected, setSelected] = useState<CreatorPipelineRecord | null>(null);
  const [review, setReview] = useState<MarketplaceReviewShape | { reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    setBusy(true);
    void (async () => {
      try {
        const rows = await port.listCreatorRecords(creator);
        if (!disposed) {
          setRecords(rows);
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
  }, [port, creator]);

  useEffect(() => {
    if (selected === null || selected.approvedVersion === null) {
      setReview(null);
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const status = await port.readCreatorVersionStatus(selected.pipelineId, selected.approvedVersion ?? "");
        if (!disposed) setReview(status);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [selected, port]);

  const grouped = useMemo(() => {
    const byState = new Map<CreatorPipelineRecord["creatorState"], CreatorPipelineRecord[]>();
    for (const record of records ?? []) {
      const bucket = byState.get(record.creatorState) ?? [];
      bucket.push(record);
      byState.set(record.creatorState, bucket);
    }
    return [...byState.entries()];
  }, [records]);

  return (
    <section className="sporta-screen" aria-label="My Pipelines">
      <header className="sporta-screen-header">
        <h1>My Pipelines</h1>
        <p className="sporta-screen-purpose">
          Your drafts, submissions, review feedback and released versions — the marketplace
          records from the creator side.
        </p>
        <span className={`sporta-backing sporta-backing-${port.backing}`}>
          {port.backing === "fixture" ? "BACKING: FIXTURE (browser demo)" : "BACKING: REAL"}
        </span>
      </header>

      <form
        className="sporta-filter"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="sporta-creator-filter">Creator</label>
        <input
          id="sporta-creator-filter"
          value={creator}
          onChange={(event) => setCreator(event.target.value)}
        />
      </form>

      {error !== null ? (
        <p className="sporta-refusal" role="alert">
          {error}
        </p>
      ) : null}
      {busy && records === null ? <p className="sporta-loading">Loading creator records…</p> : null}

      {records !== null && records.length === 0 ? (
        <p className="sporta-empty">
          No marketplace records for creator “{creator}” — released/suspended listings appear
          here; drafts need the submission-read seam (see the report's NEXT DEPENDENCIES).
        </p>
      ) : null}

      {grouped.map(([state, rows]) => (
        <div key={state} className="sporta-group">
          <h2>{creatorStateLabel(state)}</h2>
          <ul className="sporta-record-list">
            {rows.map((record) => (
              <li key={`${record.pipelineId}:${record.status}`}>
                <button
                  type="button"
                  className={`sporta-record${selected === record ? " sporta-record-selected" : ""}`}
                  aria-pressed={selected === record}
                  onClick={() => setSelected(record)}
                >
                  <span className="sporta-record-title">{record.title}</span>
                  <span className="sporta-record-meta">
                    {record.pipelineId}
                    {record.approvedVersion !== null ? ` · v${record.approvedVersion}` : ""}
                  </span>
                  <span className="sporta-record-meta">
                    record status {record.status} · origin {record.origin}
                    {record.reviewedAt !== null ? ` · reviewed ${record.reviewedAt}` : ""}
                  </span>
                  {record.origin === "fixture-demo" ? (
                    <span className={`sporta-badge ${recordGradeClass("fixture")}`}>
                      {recordGradeLabel("fixture")} DEMO
                    </span>
                  ) : null}
                  {record.note !== null ? <span className="sporta-note">{record.note}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {selected !== null ? (
        <article className="sporta-detail" aria-label={`Creator record ${selected.title}`}>
          <h2>{selected.title}</h2>
          <h3>Review feedback</h3>
          {review === null ? (
            <p className="sporta-empty">
              {selected.approvedVersion === null
                ? "No approved version yet — drafts have no review decision to show."
                : "Loading review status…"}
            </p>
          ) : "reason" in review ? (
            <p className="sporta-refusal">{review.reason}</p>
          ) : (
            <p>
              {review.outcome} — roles {review.reviewerRoles.join(", ")} · decided{" "}
              {review.decidedAt} under {review.policyVersion}
            </p>
          )}
          <div className="sporta-actions">
            <button type="button" className="sporta-action-button" disabled title={MARKETPLACE_DISABLED_REASONS.submitForReview}>
              Submit for review
            </button>
            <button type="button" className="sporta-action-button" disabled title={MARKETPLACE_DISABLED_REASONS.withdraw}>
              Withdraw
            </button>
          </div>
          <p className="sporta-disabled-reason">
            {MARKETPLACE_DISABLED_REASONS.submitForReview} {MARKETPLACE_DISABLED_REASONS.withdraw}
          </p>
        </article>
      ) : null}
    </section>
  );
}
