/**
 * The studio panel's presentational sections (W9C-6) — pure render
 * helpers over the `StudioState`: the graph builder list, the typed
 * validation view, the sample preview, the marketplace/review status,
 * the launch disclosure (everything the ADR requires the user to SEE
 * before launch, P9-12), the launch admission/result surfaces, and the
 * app permission/data-scope panel (P9-18/22).
 *
 * EVIDENCE CLASS: BUILD-VERIFIED/UNTESTED (the repo's honesty label —
 * no browser test harness exists; the headless tests assert the data).
 */
import type { StudioState } from "./studioPorts.js";

export function GraphSection({ state }: { state: StudioState | null }) {
  return (
    <section className="sporta-stages" aria-label="Graph builder">
      <h2>Graph builder</h2>
      <ol className="sporta-stage-list">
        {(state?.graph.nodes ?? []).map((node) => (
          <li key={node.nodeId} className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">{node.nodeId}</span>
            <span className="sporta-stage-detail">
              {node.kind} · {node.componentName}@{node.componentDigest.slice(0, 18)}… · {node.note}
            </span>
          </li>
        ))}
        {(state?.graph.edges ?? []).map((edge) => (
          <li key={`${edge.from}-${edge.to}`} className="sporta-stage sporta-stage-active">
            <span className="sporta-stage-detail">
              edge {edge.from} → {edge.to}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ValidationSection({ state }: { state: StudioState | null }) {
  const validation = state?.graph.validation;
  return (
    <section className="sporta-stages" aria-label="Validation">
      <h2>Validation (typed, fail-closed)</h2>
      {validation?.valid === true ? (
        <p className="sporta-stage-detail">
          VALID — {validation.nodeCount} node(s), {validation.edgeCount} edge(s)
        </p>
      ) : (
        <ul className="sporta-stage-list">
          {validation !== undefined && validation.valid === false
            ? validation.violations.map((violation) => (
                <li key={violation.detail} className="sporta-stage sporta-stage-refused">
                  <span className="sporta-stage-name">{violation.kind}</span>
                  <span className="sporta-stage-detail">{violation.detail}</span>
                </li>
              ))
            : null}
        </ul>
      )}
    </section>
  );
}

export function PreviewSection({ state }: { state: StudioState | null }) {
  const preview = state?.preview ?? null;
  return (
    <section className="sporta-stages" aria-label="Sample preview">
      <h2>Sample preview</h2>
      {preview === null ? (
        <p className="sporta-loading">no preview yet</p>
      ) : (
        <div>
          <p className="sporta-stage-detail">
            {preview.status} ({preview.evidenceGrade}) — {preview.detail}
          </p>
          <pre className="sporta-stage-detail">{preview.outputPreview}</pre>
          <ul className="sporta-stage-list">
            {preview.laneNotes.map((laneNote) => (
              <li key={laneNote} className="sporta-stage sporta-stage-done">
                <span className="sporta-stage-detail">{laneNote}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function MarketplaceSection({ state }: { state: StudioState | null }) {
  const market = state?.marketplace ?? null;
  const listing = market?.listing ?? null;
  const disclosure = market?.disclosure ?? null;
  return (
    <section className="sporta-stages" aria-label="Marketplace and review status">
      <h2>Marketplace · review status</h2>
      {listing === null ? (
        <p className="sporta-loading">no listing</p>
      ) : (
        <div>
          <p className="sporta-stage-detail">
            {listing.title} · {listing.status} · publisher {listing.publisher}
          </p>
          <p className="sporta-stage-detail">
            approved version {listing.currentRelease.version} @{" "}
            {listing.currentRelease.releaseDigest.slice(0, 18)}… · reviewed{" "}
            {listing.currentRelease.reviewedAt}
          </p>
          <ul className="sporta-stage-list">
            {listing.versionHistory.map((entry) => (
              <li key={entry.version} className="sporta-stage sporta-stage-done">
                <span className="sporta-stage-name">v{entry.version}</span>
                <span className="sporta-stage-detail">{entry.changelog}</span>
              </li>
            ))}
          </ul>
          {(market?.decisions ?? []).map((decision) => (
            <p key={decision.decisionId} className="sporta-stage-detail">
              review {decision.outcome} · roles{" "}
              {decision.humanReview.map((entry) => entry.role).join("+")} · policy{" "}
              {decision.policyVersion}
            </p>
          ))}
        </div>
      )}
      <h3>Launch disclosure (before launch)</h3>
      {disclosure === null ? (
        <p className="sporta-loading">no disclosure</p>
      ) : (
        <ul className="sporta-stage-list">
          <li className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">terms</span>
            <span className="sporta-stage-detail">
              {disclosure.terms.kind}
              {disclosure.cost === null
                ? " · free"
                : ` · ${disclosure.cost.amount} ${disclosure.cost.currency}`}{" "}
              · license {disclosure.terms.termsLicense}
            </span>
          </li>
          <li className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">rights</span>
            <span className="sporta-stage-detail">
              {disclosure.rightsPrerequisites.join(", ")}
            </span>
          </li>
          <li className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">dependencies</span>
            <span className="sporta-stage-detail">
              {disclosure.dependencies
                .map((dependency) => `${dependency.name} (${dependency.license})`)
                .join("; ")}
            </span>
          </li>
          <li className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">outputs</span>
            <span className="sporta-stage-detail">{disclosure.outputs.join("; ")}</span>
          </li>
          <li className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">limitations</span>
            <span className="sporta-stage-detail">{disclosure.limitations.join("; ")}</span>
          </li>
          <li className="sporta-stage sporta-stage-done">
            <span className="sporta-stage-name">expectations</span>
            <span className="sporta-stage-detail">
              ~{disclosure.latencyExpectations.typicalLatencyMs}ms ·{" "}
              {disclosure.latencyExpectations.declaredThroughput} · evidence{" "}
              {disclosure.evidenceGrade}
            </span>
          </li>
          <li className="sporta-stage sporta-stage-refused">
            <span className="sporta-stage-name">legal</span>
            <span className="sporta-stage-detail">{disclosure.legalNotice}</span>
          </li>
        </ul>
      )}
    </section>
  );
}

export function LaunchSection({ state }: { state: StudioState | null }) {
  const launch = state?.launch ?? null;
  return (
    <section className="sporta-stages" aria-label="Pipeline selection at feed launch">
      <h2>Pipeline selection at feed launch</h2>
      {launch === null ? (
        <p className="sporta-loading">no selection yet</p>
      ) : (
        <div>
          <p className="sporta-stage-detail">
            feed {launch.feedKind} (ingress {launch.ingressGrade}) ·{" "}
            {launch.lastAdmission === null
              ? "no admission yet"
              : launch.lastAdmission.admitted
                ? `ADMITTED ${launch.lastAdmission.releaseDigest?.slice(0, 18)}…`
                : `REFUSED ${launch.lastAdmission.reason}: ${launch.lastAdmission.detail}`}
          </p>
          {launch.lastRunManifest === null ? null : (
            <p className="sporta-stage-detail">
              run {launch.lastRunManifest.runManifestId} · outputs {launch.lastRunManifest.outputs} ·
              fidelity {launch.lastRunManifest.semanticFidelity.grade} · steps{" "}
              {launch.lastRunManifest.steps.map((step) => `${step.nodeId}:${step.status}`).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function AppsSection({ state }: { state: StudioState | null }) {
  const apps = state?.apps ?? null;
  const attachable = apps?.attachableApp ?? null;
  const attached = apps?.attached[0] ?? null;
  return (
    <section className="sporta-stages" aria-label="Attached apps permissions and data scope">
      <h2>Attached apps · permissions · data scope</h2>
      {attachable === null ? (
        <p className="sporta-loading">no attachable app</p>
      ) : (
        <div>
          <p className="sporta-stage-detail">
            {attachable.applicationId} ({attachable.targetKind} · {attachable.targetIdentity}) ·
            license {attachable.licensing.license}
          </p>
          <p className="sporta-stage-detail">
            data scope: {attachable.dataScope.join(", ")} · network {attachable.networkNeeds} ·
            limitations {attachable.limitations.join("; ")}
          </p>
          <ul className="sporta-stage-list">
            {attachable.capabilities.map((capability) => (
              <li key={capability.capabilityId} className="sporta-stage sporta-stage-done">
                <span className="sporta-stage-name">{capability.capabilityClass}</span>
                <span className="sporta-stage-detail">
                  {capability.capabilityId} — {capability.action}
                  {capability.requiredPermissions.length > 0
                    ? ` (requires ${capability.requiredPermissions.join(", ")})`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {attached === null ? (
        <p className="sporta-loading">no attachment yet</p>
      ) : (
        <div>
          <p className="sporta-stage-detail">
            granted: {attached.attachment.grantedCapabilityClasses.join(", ")} · learning{" "}
            {attached.attachment.learningConsent.granted ? "consented" : "NOT consented"} · expires{" "}
            {attached.attachment.expiresAt}
            {attached.attachment.revokedAt !== null
              ? ` · REVOKED ${attached.attachment.revokedAt}`
              : ""}
          </p>
          <ul className="sporta-stage-list">
            {attached.auditTrail.map((record) => (
              <li
                key={record.actionRecordId}
                className={`sporta-stage sporta-stage-${
                  record.status === "succeeded" ? "done" : record.status === "denied" ? "refused" : "blocked"
                }`}
              >
                <span className="sporta-stage-name">{record.status}</span>
                <span className="sporta-stage-detail">
                  {record.capabilityId} · {record.permissionDecision.decision}/
                  {record.permissionDecision.basis}
                  {record.reconciledRefs.workGraphId !== null
                    ? ` · reconciled ${record.reconciledRefs.workGraphId}`
                    : ""}
                  {record.missingCoverageNote !== null ? ` · ${record.missingCoverageNote}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
