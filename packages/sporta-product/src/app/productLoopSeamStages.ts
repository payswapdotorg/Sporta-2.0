/**
 * Wave-3 read-seam stage derivations for the product loop projection:
 * the takeover, editor and learning stages (app layer — read-model
 * functions, no mutation).
 *
 * Law (ADR: docs/architecture/adr-wave3-read-seams.md):
 * - every seam is OPTIONAL: an absent seam leaves the stage's honest
 *   `pending: …` detail EXACTLY as v1 (graceful degradation — never
 *   throw, never lie);
 * - reads through the seams are bounded (capped limits, capped node-ref
 *   breadth) and read-only;
 * - v1-shaped inputs with no seams injected produce byte-identical
 *   traces (the regression law).
 *
 * Derivations:
 * - takeover/editor: editor sessions reachable from the graph's artifact
 *   lineages (the artifacts deps) or node refs (artifact-revision,
 *   editor-session), read through the editorSessionHistory seam. A
 *   revision with editor-session provenance (a reconciled edit) is DONE;
 *   an open session is ACTIVE; a closed session is DONE.
 * - learning: learning artifacts listed through the learningArtifacts
 *   seam, scoped to the intent's learning-policy scopes. A promoted
 *   artifact (seam status, or referenced by the selected PROMOTED
 *   organization version's learnedPreferences) is DONE; a candidate is
 *   ACTIVE.
 */
import type { ProductLoopStage } from "../domain/loopPorts.js";
import type {
  ArtifactRevisionRecord,
  EditorSessionSummary,
  LearningArtifactSummary,
  WorkGraphRecord,
  WorkGraphNodeRef,
} from "@sporta/contracts/contract";
import type { OrganizationSelection } from "@sporta/organizations/contract";
import type { ProductLoopProjectionDeps } from "./productLoopDeps.js";

/** The honest v1 pending strings (kept byte-identical — regression law). */
export const SEAM_TAKEOVER =
  "pending: v1 ports expose no takeover/editor-session history read seam (Wave 2 event projection)";
export const SEAM_EDITOR =
  "pending: v1 ports expose no editor-session history read seam (Wave 2 editor read port)";
export const SEAM_LEARNING =
  "pending: learning state becomes traceable when arena-result/learning read seams land (Wave 2)";

/** Bounded-read policy: limits sent to every seam query. */
export const SEAM_READ_LIMIT = 50;
/** How many artifact nodes' lineages the editor stages may inspect. */
export const ARTIFACT_BREADTH = 10;
/** Max node refs of one kind considered per stage derivation. */
export const REF_BREADTH = 16;
/** Max revisions whose sessions the editor stages may resolve. */
const REVISION_BREADTH = 50;

/** Ref ids of one kind carried by the graph's nodes (bounded, deduped). */
export function refIdsOf(
  graph: WorkGraphRecord,
  kind: WorkGraphNodeRef["kind"],
): readonly string[] {
  const ids: string[] = [];
  for (const node of graph.nodes) {
    for (const ref of node.refs ?? []) {
      if (ref.kind === kind && !ids.includes(ref.refId)) {
        ids.push(ref.refId);
        if (ids.length >= REF_BREADTH) return ids;
      }
    }
  }
  return ids;
}

