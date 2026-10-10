import type {
  OrderedSharedDelta,
  SharedSessionCoordination,
} from "../domain/sharedSession/coordination.js";
import { SharedSessionIntegrityError } from "../domain/sharedSession/errors.js";
import type { SharedSessionCloseResult } from "../domain/sharedSession/ports.js";
import type { ParticipantPresence } from "../domain/sharedSession/presence.js";
import type {
  SharedSessionLeaveReason,
  SharedSessionParticipant,
  SharedSessionRecord,
} from "../domain/sharedSession/session.js";
import { parseCloseResult } from "./sharedSessionCloseLedger.js";
import { isPlainObject, isStringArray, parsePolicySet } from "./sharedSessionLedgerPrimitives.js";
/**
 * Shared-session ledger parse/serialize helpers (adapters layer — pure
 * transforms over already-read bytes; the FS store owns the IO).
 *
 * Validation is fail-closed: any missing field, wrong type, bad enum or
 * id/address mismatch is a typed `SharedSessionIntegrityError`, never
 * silent corruption.
 */

/** The on-disk shape: one file per session holds ALL of its state. */
export interface SharedSessionLedger {
  readonly session: SharedSessionRecord;
  /** Absent only transiently (between the open's two saves). */
  readonly coordination?: SharedSessionCoordination;
  readonly closeResult?: SharedSessionCloseResult;
}

const LEAVE_REASONS: readonly string[] = ["left", "disconnected", "evicted", "closed"];
const PRESENCE_STATES: readonly string[] = ["live", "left"];
const SESSION_STATES: readonly string[] = ["open", "closed"];

