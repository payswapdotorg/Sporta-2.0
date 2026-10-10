import type { ReconcileResult } from "../domain/ports.js";
import type { SharedSessionCloseResult } from "../domain/sharedSession/ports.js";
import type { SharedSessionRecord } from "../domain/sharedSession/session.js";
import { isPlainObject, isStringArray, parsePolicySet } from "./sharedSessionLedgerPrimitives.js";
/**
 * Close-result parsing for the shared-session ledger (adapters layer —
 * pure; split from sharedSessionLedger.ts per the file-size law).
 * Fail-closed: every violation is a typed refusal through `fail`.
 */

const LEAVE_REASONS: readonly string[] = ["left", "disconnected", "evicted", "closed"];

/** Parse + verify one close result (memo) against its session. */
export function parseCloseResult(
  value: unknown,
  session: SharedSessionRecord,
  fail: (reason: string) => never,
): SharedSessionCloseResult {
  if (!isPlainObject(value)) return fail("bad-closeResult");
  if (typeof value.closedAt !== "string") return fail("bad-closeResult-closedAt");
  if (value.sessionId !== session.sessionId) return fail("closeResult-session-mismatch");
  if (!isPlainObject(value.reconcile)) return fail("bad-closeResult-reconcile");
  const reconcile = parseReconcileResult(value.reconcile, fail);
  if (!isPlainObject(value.broadcast)) return fail("bad-closeResult-broadcast");
  const broadcast = value.broadcast;
  if (
    typeof broadcast.count !== "number" ||
    !Number.isInteger(broadcast.count) ||
    broadcast.count < 0
  ) {
    return fail("bad-closeResult-broadcast-count");
  }
  if (
    typeof broadcast.lastSequence !== "number" ||
    !Number.isInteger(broadcast.lastSequence) ||
    broadcast.lastSequence < 0
  ) {
    return fail("bad-closeResult-broadcast-lastSequence");
  }
  if (!isStringArray(broadcast.deltaIds)) return fail("bad-closeResult-broadcast-deltaIds");
  if (!Array.isArray(value.participants)) return fail("bad-closeResult-participants");
  const participants = value.participants.map((entry) => {
    if (!isPlainObject(entry)) return fail("bad-closeResult-participant");
    if (typeof entry.participantId !== "string" || typeof entry.leaveReason !== "string") {
      return fail("bad-closeResult-participant-fields");
    }
    if (!LEAVE_REASONS.includes(entry.leaveReason)) {
      return fail("bad-closeResult-participant-leaveReason");
    }
    return { participantId: entry.participantId, leaveReason: entry.leaveReason };
  });
  return {
    sessionId: session.sessionId,
    closedAt: value.closedAt,
    reconcile,
    broadcast: {
      count: broadcast.count,
      lastSequence: broadcast.lastSequence,
      deltaIds: broadcast.deltaIds,
    },
    participants,
  };
}

function parseReconcileResult(
  value: Record<string, unknown>,
  fail: (reason: string) => never,
): ReconcileResult {
  if (!isPlainObject(value.revision)) return fail("bad-closeResult-revision");
  const revision = value.revision;
  if (
    typeof revision.revisionId !== "string" ||
    typeof revision.artifactId !== "string" ||
    typeof revision.contentHash !== "string" ||
    !isStringArray(revision.toolVersions)
  ) {
    return fail("bad-closeResult-revision-fields");
  }
  if (!isPlainObject(revision.provenance)) return fail("bad-closeResult-revision-provenance");
  if (
    typeof revision.provenance.sourceKind !== "string" ||
    typeof revision.provenance.sourceRef !== "string" ||
    typeof revision.provenance.capturedAt !== "string"
  ) {
    return fail("bad-closeResult-revision-provenance-fields");
  }
  const policy = parsePolicySet(revision.policy, fail, "closeResult-revision-policy");
  if (!isPlainObject(value.delta)) return fail("bad-closeResult-delta");
  const delta = value.delta;
  if (
    typeof delta.deltaId !== "string" ||
    typeof delta.fromRevisionId !== "string" ||
    typeof delta.toRevisionId !== "string" ||
    typeof delta.editor !== "string" ||
    typeof delta.editorVersion !== "string" ||
    !isStringArray(delta.operations)
  ) {
    return fail("bad-closeResult-delta-fields");
  }
  if (!isPlainObject(delta.provenance)) return fail("bad-closeResult-delta-provenance");
  if (
    typeof delta.provenance.sourceKind !== "string" ||
    typeof delta.provenance.sourceRef !== "string" ||
    typeof delta.provenance.capturedAt !== "string"
  ) {
    return fail("bad-closeResult-delta-provenance-fields");
  }
  if (typeof value.understood !== "boolean") return fail("bad-closeResult-understood");
  return {
    revision: {
      revisionId: revision.revisionId,
      artifactId: revision.artifactId,
      ...(revision.parentRevisionId === undefined || typeof revision.parentRevisionId !== "string"
        ? {}
        : { parentRevisionId: revision.parentRevisionId }),
      contentHash: revision.contentHash,
      toolVersions: revision.toolVersions,
      provenance: {
        sourceKind: revision.provenance
          .sourceKind as ReconcileResult["revision"]["provenance"]["sourceKind"],
        sourceRef: revision.provenance.sourceRef,
        capturedAt: revision.provenance.capturedAt,
      },
      policy,
    },
    delta: {
      deltaId: delta.deltaId,
      fromRevisionId: delta.fromRevisionId,
      toRevisionId: delta.toRevisionId,
      editor: delta.editor,
      editorVersion: delta.editorVersion,
      operations: delta.operations,
      provenance: {
        sourceKind: delta.provenance
          .sourceKind as ReconcileResult["delta"]["provenance"]["sourceKind"],
        sourceRef: delta.provenance.sourceRef,
        capturedAt: delta.provenance.capturedAt,
      },
    },
    understood: value.understood,
  };
}
