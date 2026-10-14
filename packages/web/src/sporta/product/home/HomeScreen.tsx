/**
 * sporta-product Home screen (W11A-3, SPEC.md §5.3) — the feed/media
 * task entrypoint: start a recorded-feed workflow, an honestly-disabled
 * live-source action, resume the current project, what needs attention,
 * the scoped learning-consent decision (through the EXISTING host write
 * path), and the latest run from the EXISTING studio seam — every data
 * region labeled with its evidence grade VERBATIM (UI-15). Loading,
 * error/Retry, and empty states are designed (UI-20); every visible
 * action is functional or visibly disabled with a reason (UI-06).
 *
 * EVIDENCE CLASS (the SportaPanel precedent): BUILD-VERIFIED via
 * `pnpm exec tsc -b packages/web`; the derivations rendered here are
 * node-tested against the REAL host composition
 * (packages/web/test/sportaProductHome.test.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductLoopStage } from "@sporta/product/contract";
import type { SportaConsentInput, SportaHostState } from "../../hostPorts.js";
import type { StudioSamplePreviewView } from "../../studio/studioPorts.js";
import type { SportaScreenRoute } from "../contract.js";
import type { SportaScreenContext, SportaScreenModule } from "../screens.js";
import {
  deriveSportaHomeView,
  SPORTA_HOME_CONSENT_SCOPES,
  SPORTA_HOME_RUNS_FEED_NOTE,
  type SportaHomeAttention,
  type SportaHomeViewModel,
} from "./homeModel.js";
import {
  SportaButton,
  SportaEmptyState,
  SportaPanelCard,
  SportaStatusChip,
} from "../controls.js";
import "./home.css";

/** The latest-run read through the EXISTING studio seam (SPEC.md §5.1). */
async function readSampleRun(
  studio: SportaScreenContext["studio"],
): Promise<{ preview: StudioSamplePreviewView | null; note: string | null }> {
  if (studio === undefined) {
    return { preview: null, note: null };
  }
  try {
    const listings = await studio.listListings();
    const published = listings.find((listing) => listing.status === "PUBLISHED");
    if (published === undefined) {
      return { preview: null, note: "No published pipeline is available to run yet." };
    }
    const preview = await studio.readSamplePreview(
      published.pipelineId,
      published.approvedVersion,
    );
    return { preview, note: preview === null ? "No sample run is available yet." : null };
  } catch (cause) {
    // Honest failure note — never a fabricated run, never a silent drop.
    return {
      preview: null,
      note: `The studio seam reported an error: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

function AttentionList(props: {
  attention: readonly SportaHomeAttention[];
  onNavigate: (route: SportaScreenRoute) => void;
}) {
  if (props.attention.length === 0) {
    return (
      <SportaEmptyState
        title="Nothing needs attention"
        hint="When something blocks, gets refused, or waits on you, it appears here."
      />
    );
  }
  return (
    <ul className="sporta-attention-list">
      {props.attention.map((item) => (
        <li
          key={item.id}
          className={`sporta-attention-item sporta-attention-item-severity-${item.severity}`}
        >
          <p className="sporta-attention-title">{item.title}</p>
          {item.detail !== null ? <p className="sporta-attention-detail">{item.detail}</p> : null}
          <p className="sporta-attention-tech">stage: {item.stage}</p>
          {item.actionRoute !== undefined && item.actionLabel !== undefined ? (
            <div className="sporta-attention-actions">
              <SportaButton variant="ghost" onClick={() => props.onNavigate(item.actionRoute!)}>
                {item.actionLabel}
              </SportaButton>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TraceDetails(props: { trace: readonly ProductLoopStage[] }) {
  return (
    <details className="sporta-trace-details">
      <summary>Technical evidence — the raw product-loop trace</summary>
      <ul className="sporta-trace-list">
        {props.trace.map((stage) => (
          <li key={stage.stage} className="sporta-trace-row">
            <span className="sporta-trace-stage">{stage.stage}</span>
            <span>{stage.state}</span>
            {stage.ref !== undefined ? <span>{stage.ref}</span> : null}
            {stage.detail !== undefined ? <span>{stage.detail}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The Home screen — rendered through the shell's screen context. */
export function SportaHomeScreen({ context }: { context: SportaScreenContext }) {
  const { host, shell, studio } = context;
  const [state, setState] = useState<SportaHostState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleRun, setSampleRun] = useState<StudioSamplePreviewView | null>(null);
  const [sampleNote, setSampleNote] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentOutcome, setConsentOutcome] = useState<{ granted: boolean; detail: string } | null>(
    null,
  );
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    SPORTA_HOME_CONSENT_SCOPES.map((scope) => scope.id),
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setState(await host.readState());
    } catch (cause) {
      setState(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    const runRead = await readSampleRun(studio);
    setSampleRun(runRead.preview);
    setSampleNote(runRead.note);
  }, [host, studio]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const navigateTo = useCallback(
    (route: SportaScreenRoute) => {
      void shell.navigate(route);
    },
    [shell],
  );

  const view: SportaHomeViewModel | null = useMemo(
    () => (state === null ? null : deriveSportaHomeView(state, sampleRun)),
    [state, sampleRun],
  );

  const submitConsent = useCallback(
    async (decision: SportaConsentInput["decision"]) => {
      setConsentBusy(true);
      try {
        const outcome = await host.submitConsent({
          scopes: selectedScopes as SportaConsentInput["scopes"],
          decision,
        });
        setConsentOutcome(
          outcome.outcome === "granted"
            ? { granted: true, detail: outcome.detail }
            : { granted: false, detail: outcome.detail }, // typed refusal VERBATIM
        );
        await refresh();
      } catch (cause) {
        setConsentOutcome({
          granted: false,
          detail: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setConsentBusy(false);
      }
    },
    [host, refresh, selectedScopes],
  );

  const consentDecisionOpen = view?.learningStage.state === "pending";

  return (
    <section className="sporta-home" aria-label="Home">
      <header>
        <h1 className="sporta-home-title">Home</h1>
        <p className="sporta-home-subtitle">
          Sports media production — start from a feed, resume work, see what needs attention.
        </p>
      </header>

      {view === null ? (
        error !== null ? (
          <SportaPanelCard heading="Project state" className="sporta-error-card">
            <p className="sporta-card-subtitle">Couldn&rsquo;t read the project state: {error}</p>
            <SportaButton onClick={() => void refresh()}>Retry</SportaButton>
          </SportaPanelCard>
        ) : (
          <p className="sporta-loading" role="status">
            Loading project state…
          </p>
        )
      ) : (
        <>
          <section aria-label="Start a workflow" className="sporta-start-grid">
            {view.startActions.map((action) => (
              <div key={action.id} className="sporta-start-card">
                <h2 className="sporta-start-card-title">{action.title}</h2>
                <p className="sporta-start-card-text">
                  {action.id === "resume-project" ? `${view.projectSummary}. ` : ""}
                  {action.description}
                </p>
                {action.enabled ? (
                  <SportaButton
                    variant={action.id === "recorded-feed" ? "primary" : "secondary"}
                    onClick={() => navigateTo(action.target)}
                  >
                    {action.id === "resume-project" ? "Resume in Studio" : "Open Studio"}
                  </SportaButton>
                ) : (
                  <SportaButton variant="secondary" disabledReason={action.disabledReason ?? undefined}>
                    Coming with the Studio build
                  </SportaButton>
                )}
              </div>
            ))}
          </section>

          <SportaPanelCard heading="Needs attention">
            <AttentionList attention={view.attention} onNavigate={navigateTo} />
          </SportaPanelCard>

          <SportaPanelCard
            heading="Learning preferences"
            subtitle={
              consentDecisionOpen
                ? "Sporta can learn from this project in the scopes you select. Consent is scoped and separate from app permissions."
                : "Learning for this project is already decided."
            }
          >
            {consentDecisionOpen ? (
              <>
                <fieldset className="sporta-consent-scopes">
                  <legend className="sporta-sr-only">Learning consent scopes</legend>
                  {SPORTA_HOME_CONSENT_SCOPES.map((scope) => (
                    <label key={scope.id} className="sporta-consent-scope">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope.id)}
                        onChange={(event) =>
                          setSelectedScopes((current) =>
                            event.target.checked
                              ? [...current, scope.id]
                              : current.filter((id) => id !== scope.id),
                          )
                        }
                      />
                      {scope.label}
                    </label>
                  ))}
                </fieldset>
                <div className="sporta-card-actions">
                  <SportaButton
                    variant="primary"
                    disabled={consentBusy}
                    disabledReason={
                      selectedScopes.length === 0
                        ? "Select at least one scope to allow."
                        : undefined
                    }
                    onClick={() => void submitConsent("granted")}
                  >
                    Allow selected
                  </SportaButton>
                  <SportaButton
                    disabled={consentBusy}
                    disabledReason={
                      selectedScopes.length === 0
                        ? "Select at least one scope to decline."
                        : undefined
                    }
                    onClick={() => void submitConsent("denied")}
                  >
                    Decline selected
                  </SportaButton>
                </div>
              </>
            ) : (
              <p className="sporta-card-subtitle">
                {view.learningStage.detail ?? "No learning decision is pending."}
              </p>
            )}
            {consentOutcome !== null ? (
              <p
                className={
                  consentOutcome.granted
                    ? "sporta-consent-outcome"
                    : "sporta-consent-outcome sporta-consent-outcome-refused"
                }
              >
                {consentOutcome.granted ? "Allowed — " : "Refused — "}
                {consentOutcome.detail}
              </p>
            ) : null}
          </SportaPanelCard>

          <SportaPanelCard
            heading="Current project"
            actions={<SportaStatusChip grade={view.evidence} />}
          >
            <p className="sporta-card-subtitle">
              {view.projectSummary} · work graph <code>{view.workGraphId}</code>
            </p>
            <TraceDetails trace={view.trace} />
          </SportaPanelCard>

          <SportaPanelCard heading="Runs &amp; outputs">
            {view.sampleRun !== null ? (
              <>
                <dl className="sporta-run-card-lines">
                  <dt>Latest run</dt>
                  <dd>
                    Pipeline <code>{view.sampleRun.pipelineId}</code> · version{" "}
                    <code>{view.sampleRun.version}</code> ·{" "}
                    <SportaStatusChip grade={view.sampleRun.evidenceGrade} />
                  </dd>
                  <dt>Output</dt>
                  <dd>{view.sampleRun.outputSummary}</dd>
                  <dt>Evidence</dt>
                  <dd>{view.sampleRun.semanticEvidence}</dd>
                </dl>
                <div className="sporta-card-actions">
                  <SportaButton onClick={() => navigateTo({ screen: "studio" })}>
                    Open in Studio
                  </SportaButton>
                </div>
              </>
            ) : (
              <SportaEmptyState
                title={sampleNote ?? "No run to show yet"}
                hint={sampleNote === null ? "Runs you start will appear here with their evidence." : undefined}
              />
            )}
            <p className="sporta-card-subtitle">{SPORTA_HOME_RUNS_FEED_NOTE}</p>
          </SportaPanelCard>
        </>
      )}
    </section>
  );
}

/** The Home screen module registration (shell mounts it; SPEC.md §4.4). */
export const SPORTA_HOME_SCREEN: SportaScreenModule = {
  screen: "home",
  render: (context) => <SportaHomeScreen context={context} />,
};