/** Serialize one ledger file (pretty JSON + trailing newline). */
export function serializeSharedSessionLedger(ledger: SharedSessionLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

/**
 * Parse + integrity-verify one ledger file. `expectedIdHash` is the
 * sha-256 the file's own address carries; the parsed session id must
 * hash back to it (id-address law).
 */
export function parseSharedSessionLedger(
  source: string,
  expectedIdHash: string,
  recordPath: string,
  hash: (input: string) => string,
): SharedSessionLedger {
  const where = recordPath.split(/[\\/]/).pop() ?? recordPath;
  const fail = (reason: string): never => {
    throw new SharedSessionIntegrityError(
      `shared-session ledger entry ${recordPath} failed integrity checks (${reason})`,
      `${where}:${reason}`,
    );
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return fail("not-json");
  }
  if (!isPlainObject(parsed)) return fail("not-an-object");
  if (!isPlainObject(parsed.session)) return fail("missing-session");
  if (parsed.coordination !== undefined && !isPlainObject(parsed.coordination)) {
    return fail("bad-coordination");
  }

  const session = parseSession(parsed.session, fail, (id) => hash(id) === expectedIdHash);
  const coordination =
    parsed.coordination === undefined
      ? undefined
      : parseCoordination(parsed.coordination, session, fail);
  const closeResult =
    parsed.closeResult === undefined
      ? undefined
      : parseCloseResult(parsed.closeResult, session, fail);
  return {
    session,
    ...(coordination === undefined ? {} : { coordination }),
    ...(closeResult === undefined ? {} : { closeResult }),
  };
}

function parseSession(
  parsed: Record<string, unknown>,
  fail: (reason: string) => never,
  idHashesBack: (id: string) => boolean,
): SharedSessionRecord {
  if (typeof parsed.sessionId !== "string") return fail("missing-sessionId");
  if (!idHashesBack(parsed.sessionId)) return fail("id-address-mismatch");
  if (parsed.integrationLevel !== 3) return fail("bad-integrationLevel");
  if (!SESSION_STATES.includes(parsed.state as string)) return fail("bad-state");
  if (typeof parsed.openedAt !== "string") return fail("missing-openedAt");
  if (parsed.closedAt !== undefined && typeof parsed.closedAt !== "string") {
    return fail("bad-closedAt");
  }
  if (!isPlainObject(parsed.resolution)) return fail("missing-resolution");
  const resolution = parsed.resolution;
  if (typeof resolution.editorId !== "string") return fail("bad-resolution-editorId");
  if (
    resolution.integrationLevel !== 1 &&
    resolution.integrationLevel !== 2 &&
    resolution.integrationLevel !== 3
  ) {
    return fail("bad-resolution-integrationLevel");
  }
  if (typeof resolution.rationale !== "string") return fail("bad-resolution-rationale");
  if (typeof parsed.underlyingEditorSessionId !== "string") {
    return fail("missing-underlyingEditorSessionId");
  }
  if (!isPlainObject(parsed.artifactRef)) return fail("missing-artifactRef");
  const artifactRef = parsed.artifactRef;
  if (
    typeof artifactRef.artifactId !== "string" ||
    typeof artifactRef.checkpointRevisionId !== "string" ||
    typeof artifactRef.checkpointContentHash !== "string"
  ) {
    return fail("bad-artifactRef");
  }
  if (!isPlainObject(parsed.admission)) return fail("missing-admission");
  const admission = parsed.admission;
  if (typeof admission.checkpointRevisionId !== "string") return fail("bad-admission-revision");
  const policy = parsePolicySet(admission.policy, fail, "admission-policy");
  if (!Array.isArray(parsed.participants)) return fail("missing-participants");
  const participants = parsed.participants.map((entry) => parseParticipant(entry, fail));
  if (!Array.isArray(parsed.presence)) return fail("missing-presence");
  const presence = parsed.presence.map((entry) => parsePresenceEntry(entry, fail));
  return {
    sessionId: parsed.sessionId,
    integrationLevel: 3,
    state: parsed.state as SharedSessionRecord["state"],
    openedAt: parsed.openedAt,
    ...(parsed.closedAt === undefined ? {} : { closedAt: parsed.closedAt }),
    resolution: {
      editorId: resolution.editorId,
      integrationLevel: resolution.integrationLevel as 1 | 2 | 3,
      rationale: resolution.rationale,
    },
    underlyingEditorSessionId: parsed.underlyingEditorSessionId,
    artifactRef: {
      artifactId: artifactRef.artifactId,
      checkpointRevisionId: artifactRef.checkpointRevisionId,
      checkpointContentHash: artifactRef.checkpointContentHash,
    },
    admission: { checkpointRevisionId: admission.checkpointRevisionId, policy },
    participants,
    presence,
  };
}

function parseParticipant(
  value: unknown,
  fail: (reason: string) => never,
): SharedSessionParticipant {
  if (!isPlainObject(value)) return fail("bad-participant");
  if (typeof value.participantId !== "string") return fail("bad-participant-id");
  if (typeof value.admittedAt !== "string") return fail("bad-participant-admittedAt");
  if (!isStringArray(value.capabilities)) return fail("bad-participant-capabilities");
  if (!isPlainObject(value.usage) || !isStringArray(value.usage.usages)) {
    return fail("bad-participant-usage");
  }
  if (!isStringArray(value.effectiveUsages)) return fail("bad-participant-effectiveUsages");
  if (!isPlainObject(value.admission) || typeof value.admission.checkpointRevisionId !== "string") {
    return fail("bad-participant-admission");
  }
  if (value.leftAt !== undefined && typeof value.leftAt !== "string") {
    return fail("bad-participant-leftAt");
  }
  if (value.leaveReason !== undefined && !LEAVE_REASONS.includes(value.leaveReason as string)) {
    return fail("bad-participant-leaveReason");
  }
  return {
    participantId: value.participantId,
    admittedAt: value.admittedAt,
    capabilities: value.capabilities,
    usage: { usages: value.usage.usages },
    effectiveUsages: value.effectiveUsages,
    admission: { checkpointRevisionId: value.admission.checkpointRevisionId },
    ...(value.leftAt === undefined ? {} : { leftAt: value.leftAt }),
    ...(value.leaveReason === undefined
      ? {}
      : { leaveReason: value.leaveReason as SharedSessionLeaveReason }),
  };
}

function parsePresenceEntry(value: unknown, fail: (reason: string) => never): ParticipantPresence {
  if (!isPlainObject(value)) return fail("bad-presence");
  if (typeof value.participantId !== "string") return fail("bad-presence-id");
  if (!isStringArray(value.capabilities)) return fail("bad-presence-capabilities");
  if (typeof value.joinedAt !== "string") return fail("bad-presence-joinedAt");
  if (typeof value.lastHeartbeatAt !== "string") return fail("bad-presence-lastHeartbeatAt");
  if (!PRESENCE_STATES.includes(value.state as string)) return fail("bad-presence-state");
  return {
    participantId: value.participantId,
    capabilities: value.capabilities,
    joinedAt: value.joinedAt,
    lastHeartbeatAt: value.lastHeartbeatAt,
    state: value.state as ParticipantPresence["state"],
  };
}

function parseCoordination(
  parsed: Record<string, unknown>,
  session: SharedSessionRecord,
  fail: (reason: string) => never,
): SharedSessionCoordination {
  if (parsed.sessionId !== session.sessionId) return fail("coordination-session-mismatch");
  if (typeof parsed.headRevisionId !== "string") return fail("bad-coordination-head");
  if (
    typeof parsed.lastSequence !== "number" ||
    !Number.isInteger(parsed.lastSequence) ||
    parsed.lastSequence < 0
  ) {
    return fail("bad-coordination-lastSequence");
  }
  if (!Array.isArray(parsed.log)) return fail("missing-coordination-log");
  const log: OrderedSharedDelta[] = parsed.log.map((entry) => {
    if (!isPlainObject(entry)) return fail("bad-log-entry");
    if (
      typeof entry.sequence !== "number" ||
      !Number.isInteger(entry.sequence) ||
      entry.sequence < 1
    ) {
      return fail("bad-log-sequence");
    }
    if (
      typeof entry.deltaId !== "string" ||
      typeof entry.participantId !== "string" ||
      typeof entry.baseRevisionId !== "string" ||
      typeof entry.deliveredAt !== "string" ||
      !isStringArray(entry.operations)
    ) {
      return fail("bad-log-entry-fields");
    }
    return {
      sequence: entry.sequence,
      deltaId: entry.deltaId,
      participantId: entry.participantId,
      baseRevisionId: entry.baseRevisionId,
      operations: entry.operations,
      deliveredAt: entry.deliveredAt,
    };
  });
  return {
    sessionId: session.sessionId,
    headRevisionId: parsed.headRevisionId,
    lastSequence: parsed.lastSequence,
    log,
  };
}
