/**
 * AppsTab — the attached-apps permission/data-scope view (W9C-8):
 * granted vs not-granted capability classes, the separate learning
 * consent, data scope, network posture, licensing and limitations.
 *
 * BUILD-VERIFIED/UNTESTED (the SportaPanel honesty law): compiled by
 * `pnpm exec tsc -b packages/web`; the pure view-models it consumes
 * are battery-tested (app-environments test/studioViews.test.ts).
 */
import { useEffect, useState } from "react";
import type { StudioAppAttachmentView, TransformStudioHostPort } from "./studioPorts.js";
import { dataScopeLine, learningConsentLine, permissionSummary } from "./appAttachmentViews.js";

export function AppsTab({
  host,
  onError,
}: {
  host: TransformStudioHostPort;
  onError: (message: string | null) => void;
}) {
  const [apps, setApps] = useState<readonly StudioAppAttachmentView[] | null>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const listed = await host.listAppAttachments();
        if (!disposed) setApps(listed);
        onError(null);
      } catch (cause) {
        if (!disposed) onError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [host, onError]);

  if (apps === null) {
    return <p className="studio-loading">Loading attached applications…</p>;
  }
  return (
    <section className="studio-section" aria-label="Attached applications">
      <h2>Attached apps</h2>
      {apps.length === 0 ? (
        <p className="studio-empty">No applications attached.</p>
      ) : (
        apps.map((app) => <AppArticle key={app.attachmentId} app={app} />)
      )}
    </section>
  );
}

function AppArticle({ app }: { app: StudioAppAttachmentView }) {
  return (
    <article className="studio-app">
      <h3>
        {app.applicationId} v{app.appVersion}
      </h3>
      <p className="studio-listing-meta">
        {app.targetKind} target {app.targetIdentity}
      </p>
      <p>{permissionSummary(app)}</p>
      <p>{learningConsentLine(app)}</p>
      <p>{dataScopeLine(app)}</p>
      <p>
        License: {app.licensing.license} — {app.licensing.provenance}
      </p>
      <h4>Capabilities</h4>
      <ul>
        {app.capabilities.map((capability) => (
          <li key={capability.capabilityId}>
            <strong>{capability.capabilityClass}</strong> {capability.action}(
            {capability.capabilityId})
            {capability.sideEffects.length > 0
              ? ` — effects: ${capability.sideEffects.join(", ")}`
              : ""}
          </li>
        ))}
      </ul>
      <h4>Not granted</h4>
      <p>
        {app.notGrantedClasses.length > 0
          ? app.notGrantedClasses.join(", ")
          : "every declared class is granted"}
      </p>
      <h4>Limitations</h4>
      <ul>
        {app.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </article>
  );
}
