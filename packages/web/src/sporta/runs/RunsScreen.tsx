/**
 * RunsScreen — the run history + per-run evidence destination (W11C;
 * screen id "runs"): running/finished/refused jobs, per-step progress,
 * resource/cost facts, typed failures surfaced verbatim, live-session
 * evidence (grade carried on the record, rendered verbatim — UI-15) and
 * audit/workgraph references. Debug-level detail is secondary content,
 * not the primary header (the product-copy convention).
 */
import { useEffect, useState } from "react";
import type { RunRecordShape, RunsScreenPort } from "./runsScreenPorts.js";
import {
  liveSessionLine,
  runAuditLines,
  runRow,
  runStateClass,
  runStateLabel,
  stepCostLine,
  stepResourceLine,
  stepStatusLabel,
  RUNS_DISABLED_REASONS,
} from "./runsScreenViews.js";
import "./runs.css";

export function RunsScreen({ port }: { port: RunsScreenPort }) {
  const [runs, setRuns] = useState<readonly RunRecordShape[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunRecordShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const rows = await port.listRuns();
        if (!disposed) setRuns(rows);
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
        const record = await port.readRun(selected);
        if (!disposed) {
          setDetail(record);
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
    <section className="sporta-screen" aria-label="Runs">
      <header className="sporta-screen-header">
        <h1>Runs</h1>
        <p className="sporta-screen-purpose">
          Transform run history with per-step evidence, typed failures and resource facts.
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

      {runs === null ? (
        <p className="sporta-loading">Loading runs…</p>
      ) : runs.length === 0 ? (
        <p className="sporta-empty">No runs recorded in the read model yet.</p>
      ) : (
        <ul className="sporta-run-list">
          {runs.map((run) => {
            const row = runRow(run);
            return (
              <li key={row.runManifestId}>
                <button
                  type="button"
                  className={`sporta-run-row${selected === row.runManifestId ? " sporta-run-row-selected" : ""}`}
                  aria-pressed={selected === row.runManifestId}
                  onClick={() => setSelected(row.runManifestId)}
                >
                  <span className="sporta-record-title">{row.pipelineId} v{row.version}</span>
                  <span className="sporta-record-meta">
                    {row.runManifestId} · work graph {row.workGraphId} · run {row.runRef}
                  </span>
                  <span className="sporta-record-meta">
                    started {row.startedAt} · finished {row.finishedAt || "—"} · outputs{" "}
                    {row.outputsCount}
                    {row.liveSessionsCount > 0 ? ` · live sessions ${row.liveSessionsCount}` : ""}
                  </span>
                  <span className={`sporta-state sporta-state-${row.stateClass}`}>{row.stateLabel}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected !== null && busy ? <p className="sporta-loading">Loading run evidence…</p> : null}
      {detail !== null ? <RunDetail record={detail} /> : null}
    </section>
  );
}

/** Per-run evidence: steps, typed failures, live sessions, audit refs. */
function RunDetail({ record }: { record: RunRecordShape }) {
  const state = runStateClass(record);
  return (
    <article className="sporta-detail" aria-label={`Run evidence ${record.runManifestId}`}>
      <h2>
        {record.release.pipelineId} v{record.release.version}
      </h2>
      <p className={`sporta-state sporta-state-${state}`}>{runStateLabel(state)}</p>

      <h3>Steps</h3>
      {record.steps.length === 0 ? (
        <p className="sporta-empty">No step records on this run.</p>
      ) : (
        <ul className="sporta-step-list">
          {record.steps.map((step) => (
            <li key={step.nodeId} className={`sporta-step sporta-step-${step.status}`}>
              <span className="sporta-record-title">{step.nodeId}</span>
              <span>{stepStatusLabel(step.status)} · {stepResourceLine(step)} · {stepCostLine(step)}</span>
              <span className="sporta-note">{step.detail}</span>
              {step.provenance !== null ? (
                <span className="sporta-note">
                  provenance: {step.provenance.sourceKind} {step.provenance.sourceRef} @{" "}
                  {step.provenance.capturedAt}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {record.liveSessions !== undefined && record.liveSessions.length > 0 ? (
        <>
          <h3>Live sessions</h3>
          <ul className="sporta-note-list">
            {record.liveSessions.map((session) => (
              <li key={session.descriptor.sourceId}>{liveSessionLine(session)}</li>
            ))}
          </ul>
        </>
      ) : null}

      <h3>Audit references</h3>
      <dl className="sporta-facts">
        {runAuditLines(record).map((row) => (
          <div key={row.label} className="sporta-fact">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="sporta-actions">
        <button type="button" className="sporta-action-button" disabled title={RUNS_DISABLED_REASONS.retry}>
          Retry run
        </button>
        <button type="button" className="sporta-action-button" disabled title={RUNS_DISABLED_REASONS.cancel}>
          Cancel run
        </button>
      </div>
      <p className="sporta-disabled-reason">
        {RUNS_DISABLED_REASONS.retry} {RUNS_DISABLED_REASONS.cancel}
      </p>
    </article>
  );
}
