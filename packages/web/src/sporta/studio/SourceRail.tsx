/**
 * SourceRail — the workbench's left region (W11B-1): evidence badges,
 * the stage progress rail, the feed/source selection (recorded + live,
 * with the W10 evidence VERBATIM through liveSourceViews), and the
 * cross-screen links (Worker C destinations through the shell port).
 *
 * Render law: this panel renders whatever the workbench state and the
 * injected host report — loading/error/empty states for every async
 * seam, refusals displayed as refusals, grades carried verbatim.
 */
import type { ReactNode } from "react";
import type { SportaNavigationRefusal, SportaScreenEvidenceGrade } from "../product/contract.js";
import type { StudioLiveSourceView } from "./studioPorts.js";
import {
  liveGradeBadge,
  liveRefusalLine,
  liveSessionHealthy,
  liveSourceRows,
} from "./liveSourceViews.js";
import {
  type WorkbenchFlowState,
  type WorkbenchSourceState,
  type WorkbenchStageRow,
} from "./workbench.js";
import { STUDIO_LINK_ROUTES } from "./studioRegistration.js";

export function EvidenceBadges({
  hostEvidence,
  screenGrade,
}: {
  hostEvidence: "real" | "fixture";
  screenGrade: SportaScreenEvidenceGrade;
}) {
  return (
    <p className="studio-badges">
      <span className={`studio-badge studio-badge-${hostEvidence}`}>
        {hostEvidence === "real" ? "REAL HOST" : "FIXTURE HOST (browser demo)"}
      </span>
      <span className={`studio-badge studio-badge-grade-${screenGrade}`}>
        screen evidence: {screenGrade}
      </span>
    </p>
  );
}

