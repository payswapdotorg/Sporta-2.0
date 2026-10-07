import type { EditorHashFn } from "./ports.js";
/**
 * Pure reconcile decisions (domain layer — no IO).
 *
 * Ids are derived deterministically from (editorSessionId,
 * changedProjectHash) so retries are idempotent even without a memo; the
 * sha-256 implementation itself is injected (adapters own node:crypto).
 */

/** The shape the broker needs to decide format understanding. */
export interface EditorAdapterDescriptor {
  readonly integrationLevel: number;
  readonly knownProjectFormats: readonly string[];
}

/** A project format is understood only when an adapter declares it (level >= 2). */
export function isProjectFormatUnderstood(
  adapter: EditorAdapterDescriptor,
  projectFormat: string | undefined,
): boolean {
  return (
    projectFormat !== undefined &&
    adapter.integrationLevel >= 2 &&
    adapter.knownProjectFormats.includes(projectFormat)
  );
}

/** Deterministic ids for an understood reconcile (new revision + delta). */
export function understoodReconcileIds(
  hash: EditorHashFn,
  editorSessionId: string,
  changedProjectHash: string,
): { revisionId: string; deltaId: string } {
  const digest = hash(`reconcile\n${editorSessionId}\n${changedProjectHash}`);
  return { revisionId: `rev:reconcile:${digest}`, deltaId: `delta:reconcile:${digest}` };
}

/** Deterministic ids for an opaque import (new artifact + first revision + delta). */
export function opaqueImportIds(
  hash: EditorHashFn,
  editorSessionId: string,
  changedProjectHash: string,
): { artifactId: string; revisionId: string; deltaId: string } {
  const digest = hash(`opaque-import\n${editorSessionId}\n${changedProjectHash}`);
  return {
    artifactId: `art:opaque:${digest}`,
    revisionId: `rev:opaque:${digest}`,
    deltaId: `delta:opaque:${digest}`,
  };
}
