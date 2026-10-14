/**
 * LibraryScreen — the artifact library destination (W11C; screen id
 * "library"): derived outputs and editable projects with their full
 * immutable revision lineage, provenance, pipeline/run references and
 * export availability. History is never collapsed into an overwritable
 * file list (the product UI contract's Library law).
 */
import { useEffect, useState } from "react";
import type { LibraryArtifactDetail, LibraryScreenPort, LibraryArtifactShape } from "./libraryScreenPorts.js";
import {
  editabilityLabel,
  exportAvailability,
  LIBRARY_DISABLED_REASONS,
  lineageSummaryLine,
  revisionRows,
} from "./libraryScreenViews.js";
import "./library.css";

export function LibraryScreen({ port }: { port: LibraryScreenPort }) {
  const [artifacts, setArtifacts] = useState<readonly LibraryArtifactShape[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<LibraryArtifactDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const rows = await port.listArtifacts();
        if (!disposed) setArtifacts(rows);
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
        const loaded = await port.readArtifact(selected);
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
    <section className="sporta-screen" aria-label="Library">
      <header className="sporta-screen-header">
        <h1>Library</h1>
        <p className="sporta-screen-purpose">
          Output assets and editable projects with their immutable revision history and lineage.
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

      {artifacts === null ? (
        <p className="sporta-loading">Loading library…</p>
      ) : artifacts.length === 0 ? (
        <p className="sporta-empty">No artifacts in the library read model yet.</p>
      ) : (
        <ul className="sporta-lib-list">
          {artifacts.map((artifact) => (
            <li key={artifact.artifactId}>
              <button
                type="button"
                className={`sporta-lib-row${selected === artifact.artifactId ? " sporta-lib-row-selected" : ""}`}
                aria-pressed={selected === artifact.artifactId}
                onClick={() => setSelected(artifact.artifactId)}
              >
                <span className="sporta-record-title">{artifact.artifactId}</span>
                <span className="sporta-record-meta">
                  kind {artifact.kind} · {editabilityLabel(artifact.editability)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected !== null && busy ? <p className="sporta-loading">Loading lineage…</p> : null}
      {detail !== null ? <ArtifactDetail detail={detail} backing={port.backing} /> : null}
    </section>
  );
}

/** Revision lineage + provenance + export availability for one artifact. */
function ArtifactDetail({
  detail,
  backing,
}: {
  detail: LibraryArtifactDetail;
  backing: LibraryScreenPort["backing"];
}) {
  const rows = revisionRows(detail.revisions);
  const exportState = exportAvailability(backing, detail);
  return (
    <article className="sporta-detail" aria-label={`Artifact ${detail.artifact.artifactId}`}>
      <h2>{detail.artifact.artifactId}</h2>
      <p className="sporta-record-meta">
        kind {detail.artifact.kind} · {editabilityLabel(detail.artifact.editability)}
      </p>
      <h3>Lineage</h3>
      <p className="sporta-note">{lineageSummaryLine(detail)}</p>
      <ol className="sporta-revision-list">
        {rows.map((row) => (
          <li key={row.revisionId} className="sporta-revision">
            <span className="sporta-record-title">
              {row.revisionId}
              {row.isHead ? " · HEAD" : ""}
            </span>
            <span className="sporta-record-meta">
              content {row.contentHashHead}
              {row.parentRevisionId !== null ? ` · parent ${row.parentRevisionId}` : " · root revision"}
            </span>
            <span className="sporta-record-meta">tools {row.tools}</span>
            <span className="sporta-note">provenance {row.provenanceLine}</span>
            {row.organizationLine !== null ? (
              <span className="sporta-note">organization {row.organizationLine}</span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="sporta-actions">
        <button
          type="button"
          className="sporta-action-button"
          disabled={!exportState.available}
          title={exportState.reason}
        >
          Export latest
        </button>
        <button type="button" className="sporta-action-button" disabled title={LIBRARY_DISABLED_REASONS.deleteRevision}>
          Delete history
        </button>
      </div>
      <p className="sporta-disabled-reason">
        {exportState.reason} {LIBRARY_DISABLED_REASONS.deleteRevision}
      </p>
    </article>
  );
}
