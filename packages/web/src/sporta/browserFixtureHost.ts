/**
 * The browser fixture host (W4C-3) — the /sporta route's host when the
 * React surface runs in a BROWSER.
 *
 * EVIDENCE CLASS: FIXTURE, labeled in the UI itself (the evidence badge
 * renders "FIXTURE HOST"). The Node-only composition legs (real spawn,
 * real FS blob store, real localhost HTTP arena) cannot execute in a
 * browser bundle, so this host carries a static fixture trace snapshot
 * and honestly transitions its two write paths against that local
 * fixture state — the same SportaHostPort contract the real headless
 * composition implements. It imports ONLY types from the sporta
 * packages (erased at build); no Node dependency enters the bundle.
 */
import type { ProductLoopTrace } from "@sporta/product/contract";
import type {
  SportaConsentInput,
  SportaConsentOutcome,
  SportaHostPort,
  SportaHostState,
  SportaTakeoverInput,
  SportaTakeoverOutcome,
} from "./hostPorts.js";

const FIXTURE_WORK_GRAPH_ID = "wg:sporta-browser-fixture";

function fixtureTrace(opts: { consented: boolean; takenOver: boolean }): ProductLoopTrace {
  const stages: ProductLoopTrace["stages"] = [
    { stage: "intent", state: "done", ref: FIXTURE_WORK_GRAPH_ID },
    { stage: "organization", state: "done", ref: "org:fixture@v1", detail: "fixture rationale" },
    { stage: "execution", state: "done", detail: "1 outcome(s)" },
    { stage: "progress", state: "done", detail: "fixture: 1 task, 1 run, 2 action(s)" },
    {
      stage: "artifact",
      state: "done",
      ref: "art:fixture",
      detail: opts.takenOver ? "2 revision(s)" : "1 revision(s)",
    },
    {
      stage: "takeover",
      state: opts.takenOver ? "done" : "pending",
      detail: opts.takenOver
        ? "1 user takeover revision(s) reconciled"
        : "no editor session yet",
    },
    {
      stage: "editor",
      state: opts.takenOver ? "done" : "pending",
      detail: opts.takenOver ? "1 editor revision(s) committed" : "no editor session yet",
    },
    {
      stage: "learning",
      state: opts.consented ? "active" : "pending",
      detail: opts.consented
        ? "1 learning artifact(s) (candidate)"
        : "no learning artifact recorded yet",
    },
    { stage: "capability-gap", state: "done", detail: "work graph status: escalated" },
    { stage: "arena", state: "done", ref: "esc:fixture", detail: "escalation concluded (closed)" },
    { stage: "result", state: "done", ref: "res:fixture", detail: "1 validated result(s)" },
    {
      stage: "organization-improvement",
      state: "pending",
      detail: "no organization candidate yet",
    },
  ];
  return { workGraphId: FIXTURE_WORK_GRAPH_ID, stages };
}

/** The labeled fixture host for the browser route (see file header). */
export function createBrowserFixtureHost(): SportaHostPort {
  const state = { consented: false, takenOver: false };
  return {
    async readState(): Promise<SportaHostState> {
      return {
        workGraphId: FIXTURE_WORK_GRAPH_ID,
        trace: fixtureTrace(state),
        evidence: "fixture",
      };
    },
    async submitConsent(input: SportaConsentInput): Promise<SportaConsentOutcome> {
      if (input.decision === "denied") {
        return {
          outcome: "refused",
          detail: "fixture: learning consent denied — no artifact created (typed refusal)",
        };
      }
      state.consented = true;
      return { outcome: "granted", detail: "learn:fixture:consent-1" };
    },
    async submitTakeover(input: SportaTakeoverInput): Promise<SportaTakeoverOutcome> {
      state.takenOver = true;
      return {
        outcome: "appended",
        detail: `fixture: user edit "${input.label}" appended`,
        revisionId: "rev:fixture-2",
      };
    },
  };
}
