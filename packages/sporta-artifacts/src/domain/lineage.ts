import type { ArtifactRevisionRecord, SportaId } from "@sporta/contracts/contract";
/**
 * Pure revision-lineage semantics (domain layer — no IO).
 *
 * Lineage per artifact is an ordered chain: one root (no parent), one
 * head, at most one child per parent. The graph service maintains this
 * by construction; these functions validate and walk the chain.
 */

/** Why a parent-chain validation failed. */
export type ParentRefusalReason =
  | "artifact-has-revisions"
  | "parent-not-found"
  | "parent-foreign-artifact"
  | "parent-already-has-child";

/** Result of a parent-chain validation. */
export type ParentCheck = { ok: true } | { ok: false; reason: ParentRefusalReason };

/**
 * Index over the known revisions for one artifact's lineage.
 *
 * `byId` covers every revision provided (across artifacts) so that a
 * parent referencing another artifact is distinguishable from a parent
 * that does not exist at all; the chain fields cover only the artifact
 * under inspection.
 */
export interface LineageIndex {
  /** The artifact this index was built for. */
  readonly artifactId: SportaId;
  readonly byId: ReadonlyMap<SportaId, ArtifactRevisionRecord>;
  /** parent revision id -> its single child revision id (this artifact). */
  readonly childOf: ReadonlyMap<SportaId, SportaId>;
  readonly rootId: SportaId | null;
  readonly headId: SportaId | null;
}

/**
 * Build a lineage index for one artifact from the known revisions.
 * Chain order of the input does not matter.
 */
export function buildLineageIndex(
  artifactId: SportaId,
  revisions: readonly ArtifactRevisionRecord[],
): LineageIndex {
  const byId = new Map<SportaId, ArtifactRevisionRecord>();
  for (const revision of revisions) byId.set(revision.revisionId, revision);

  const childOf = new Map<SportaId, SportaId>();
  let rootId: SportaId | null = null;
  let headId: SportaId | null = null;
  for (const revision of revisions) {
    if (revision.artifactId !== artifactId) continue;
    if (revision.parentRevisionId === undefined) {
      if (rootId === null) rootId = revision.revisionId;
    } else {
      childOf.set(revision.parentRevisionId, revision.revisionId);
    }
    headId = revision.revisionId;
  }
  return { artifactId, byId, childOf, rootId, headId };
}

/**
 * Validate a commit's parent reference against the current chain.
 *
 * - parent absent is legal only for the FIRST revision;
 * - parent must exist (across all artifacts) and belong to the SAME
 *   artifact;
 * - the parent must not already have a child (lineage is a chain — no
 *   silent forks).
 */
export function checkParent(
  index: LineageIndex,
  artifactId: SportaId,
  parentRevisionId: SportaId | undefined,
): ParentCheck {
  if (parentRevisionId === undefined) {
    if (index.rootId !== null) return { ok: false, reason: "artifact-has-revisions" };
    return { ok: true };
  }
  const parent = index.byId.get(parentRevisionId);
  if (parent === undefined) return { ok: false, reason: "parent-not-found" };
  if (parent.artifactId !== artifactId) {
    return { ok: false, reason: "parent-foreign-artifact" };
  }
  if (index.childOf.has(parentRevisionId)) {
    return { ok: false, reason: "parent-already-has-child" };
  }
  return { ok: true };
}

/** Revisions of the artifact in chain order (root -> head). */
export function chainOrder(index: LineageIndex): ArtifactRevisionRecord[] {
  const ordered: ArtifactRevisionRecord[] = [];
  let currentId = index.rootId;
  while (currentId !== null) {
    const revision = index.byId.get(currentId);
    if (revision === undefined || revision.artifactId !== index.artifactId) break;
    ordered.push(revision);
    const child = index.childOf.get(currentId);
    currentId = child ?? null;
  }
  return ordered;
}