/** Deduplicate items by a string key, keeping first-seen order. */
export function dedupeBy<T>(items: readonly T[], key: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = key(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * takeover + editor stages. v1 evidence note: the reconciled
 * editor-session revision proves BOTH legs (the external editor
 * round-tripped AND the user edit was reconciled) — v1 records carry no
 * actor split between them; distinguishing user takeover from
 * agent-driven editing needs ledger access typed as future.
 */
export async function takeoverEditorStages(
  deps: ProductLoopProjectionDeps,
  graph: WorkGraphRecord,
  lineages: ReadonlyMap<string, readonly ArtifactRevisionRecord[]>,
): Promise<readonly [ProductLoopStage, ProductLoopStage]> {
  const seam = deps.editorSessionHistory;
  if (seam === undefined) {
    return [
      { stage: "takeover", state: "pending", detail: SEAM_TAKEOVER },
      { stage: "editor", state: "pending", detail: SEAM_EDITOR },
    ];
  }

  const revisions: ArtifactRevisionRecord[] = [];
  for (const list of lineages.values()) revisions.push(...list);
  const revisionIds = new Set<string>(revisions.map((revision) => revision.revisionId));
  for (const refId of refIdsOf(graph, "artifact-revision")) revisionIds.add(refId);
  const editorRevisionIds = revisions
    .filter((revision) => revision.provenance?.sourceKind === "editor-session")
    .map((revision) => revision.revisionId);

  const sessions: EditorSessionSummary[] = [];
  for (const revisionId of [...revisionIds].slice(0, REVISION_BREADTH)) {
    sessions.push(...(await seam.listEditorSessions({ revisionId, limit: SEAM_READ_LIMIT })));
  }
  for (const refId of refIdsOf(graph, "editor-session")) {
    sessions.push(
      ...(await seam.listEditorSessions({ editorSessionId: refId, limit: SEAM_READ_LIMIT })),
    );
  }
  const reachable = dedupeBy(sessions, (session) => session.editorSessionId);
  const open = reachable.filter((session) => session.closedAt === undefined);

  if (editorRevisionIds.length > 0) {
    return [
      {
        stage: "takeover",
        state: "done",
        ref: editorRevisionIds.at(-1),
        detail: `${editorRevisionIds.length} user takeover revision(s) reconciled`,
      },
      {
        stage: "editor",
        state: "done",
        ref: editorRevisionIds.at(-1),
        detail: `${editorRevisionIds.length} editor revision(s) committed`,
      },
    ];
  }
  if (reachable.length === 0) {
    return [
      { stage: "takeover", state: "pending", detail: "no editor session yet" },
      { stage: "editor", state: "pending", detail: "no editor session yet" },
    ];
  }
  const shared =
    open.length > 0
      ? { state: "active" as const, detail: `${reachable.length} open editor session(s)` }
      : { state: "done" as const, detail: `${reachable.length} closed editor session(s)` };
  return [
    { stage: "takeover", ...shared },
    { stage: "editor", ...shared },
  ];
}

/**
 * learning stage: scoped learning artifacts through the seam; promotion
 * is derivable from the seam status OR from the selected (promoted)
 * organization version's learnedPreferences — the canonical record of
 * which learning was promoted into the composition.
 */
export async function learningStage(
  deps: ProductLoopProjectionDeps,
  graph: WorkGraphRecord,
  selection: OrganizationSelection,
): Promise<ProductLoopStage> {
  const seam = deps.learningArtifacts;
  if (seam === undefined) {
    return { stage: "learning", state: "pending", detail: SEAM_LEARNING };
  }

  const permitted: readonly string[] = graph.intent.learningPolicy.scopes;
  const listed = await seam.listLearningArtifacts({ limit: SEAM_READ_LIMIT });
  const byRef: LearningArtifactSummary[] = [];
  for (const refId of refIdsOf(graph, "learning-artifact")) {
    byRef.push(...(await seam.listLearningArtifacts({ learningArtifactId: refId })));
  }
  const scoped = dedupeBy([...listed, ...byRef], (summary) => summary.learningArtifactId).filter(
    (summary) => permitted.includes(summary.class),
  );
  if (scoped.length === 0) {
    return {
      stage: "learning",
      state: "pending",
      detail: "no learning artifact in policy scope yet",
    };
  }

  const promotedReferences = selection.selected.organization.learnedPreferences;
  const promoted = scoped.filter(
    (summary) =>
      summary.status === "promoted" || promotedReferences.includes(summary.learningArtifactId),
  );
  if (promoted.length > 0) {
    return {
      stage: "learning",
      state: "done",
      ref: promoted.at(-1)?.learningArtifactId,
      detail: `${promoted.length} learning artifact(s) promoted`,
    };
  }
  const candidates = scoped.filter(
    (summary) => summary.status === "candidate" || summary.status === "evaluating",
  );
  if (candidates.length > 0) {
    return {
      stage: "learning",
      state: "active",
      ref: candidates.at(-1)?.learningArtifactId,
      detail: `${candidates.length} candidate learning artifact(s)`,
    };
  }
  const rejected = scoped.filter((summary) => summary.status === "rejected");
  if (rejected.length > 0) {
    return {
      stage: "learning",
      state: "refused",
      detail: `${rejected.length} rejected learning artifact(s)`,
    };
  }
  return {
    stage: "learning",
    state: "pending",
    detail: `${scoped.length} expired learning artifact(s)`,
  };
}
