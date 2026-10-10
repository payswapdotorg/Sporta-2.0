/**
 * SportaPanel — the React render surface of the Sporta host conversion
 * (W4C-3; SPEC.md "Wave-4 host conversion").
 *
 * EVIDENCE CLASS (the UI honesty law, ADR wave-4): this component is
 * BUILD-VERIFIED/UNTESTED — `pnpm --filter @zcode/web build` compiles
 * it into the bundle; no browser test harness exists in this repo and
 * none is claimed. The component renders whatever the injected
 * `SportaHostPort` reports — REAL state when the headless composition
 * drives it (its tests assert the loop), and honestly-labeled FIXTURE
 * state in the browser route (browserFixtureHost.ts), because the
 * Node-only composition legs (spawn/FS/HTTP server) cannot execute in
 * a browser bundle.
 *
 * Surface law: read-only trace rendering + the two write paths
 * (consent intake, takeover entry). Nothing else mutates.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  SportaConsentInput,
  SportaHostEvidence,
  SportaHostPort,
  SportaHostState,
  SportaTakeoverOutcome,
} from "./hostPorts.js";
import "./sportaPanel.css";

const STAGE_ORDER: readonly string[] = [
  "intent",
  "organization",
  "execution",
  "progress",
  "artifact",
  "takeover",
  "editor",
  "learning",
  "capability-gap",
  "arena",
  "result",
  "organization-improvement",
];

const STATE_LABEL: Record<string, string> = {
  pending: "PENDING",
  active: "ACTIVE",
  done: "DONE",
  blocked: "BLOCKED",
  refused: "REFUSED",
};

const CONSENT_SCOPES: readonly { id: string; label: string }[] = [
  { id: "workflow", label: "Workflow" },
  { id: "organization-composition", label: "Organization composition" },
  { id: "preference", label: "Preference" },
];

function EvidenceBadge({ evidence }: { evidence: SportaHostEvidence }) {
  return (
    <span className={`sporta-evidence sporta-evidence-${evidence}`}>
      {evidence === "real" ? "REAL HOST" : "FIXTURE HOST (browser demo)"}
    </span>
  );
}

function StageRow({
  stage,
}: {
  stage: { stage: string; state: string; ref?: string; detail?: string };
}) {
  return (
    <li className={`sporta-stage sporta-stage-${stage.state}`}>
      <span className="sporta-stage-name">{stage.stage}</span>
      <span className="sporta-stage-state">{STATE_LABEL[stage.state] ?? stage.state}</span>
      {stage.ref !== undefined ? <span className="sporta-stage-ref">{stage.ref}</span> : null}
      {stage.detail !== undefined ? <span className="sporta-stage-detail">{stage.detail}</span> : null}
    </li>
  );
}

export function SportaPanel({ host }: { host: SportaHostPort }) {
  const [state, setState] = useState<SportaHostState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const [takeoverMessage, setTakeoverMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [takeoverLabel, setTakeoverLabel] = useState("user-edit-1");

  const refresh = useCallback(async () => {
    try {
      setState(await host.readState());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [host]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stageByKind = new Map<string, { stage: string; state: string; ref?: string; detail?: string }>(
    (state?.trace.stages ?? []).map((stage) => [stage.stage, stage]),
  );
  const orderedStages = STAGE_ORDER.map(
    (kind) => stageByKind.get(kind) ?? { stage: kind, state: "pending" },
  );

  const submitConsent = useCallback(
    async (decision: SportaConsentInput["decision"]) => {
      setBusy(true);
      setConsentMessage(null);
      try {
        const outcome = await host.submitConsent({
          scopes: CONSENT_SCOPES.map((scope) => scope.id) as SportaConsentInput["scopes"],
          decision,
        });
        setConsentMessage(
          outcome.outcome === "granted"
            ? `Granted — learning candidate ${outcome.detail}`
            : `Refused — ${outcome.detail}`,
        );
        await refresh();
      } catch (cause) {
        setConsentMessage(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [host, refresh],
  );

  const submitTakeover = useCallback(async () => {
    setBusy(true);
    setTakeoverMessage(null);
    try {
      const outcome: SportaTakeoverOutcome = await host.submitTakeover({ label: takeoverLabel });
      setTakeoverMessage(
        outcome.outcome === "appended"
          ? `Appended — ${outcome.detail} (revision ${outcome.revisionId ?? "?"})`
          : `Failed — ${outcome.detail}`,
      );
      await refresh();
    } catch (cause) {
      setTakeoverMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [host, refresh, takeoverLabel]);

  return (
    <main className="sporta-panel">
      <header className="sporta-header">
        <h1>Sporta — Product Loop</h1>
        <p className="sporta-subtitle">
          Live ProductLoopTrace projection · work graph{" "}
          <code>{state?.workGraphId ?? "…"}</code>
        </p>
        {state !== null ? <EvidenceBadge evidence={state.evidence} /> : null}
      </header>

      {error !== null ? (
        <p className="sporta-error" role="alert">
          {error}
        </p>
      ) : null}

      <section aria-label="Product loop stages" className="sporta-stages">
        <h2>Stages</h2>
        {state === null ? (
          <p className="sporta-loading">loading projection…</p>
        ) : (
          <ol className="sporta-stage-list">
            {orderedStages.map((stage) => (
              <StageRow key={stage.stage} stage={stage} />
            ))}
          </ol>
        )}
      </section>

      <section aria-label="Learning consent intake" className="sporta-action">
        <h2>Learning consent</h2>
        <p className="sporta-action-hint">
          Scopes: {CONSENT_SCOPES.map((scope) => scope.label).join(", ")}
        </p>
        <div className="sporta-actions">
          <button type="button" disabled={busy} onClick={() => void submitConsent("granted")}>
            Accept
          </button>
          <button type="button" disabled={busy} onClick={() => void submitConsent("denied")}>
            Decline
          </button>
        </div>
        {consentMessage !== null ? <p className="sporta-action-result">{consentMessage}</p> : null}
      </section>

      <section aria-label="Takeover entry" className="sporta-action">
        <h2>Takeover entry</h2>
        <p className="sporta-action-hint">
          Applies the user edit through the real MLT round-trip and appends the user action to
          the work graph (A17 takeover leg).
        </p>
        <div className="sporta-actions">
          <label htmlFor="sporta-takeover-label" className="sporta-label">
            Edit label
          </label>
          <input
            id="sporta-takeover-label"
            value={takeoverLabel}
            onChange={(event) => setTakeoverLabel(event.target.value)}
          />
          <button type="button" disabled={busy} onClick={() => void submitTakeover()}>
            Append user edit
          </button>
        </div>
        {takeoverMessage !== null ? (
          <p className="sporta-action-result">{takeoverMessage}</p>
        ) : null}
      </section>
    </main>
  );
}
