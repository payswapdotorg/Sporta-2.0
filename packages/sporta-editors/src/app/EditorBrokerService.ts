import type {
  EditDeltaRecord,
  EditorSessionRecord,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import {
  EditorRightsRefusalError,
  UnknownEditorError,
  UnknownEditorSessionError,
  UnknownRevisionError,
} from "../domain/errors.js";
import { serializeEditOperation } from "../domain/operations.js";
import type {
  EditorAdapterPort,
  EditorBrokerDeps,
  EditorBrokerPort,
  OpenEditorSessionInput,
  ReconcileResult,
  ReconcileSessionInput,
  ResolveEditorInput,
  EditorResolution,
} from "../domain/ports.js";
import {
  isProjectFormatUnderstood,
  opaqueImportIds,
  understoodReconcileIds,
} from "../domain/reconcile.js";
import { resolveEditorChoice } from "../domain/resolution.js";
/**
 * EditorBrokerService — the Editor Broker (fixture-grade in-memory wiring).
 *
 * Resolves editors deterministically and explainably; opens bounded
 * sessions with rights verification and a revision checkpoint; reconciles
 * changed external project state back into the artifact graph — never
 * overwriting canonical history (see SPEC.md).
 */
export class EditorBrokerService implements EditorBrokerPort {
  private readonly deps: EditorBrokerDeps;
  private nextSequence = 0;

  constructor(deps: EditorBrokerDeps) {
    this.deps = deps;
  }

  async resolveEditor(input: ResolveEditorInput): Promise<EditorResolution> {
    return resolveEditorChoice(input);
  }

  async openSession(input: OpenEditorSessionInput): Promise<EditorSessionRecord> {
    const editorSessionId = input.editorSessionId ?? this.mintId("es");
    const existing = await this.deps.sessionStore.find(editorSessionId);
    if (existing !== null) {
      // Idempotent: first write wins. The history append is itself
      // idempotent per session id, so re-opening also self-heals a
      // projection that missed the original append (e.g. a failed write).
      await this.deps.sessionHistory?.append(existing);
      return existing;
    }

    const rights = input.policy.rights;
    if (!rights.usages.includes("edit") || rights.prohibitions.includes("edit")) {
      throw new EditorRightsRefusalError(
        "policy rights do not permit editing this artifact",
        `usages=[${rights.usages.join(", ")}] prohibitions=[${rights.prohibitions.join(", ")}]`,
      );
    }
    const checkpoint = await this.deps.artifactGraph.readRevision(input.revisionId);
    if (checkpoint === null) {
      throw new UnknownRevisionError(
        `cannot open a session on unknown revision ${input.revisionId}`,
        input.revisionId,
      );
    }
    const adapter = this.adapterFor(input.editorId);

    const record: EditorSessionRecord = {
      editorSessionId,
      editorId: input.editorId,
      revisionId: input.revisionId,
      mode: input.mode,
      integrationLevel: adapter.integrationLevel,
      openedAt: this.deps.clock.now(),
      policy: input.policy,
    };
    await this.deps.sessionStore.save(record);
    await this.deps.sessionStore.advanceRevision(editorSessionId, input.revisionId);
    await this.deps.sessionHistory?.append(record);
    return record;
  }

  async reconcileSession(input: ReconcileSessionInput): Promise<ReconcileResult> {
    const memo = await this.deps.sessionStore.findReconcileResult(
      input.editorSessionId,
      input.changedProjectHash,
    );
    if (memo !== null) return memo; // idempotent: identical retry result

    const session = await this.deps.sessionStore.find(input.editorSessionId);
    if (session === null) {
      throw new UnknownEditorSessionError(
        `cannot reconcile unknown editor session ${input.editorSessionId}`,
        input.editorSessionId,
      );
    }
    const adapter = this.adapterFor(session.editorId);
    const understood = isProjectFormatUnderstood(adapter, input.projectFormat);
    const result = understood
      ? await this.reconcileUnderstood(session, adapter, input)
      : await this.reconcileOpaque(session, input);
    await this.deps.sessionStore.saveReconcileResult(
      input.editorSessionId,
      input.changedProjectHash,
      result,
    );
    return result;
  }

  private async reconcileUnderstood(
    session: EditorSessionRecord,
    adapter: EditorAdapterPort,
    input: ReconcileSessionInput,
  ): Promise<ReconcileResult> {
    const checkpoint = await this.deps.artifactGraph.readRevision(session.revisionId);
    if (checkpoint === null) {
      throw new UnknownRevisionError(
        `the session checkpoint revision ${session.revisionId} is no longer readable`,
        session.revisionId,
      );
    }
    const currentRevisionId =
      (await this.deps.sessionStore.currentRevisionId(session.editorSessionId)) ??
      session.revisionId;
    const ids = understoodReconcileIds(
      this.deps.hash,
      session.editorSessionId,
      input.changedProjectHash,
    );
    const revision = await this.deps.artifactGraph.commitRevision({
      artifactId: checkpoint.artifactId,
      revisionId: ids.revisionId,
      parentRevisionId: currentRevisionId,
      contentHash: input.changedProjectHash,
      toolVersions: [`${input.externalTool.name}@${input.externalTool.version}`],
      provenance: this.sessionProvenance(session.editorSessionId),
      policy: session.policy,
    });
    const delta: EditDeltaRecord = {
      deltaId: ids.deltaId,
      fromRevisionId: revision.parentRevisionId ?? session.revisionId,
      toRevisionId: revision.revisionId,
      editor: input.externalTool.name,
      editorVersion: input.externalTool.version,
      operations: adapter.deriveOperations(input.projectState).map(serializeEditOperation),
      provenance: this.sessionProvenance(session.editorSessionId),
    };
    await this.deps.sessionStore.advanceRevision(session.editorSessionId, revision.revisionId);
    return { revision, delta, understood: true };
  }

  private async reconcileOpaque(
    session: EditorSessionRecord,
    input: ReconcileSessionInput,
  ): Promise<ReconcileResult> {
    const ids = opaqueImportIds(this.deps.hash, session.editorSessionId, input.changedProjectHash);
    // Unknown projects become OPAQUE imported artifacts — canonical
    // history of the source artifact is never touched.
    await this.deps.artifactGraph.recordArtifact({
      artifactId: ids.artifactId,
      kind: `imported-project:${input.projectFormat ?? input.externalTool.name}`,
      editability: "opaque",
      policy: session.policy,
    });
    const revision = await this.deps.artifactGraph.commitRevision({
      artifactId: ids.artifactId,
      revisionId: ids.revisionId,
      contentHash: input.changedProjectHash,
      toolVersions: [`${input.externalTool.name}@${input.externalTool.version}`],
      provenance: this.sessionProvenance(session.editorSessionId),
      policy: session.policy,
    });
    const delta: EditDeltaRecord = {
      deltaId: ids.deltaId,
      fromRevisionId: session.revisionId,
      toRevisionId: revision.revisionId,
      editor: input.externalTool.name,
      editorVersion: input.externalTool.version,
      operations: [], // nothing granular is claimed about an unknown project
      provenance: this.sessionProvenance(session.editorSessionId),
    };
    return { revision, delta, understood: false };
  }

  private sessionProvenance(editorSessionId: SportaId): ProvenanceDescriptor {
    return {
      sourceKind: "editor-session",
      sourceRef: editorSessionId,
      capturedAt: this.deps.clock.now(),
    };
  }

  private adapterFor(editorId: string): EditorAdapterPort {
    const adapter = this.deps.adapters.find((candidate) => candidate.editorId === editorId);
    if (adapter === undefined) {
      throw new UnknownEditorError(`no registered editor adapter for "${editorId}"`, editorId);
    }
    return adapter;
  }

  private mintId(prefix: string): string {
    this.nextSequence += 1;
    return `${prefix}:${this.nextSequence}`;
  }
}
