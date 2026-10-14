/**
 * ConnectedAppsScreen — the Connected Apps destination (W11C; screen id
 * "connected-apps"): target identity, connection state, app version,
 * capability scopes, expiration, who granted access, latest actions and
 * revoke control. Observe and control are separate (lock 30);
 * attachment consent is separate from learning consent (lock 31).
 */
import { useCallback, useEffect, useState } from "react";
import type {
  ConnectedAppAuditShape,
  ConnectedAppView,
  ConnectedAppsScreenPort,
} from "./appsScreenPorts.js";
import {
  appAuditLine,
  appConsentLine,
  appDataScopeLine,
  appGrantsMutation,
  appLearningConsentLine,
  appNotGrantedClasses,
  appPermissionSummary,
  APPS_DISABLED_REASONS,
} from "./appsScreenViews.js";
import "./apps.css";

export function ConnectedAppsScreen({ port }: { port: ConnectedAppsScreenPort }) {
  const [apps, setApps] = useState<readonly ConnectedAppView[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [audit, setAudit] = useState<readonly ConnectedAppAuditShape[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const views = await port.listAttachments();
        if (!disposed) {
          setApps(views);
          setError(null);
        }
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
      setAudit(null);
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const trail = await port.readAuditTrail(selected);
        if (!disposed) setAudit(trail);
      } catch {
        if (!disposed) setAudit([]); // the empty-state copy explains the seam
      }
    })();
    return () => {
      disposed = true;
    };
  }, [selected, port]);

  const doRevoke = useCallback(async () => {
    if (selected === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await port.revoke(selected);
      setMessage(
        result.ok
          ? `Revoked — attachment ${selected} revoked at ${result.revokedAt}`
          : `Refused — ${result.reason}`,
      );
      const views = await port.listAttachments();
      setApps(views);
    } catch (cause) {
      setMessage(`Failed — ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  }, [port, selected]);

  return (
    <section className="sporta-screen" aria-label="Connected Apps">
      <header className="sporta-screen-header">
        <h1>Connected Apps</h1>
        <p className="sporta-screen-purpose">
          Attached applications with their granted capability scopes, audit effects and revocation.
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

      {apps === null ? (
        <p className="sporta-loading">Loading attached applications…</p>
      ) : apps.length === 0 ? (
        <p className="sporta-empty">No applications attached.</p>
      ) : (
        <ul className="sporta-app-list">
          {apps.map((view) => (
            <li key={view.attachment.attachmentId}>
              <AppCard
                view={view}
                selected={selected === view.attachment.attachmentId}
                onSelect={() => setSelected(view.attachment.attachmentId)}
              />
            </li>
          ))}
        </ul>
      )}

      {message !== null ? (
        <p className="sporta-action-result" role="status">
          {message}
        </p>
      ) : null}

      {selected !== null ? (
        <article className="sporta-detail" aria-label="Attachment audit trail">
          <h2>Audit trail</h2>
          {audit === null || audit.length === 0 ? (
            <p className="sporta-empty">
              No audit rows available for this attachment — the audit-read seam on the composition
              is NEXT DEPENDENCIES (the app-environment service records actions; the screen surface
              does not expose them at this SHA).
            </p>
          ) : (
            <ul className="sporta-note-list">
              {audit.map((record) => (
                <li key={record.actionRecordId}>{appAuditLine(record)}</li>
              ))}
            </ul>
          )}
          <div className="sporta-actions">
            <button type="button" className="sporta-action-button" disabled title={APPS_DISABLED_REASONS.attach}>
              Attach new app
            </button>
            <button
              type="button"
              className="sporta-action-button sporta-danger-button"
              disabled={busy}
              title="Revoke this attachment's capability grants through the app-environment revoke path."
              onClick={() => void doRevoke()}
            >
              {busy ? "Revoking…" : "Revoke access"}
            </button>
          </div>
          <p className="sporta-disabled-reason">{APPS_DISABLED_REASONS.attach} {APPS_DISABLED_REASONS.invoke}</p>
        </article>
      ) : null}
    </section>
  );
}

/** One attachment card (identity, scopes, consent, state — honest). */
function AppCard({
  view,
  selected,
  onSelect,
}: {
  view: ConnectedAppView;
  selected: boolean;
  onSelect: () => void;
}) {
  const revoked = view.attachment.revokedAt !== null;
  const notGranted = appNotGrantedClasses(view);
  return (
    <button
      type="button"
      className={`sporta-app-card${selected ? " sporta-app-card-selected" : ""}${revoked ? " sporta-app-card-revoked" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="sporta-record-title">
        {view.descriptor.applicationId} v{view.descriptor.appVersion}
      </span>
      <span className="sporta-record-meta">Attachment {view.attachment.attachmentId}</span>
      <span className="sporta-record-meta">
        {view.descriptor.targetKind} target {view.descriptor.targetIdentity}
      </span>
      <span className={`sporta-state sporta-state-${revoked ? "typed-failure" : "succeeded"}`}>
        {appPermissionSummary(view)}
      </span>
      <span className="sporta-record-meta">{appConsentLine(view)}</span>
      <span className="sporta-record-meta">{appLearningConsentLine(view)}</span>
      <span className="sporta-record-meta">{appDataScopeLine(view)}</span>
      {appGrantsMutation(view) ? (
        <span className="sporta-state sporta-state-fallback-used">
          mutating classes granted — actions require confirmation
        </span>
      ) : null}
      <span className="sporta-record-meta">
        Not granted: {notGranted.length > 0 ? notGranted.join(", ") : "every declared class is granted"}
      </span>
      <span className="sporta-record-meta">
        Capabilities:{" "}
        {view.descriptor.capabilities
          .map((capability) => `${capability.capabilityClass}/${capability.action}`)
          .join(", ")}
      </span>
      <span className="sporta-note">
        License: {view.descriptor.licensing.license} — {view.descriptor.licensing.provenance}
      </span>
    </button>
  );
}
