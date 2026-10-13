/**
 * GraphBuilderTab — the graph building + validation view (W9C-8).
 *
 * BUILD-VERIFIED/UNTESTED (the SportaPanel honesty law): compiled by
 * `pnpm exec tsc -b packages/web`; the pure view-models it consumes
 * are battery-tested (app-environments test/studioViews.test.ts).
 */
import { useCallback, useState } from "react";
import type { StudioGraphDraft, TransformStudioHostPort } from "./studioPorts.js";
import {
  assembleGraph,
  draftNode,
  draftSubmittable,
  projectValidation,
  type StudioGraphValidationView,
} from "./graphStudio.js";

export function GraphBuilderTab({
  host,
  onError,
}: {
  host: TransformStudioHostPort;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState<StudioGraphDraft>({ nodes: [], edges: [] });
  const [validation, setValidation] = useState<StudioGraphValidationView | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const result = await host.validateGraph(draft);
      setValidation(projectValidation(result));
      onError(null);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [draft, host, onError]);

  const readiness = draftSubmittable(draft);

  /** Draft one more deterministic-filter node (pure graphStudio helpers). */
  const addFilterNode = useCallback(() => {
    setDraft((current) =>
      assembleGraph([
        ...current.nodes,
        draftNode(`node:filter-${current.nodes.length + 1}`, "deterministic-filter"),
      ], current.edges),
    );
  }, []);

  return (
    <section className="studio-section" aria-label="Graph builder and validation">
      <h2>Graph builder</h2>
      <p className="studio-hint">
        Nodes are digest-pinned components (deterministic filters, scripts, models or
        approved application actions). Validation runs through the real transforms
        validation port — typed violations are shown verbatim.
      </p>
      <ul className="studio-nodelist">
        {draft.nodes.map((node) => (
          <li key={node.nodeId} className="studio-node">
            <span className="studio-node-kind">{node.kind}</span>
            <span className="studio-node-name">{node.nodeId}</span>
            <span className="studio-node-component">
              {node.componentName}
              {node.componentDigest.length > 0
                ? ` @ ${node.componentDigest.slice(0, 19)}…`
                : " (unpinned)"}
            </span>
          </li>
        ))}
        {draft.nodes.length === 0 ? (
          <li className="studio-empty">No nodes drafted yet.</li>
        ) : null}
      </ul>
      <p className="studio-hint">
        {draft.nodes.length} node(s), {draft.edges.length} edge(s).{" "}
        {readiness.submittable
          ? "Draft is submittable."
          : `Blockers: ${readiness.blockers.join("; ")}`}
      </p>
      <button type="button" className="studio-button studio-button-secondary" onClick={addFilterNode}>
        Draft a deterministic-filter node
      </button>{" "}
      <button
        type="button"
        className="studio-button"
        disabled={!readiness.submittable || busy}
        onClick={() => void submit()}
      >
        {busy ? "Validating…" : "Validate graph"}
      </button>
      {validation !== null ? <ValidationView view={validation} /> : null}
    </section>
  );
}

function ValidationView({ view }: { view: StudioGraphValidationView }) {
  if (view.valid) {
    return (
      <div className="studio-validation studio-validation-valid" role="status">
        <h3>Valid graph</h3>
        <p>
          {view.nodeCount} node(s), {view.edgeCount} edge(s) — the typed DAG passes
          validation.
        </p>
      </div>
    );
  }
  return (
    <div className="studio-validation studio-validation-invalid" role="alert">
      <h3>Invalid graph — {view.violations.length} violation(s)</h3>
      <ul className="studio-violations">
        {view.violationCounts.map((count) => (
          <li key={count.kind} className="studio-violation-chip">
            {count.kind} × {count.count}
          </li>
        ))}
      </ul>
      <ul className="studio-violations">
        {view.violations.map((violation, index) => (
          <li key={`${violation.kind}-${index}`}>
            <strong>{violation.kind}</strong>: {violation.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
