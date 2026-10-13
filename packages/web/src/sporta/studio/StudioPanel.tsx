/**
 * StudioPanel — the React render surface of the Transform Studio
 * (W9C-6; SPEC "Transform Studio UX").
 *
 * EVIDENCE CLASS (the UI honesty law): BUILD-VERIFIED/UNTESTED —
 * `tsc -b packages/web` compiles it; no browser test harness exists in
 * this repo and none is claimed. The component renders whatever the
 * injected `StudioHostPort` reports — REAL state when the headless
 * composition drives it (the tests assert the flows), and
 * honestly-labeled FIXTURE state on a browser route
 * (studioFixtureHost.ts), because the Node-only composition legs
 * (spawn/FS) cannot execute in a browser bundle.
 *
 * Surface law: read-only state rendering + the typed write paths (graph
 * edits, validation, preview, launch selection/execution, app
 * attach/amend/revoke/learning-consent/act). Presentational sections
 * live in studioPanelSections.tsx; this file owns the interaction shell.
 */
import { useCallback, useEffect, useState } from "react";
import type { StudioGraphEdit, StudioHostPort, StudioState } from "./studioPorts.js";
import {
  AppsSection,
  GraphSection,
  LaunchSection,
  MarketplaceSection,
  PreviewSection,
  ValidationSection,
} from "./studioPanelSections.js";
import { studioSampleFeedBytes } from "./studioSampleFeed.js";
import "../sportaPanel.css";

function EvidenceBadge({ evidence }: { evidence: string }) {
  return (
    <span className={`sporta-evidence sporta-evidence-${evidence}`}>
      {evidence === "real" ? "REAL HOST" : "FIXTURE HOST (browser demo)"}
    </span>
  );
}

export function StudioPanel({ host }: { host: StudioHostPort }) {
  const [state, setState] = useState<StudioState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [actionPayload, setActionPayload] = useState("post-match recovery notes");
  const [rightsSatisfied, setRightsSatisfied] = useState(true);

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

  const run = useCallback(
    async (label: string, action: () => Promise<StudioState | null>) => {
      setBusy(true);
      setNote(null);
      try {
        const next = await action();
        if (next !== null) setState(next);
        setNote(`${label} — done`);
      } catch (cause) {
        setNote(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const edit = (change: StudioGraphEdit) =>
    run(`graph edit ${change.kind}`, () => host.applyGraphEdit(change));

  const attached = state?.apps.attached[0] ?? null;
  const lastAction = (state as { lastActionResult?: unknown } | null)?.lastActionResult as
    | { admission: { admitted: boolean; reason?: string; detail: string }; record: { status: string } }
    | undefined;
  const rights = rightsSatisfied ? ["authorized source footage"] : [];

  return (
    <main className="sporta-panel">
      <header className="sporta-header">
        <h1>Sporta — Transform Studio</h1>
        <p className="sporta-subtitle">
          Graph building · validation · sample preview · marketplace · launch · attached apps
        </p>
        {state !== null ? <EvidenceBadge evidence={state.evidence} /> : null}
      </header>

      {error !== null ? (
        <p className="sporta-error" role="alert">
          {error}
        </p>
      ) : null}
      {note !== null ? <p className="sporta-action-result">{note}</p> : null}

      <GraphSection state={state} />
      <div className="sporta-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void edit({ kind: "add-node", component: "json-event-stream-trim" })}
        >
          + trim node
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void edit({ kind: "add-node", component: "fixture-event-summer" })}
        >
          + model node (fixture)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void edit({ kind: "remove-node", nodeId: "node:trim" })}
        >
          − trim node
        </button>
        <button type="button" disabled={busy} onClick={() => void edit({ kind: "reset" })}>
          reset
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("validate", () => host.validateGraph())}
        >
          Validate graph
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("preview", () => host.previewSample({ feedBytes: studioSampleFeedBytes() }))}
        >
          Preview sample feed
        </button>
      </div>

      <ValidationSection state={state} />
      <PreviewSection state={state} />
      <MarketplaceSection state={state} />

      <label htmlFor="studio-rights" className="sporta-label">
        <input
          id="studio-rights"
          type="checkbox"
          checked={rightsSatisfied}
          onChange={(event) => setRightsSatisfied(event.target.checked)}
        />{" "}
        rights prerequisites satisfied (authorized source footage)
      </label>
      <div className="sporta-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("select for launch", () =>
              host.selectForLaunch({ feedKind: "prerecorded", rightsSatisfied: rights }),
            )
          }
        >
          Select for launch (prerecorded)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("launch", () =>
              host.launchSelectedPipeline({ feedBytes: studioSampleFeedBytes(), rightsSatisfied: rights }),
            )
          }
        >
          Launch selected pipeline
        </button>
      </div>
      <LaunchSection state={state} />

      <AppsSection state={state} />
      <div className="sporta-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("attach (observe only)", () =>
              host.attachApp({
                grantedClasses: ["observe"],
                consentedBy: "user:studio-demo",
                expiresAt: "2026-10-14T00:00:00.000Z",
              }),
            )
          }
        >
          Attach — grant observe only
        </button>
        {attached !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("amend grant (+control)", () =>
                host.amendAppGrant({
                  attachmentId: attached.attachment.attachmentId,
                  grantedClasses: ["observe", "control"],
                  consentedBy: "user:studio-demo",
                }),
              )
            }
          >
            Re-consent — add control
          </button>
        ) : null}
        {attached !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("revoke", () =>
                host.revokeAppAttachment({ attachmentId: attached.attachment.attachmentId }),
              )
            }
          >
            Revoke attachment
          </button>
        ) : null}
        {attached !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("learning consent", () =>
                host.grantLearningConsent({
                  attachmentId: attached.attachment.attachmentId,
                  scope: "workflow",
                  retention: "90d",
                }),
              )
            }
          >
            Grant learning consent (separate)
          </button>
        ) : null}
      </div>
      {attached !== null ? (
        <div className="sporta-actions">
          <label htmlFor="studio-action-payload" className="sporta-label">
            action payload
          </label>
          <input
            id="studio-action-payload"
            value={actionPayload}
            onChange={(event) => setActionPayload(event.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("app action (observe)", () =>
                host.executeAppAction({ capabilityId: "cap:read-journal" }),
              )
            }
          >
            Observe journal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("app action (control)", () =>
                host.executeAppAction({ capabilityId: "cap:append-note", payload: actionPayload }),
              )
            }
          >
            Append note (control)
          </button>
        </div>
      ) : null}
      {lastAction !== undefined ? (
        <p className="sporta-action-result">
          last action: {lastAction.record.status} —{" "}
          {lastAction.admission.admitted
            ? "admitted"
            : `refused (${lastAction.admission.reason ?? "?"}): ${lastAction.admission.detail}`}
        </p>
      ) : null}
    </main>
  );
}