function StageRail({ rows }: { rows: readonly WorkbenchStageRow[] }) {
  return (
    <nav className="studio-stages" aria-label="Workbench progress">
      <h2 className="studio-rail-heading">Workflow</h2>
      <ol className="studio-stage-list">
        {rows.map((row) => (
          <li key={row.stage} className={`studio-stage-row studio-stage-row-${row.state}`}>
            <span className="studio-stage-label" aria-current={row.state === "current" ? "step" : undefined}>
              {row.label}
            </span>
            <span className="studio-stage-detail">{row.detail}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SourceOption({
  title,
  meta,
  selected,
  onSelect,
  children,
}: {
  title: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={`studio-source studio-source-${selected ? "selected" : "idle"}`}>
      <div className="studio-source-head">
        <strong>{title}</strong>
        <span className="studio-source-meta">{meta}</span>
      </div>
      {children}
      <button
        type="button"
        className="studio-button studio-button-secondary"
        aria-pressed={selected}
        onClick={onSelect}
      >
        {selected ? "Selected" : "Select"}
      </button>
    </div>
  );
}

function LiveEvidenceCard({ view }: { view: StudioLiveSourceView }) {
  const badge = liveGradeBadge(view.descriptor.grade);
  const healthy = view.session !== null && liveSessionHealthy(view.session);
  return (
    <div className="studio-live-card">
      <div className="studio-live-head">
        <span className={`studio-badge studio-badge-${badge.tone}`}>{badge.text}</span>
        {view.session !== null ? (
          <span className={healthy ? "studio-live-ok" : "studio-live-warn"}>
            {view.session.closeReason}
          </span>
        ) : null}
      </div>
      <dl className="studio-rows">
        {liveSourceRows(view).map((row) => (
          <div key={row.label} className="studio-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.session?.refusal !== null && view.session?.refusal !== undefined ? (
        <p className="studio-refusal" role="alert">
          {liveRefusalLine(view.session.refusal)}
        </p>
      ) : null}
    </div>
  );
}

export function StudioNavLinks({
  shell,
  onNavigate,
  refusal,
}: {
  shell: unknown;
  onNavigate: (index: number) => void;
  refusal: SportaNavigationRefusal | null;
}) {
  const wired = shell !== null && shell !== undefined;
  return (
    <nav className="studio-links" aria-label="Related product screens">
      <h2 className="studio-rail-heading">Elsewhere in Sporta</h2>
      <ul className="studio-link-list">
        {STUDIO_LINK_ROUTES.map((link, index) => (
          <li key={link.route.screen}>
            <button
              type="button"
              className="studio-link"
              disabled={!wired}
              title={wired ? link.purpose : "Shell navigation is not wired into this studio mount yet"}
              onClick={() => onNavigate(index)}
            >
              {link.label}
              <span className="studio-link-purpose">{link.purpose}</span>
            </button>
          </li>
        ))}
      </ul>
      {!wired ? (
        <p className="studio-hint">
          The product shell is not wired into this studio mount yet — these destinations stay
          disabled with a reason instead of pretending to navigate.
        </p>
      ) : null}
      {refusal !== null ? (
        <p className="studio-refusal" role="alert">
          Navigation refused — {refusal.screen}: {refusal.reason}
        </p>
      ) : null}
    </nav>
  );
}

export function SourceRail({
  flow,
  progress,
  liveSources,
  liveState,
  liveError,
  hostEvidence,
  screenGrade,
  shell,
  navRefusal,
  onSelectSource,
  onNavigate,
}: {
  flow: WorkbenchFlowState;
  progress: readonly WorkbenchStageRow[];
  liveSources: readonly StudioLiveSourceView[] | "unavailable" | null;
  liveState: "loading" | "loaded";
  liveError: string | null;
  hostEvidence: "real" | "fixture";
  screenGrade: SportaScreenEvidenceGrade;
  shell: unknown;
  navRefusal: SportaNavigationRefusal | null;
  onSelectSource: (source: WorkbenchSourceState) => void;
  onNavigate: (index: number) => void;
}) {
  const recorded: WorkbenchSourceState = {
    feedKind: "prerecorded",
    sourceRef: "studio-sample-feed",
    label: "Recorded sample feed",
    evidenceLine: "5-event prerecorded sample feed (window 1500ms..4500ms)",
  };
  return (
    <div className="studio-rail" aria-label="Sources and workflow progress">
      <EvidenceBadges hostEvidence={hostEvidence} screenGrade={screenGrade} />
      <StageRail rows={progress} />
      <section aria-label="Feed source selection" className="studio-sources">
        <h2 className="studio-rail-heading">Feed source</h2>
        <SourceOption
          title={recorded.label}
          meta="prerecorded"
          selected={flow.source?.feedKind === "prerecorded"}
          onSelect={() => onSelectSource(recorded)}
        >
          <p className="studio-source-evidence">{recorded.evidenceLine}</p>
        </SourceOption>
        {liveState === "loading" ? <p className="studio-loading">Loading live sources…</p> : null}
        {liveError !== null ? (
          <p className="studio-refusal" role="alert">
            Live sources failed: {liveError}
          </p>
        ) : null}
        {liveSources === "unavailable" ? (
          <p className="studio-empty">
            Live-source evidence is not composed into this studio host yet — the recorded feed
            above stays fully available.
          </p>
        ) : null}
        {Array.isArray(liveSources) && liveSources.length === 0 ? (
          <p className="studio-empty">No live sources declared.</p>
        ) : null}
        {Array.isArray(liveSources)
          ? liveSources.map((view) => (
              <div key={view.descriptor.sourceId} className="studio-source studio-source-live">
                <LiveEvidenceCard view={view} />
                <button
                  type="button"
                  className="studio-button studio-button-secondary"
                  aria-pressed={flow.source?.feedKind === "live" && flow.source.sourceRef === view.descriptor.sourceId}
                  onClick={() =>
                    onSelectSource({
                      feedKind: "live",
                      sourceRef: view.descriptor.sourceId,
                      label: view.descriptor.sourceId,
                      evidenceLine: liveGradeBadge(view.descriptor.grade).text,
                    })
                  }
                >
                  {flow.source?.sourceRef === view.descriptor.sourceId ? "Selected" : "Select live source"}
                </button>
              </div>
            ))
          : null}
      </section>
      <StudioNavLinks shell={shell} onNavigate={onNavigate} refusal={navRefusal} />
    </div>
  );
}
