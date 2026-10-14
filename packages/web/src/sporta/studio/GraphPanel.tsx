/**
 * GraphPanel — the main work area (W11B-1/2): pipeline graph drafting
 * + validation. Node drafting carries a DECLARED component-digest
 * input (the draft declares its identity; validation verifies it —
 * an empty digest honestly yields the typed unpinned-component
 * violation). Validation runs through `host.validateGraph` (the REAL
 * transforms validation port when the headless composition drives the
 * studio; the labeled fixture checks in the browser demo) and the
 * typed per-violation records surface VERBATIM — never stringly,
 * never swallowed.
 */
import { useCallback, useState } from "react";
import type { StudioGraphDraft, StudioPortSpec, TransformStudioHostPort } from "./studioPorts.js";
import {
  assembleGraph,
  draftEdge,
  draftNode,
  draftSubmittable,
  portsCompatible,
  projectValidation,
  STUDIO_VIOLATION_LABELS,
  type StudioGraphValidationView,
} from "./graphStudio.js";

const STREAM_PORT: StudioPortSpec = {
  name: "events",
  dataKind: "sporta/json-event-stream",
  required: true,
  cardinality: "stream",
};

function ValidationView({ view }: { view: StudioGraphValidationView }) {
  if (view.valid) {
    return (
      <div className="studio-validation studio-validation-valid" role="status">
        <h4>Valid graph</h4>
        <p>
          {String(view.nodeCount)} node(s), {String(view.edgeCount)} edge(s) — the typed DAG passes
          validation.
        </p>
      </div>
    );
  }
  return (
    <div className="studio-validation studio-validation-invalid" role="alert">
      <h4>Invalid graph — {String(view.violations.length)} violation(s)</h4>
      <ul className="studio-chip-row">
        {view.violationCounts.map((count) => (
          <li key={count.kind} className="studio-chip">
            {STUDIO_VIOLATION_LABELS[count.kind] ?? count.kind} × {String(count.count)}
          </li>
        ))}
      </ul>
      <ul className="studio-violation-list">
        {view.violations.map((violation, index) => (
          <li key={`${violation.kind}-${String(index)}`}>
            <strong>{violation.kind}</strong>: {violation.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GraphPanel({ host }: { host: TransformStudioHostPort }) {
  const [draft, setDraft] = useState<StudioGraphDraft>({ nodes: [], edges: [] });
  const [declaredDigest, setDeclaredDigest] = useState("");
  const [validation, setValidation] = useState<StudioGraphValidationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readiness = draftSubmittable(draft);

  const addNode = useCallback(() => {
    setDraft((current) =>
      assembleGraph(
        [
          ...current.nodes,
          draftNode(`node:filter-${String(current.nodes.length + 1)}`, "deterministic-filter", {
            componentName: "declared deterministic filter",
            componentDigest: declaredDigest.trim(),
            inputs: [STREAM_PORT],
            outputs: [STREAM_PORT],
          }),
        ],
        current.edges,
      ),
    );
    setDeclaredDigest("");
  }, [declaredDigest]);

  const connectLastPorts = useCallback(() => {
    setDraft((current) => {
      if (current.nodes.length < 2) return current;
      const from = current.nodes[current.nodes.length - 2];
      const to = current.nodes[current.nodes.length - 1];
      const fromPort = from?.outputs[0];
      const toPort = to?.inputs[0];
      if (from === undefined || to === undefined || fromPort === undefined || toPort === undefined) {
        return current;
      }
      return assembleGraph(current.nodes, [
        ...current.edges,
        draftEdge({ nodeId: from.nodeId, port: fromPort.name }, { nodeId: to.nodeId, port: toPort.name }),
      ]);
    });
  }, []);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await host.validateGraph(draft);
      setValidation(projectValidation(result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [draft, host]);

  const lastPairCompatible = (() => {
    if (draft.nodes.length < 2) return null;
    const from = draft.nodes[draft.nodes.length - 2];
    const to = draft.nodes[draft.nodes.length - 1];
    const fromPort = from?.outputs[0];
    const toPort = to?.inputs[0];
    if (from === undefined || to === undefined || fromPort === undefined || toPort === undefined) {
      return null;
    }
    return portsCompatible(fromPort, toPort);
  })();

  return (
    <section className="studio-graph" aria-label="Pipeline graph work area">
      <div className="studio-graph-head">
        <h3>Pipeline graph</h3>
        <p className="studio-hint">
          Draft nodes and edges, then validate through the real transforms validation port — typed
          violations are shown verbatim. Digests are declared identities: validation checks them
          fail-closed, marketplace review pins the approved release.
        </p>
      </div>
      <ul className="studio-nodelist">
        {draft.nodes.map((node) => (
          <li key={node.nodeId} className="studio-node">
            <span className="studio-node-kind">{node.kind}</span>
            <span className="studio-node-name">{node.nodeId}</span>
            <span className="studio-node-component">
              {node.componentName}
              {node.componentDigest.length > 0 ? ` @ ${node.componentDigest.slice(0, 19)}…` : " (unpinned)"}
            </span>
          </li>
        ))}
        {draft.edges.map((edge, index) => (
          <li key={`edge-${String(index)}`} className="studio-edge">
            {edge.from.nodeId}:{edge.from.port} → {edge.to.nodeId}:{edge.to.port}
            {lastPairCompatible === false ? " (dataKind hint: mismatch — the validator decides)" : ""}
          </li>
        ))}
        {draft.nodes.length === 0 ? <li className="studio-empty">No nodes drafted yet.</li> : null}
      </ul>
      <div className="studio-graph-actions">
        <label className="studio-field">
          <span>Component digest (declared, optional)</span>
          <input
            type="text"
            value={declaredDigest}
            placeholder="sha256:…"
            onChange={(event) => setDeclaredDigest(event.target.value)}
          />
        </label>
        <button type="button" className="studio-button studio-button-secondary" onClick={addNode}>
          Draft a filter node
        </button>
        <button
          type="button"
          className="studio-button studio-button-secondary"
          disabled={draft.nodes.length < 2}
          onClick={connectLastPorts}
        >
          Connect last two nodes
        </button>
        <button
          type="button"
          className="studio-button"
          disabled={!readiness.submittable || busy}
          onClick={() => void submit()}
        >
          {busy ? "Validating…" : "Validate graph"}
        </button>
      </div>
      <p className="studio-hint">
        {String(draft.nodes.length)} node(s), {String(draft.edges.length)} edge(s).{" "}
        {readiness.submittable
          ? "Draft is submittable."
          : `Blockers: ${readiness.blockers.join("; ")}`}
      </p>
      {error !== null ? (
        <p className="studio-refusal" role="alert">
          Validation failed to run: {error}
        </p>
      ) : null}
      {validation !== null ? <ValidationView view={validation} /> : null}
    </section>
  );
}
