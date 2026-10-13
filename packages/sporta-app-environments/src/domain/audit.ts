/**
 * Action audit laws (domain — pure, W9C-5).
 *
 * The ApplicationActionRecord is the durable, sanitized evidence of
 * one allowed or denied action: actor/capability/target, sanitized
 * input/output REFERENCES (never payloads or secrets — P9-21), the
 * permission decision trail, verified effects only from real
 * before/after evidence, reconciled lineage refs only from the sink
 * result, and an explicit note whenever event coverage is missing
 * (never silent). The store is append-only: ids are unique forever.
 */
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type {
  ApplicationActionRecord,
  ApplicationActionAdmissionResult,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import { ApplicationActionError } from "./errors.js";
import type {
  ApplicationCapabilityInvocationResult,
  ApplicationEffectSinkResult,
} from "./ports.js";

/** Permission-decision basis the admission reasons map onto. */
export type ApplicationPermissionBasis =
  | "granted-scope"
  | "not-granted"
  | "revoked"
  | "expired"
  | "requires-confirmation";

/** Map a typed admission refusal onto the frozen decision basis. */
export function permissionBasisFor(
  admission: ApplicationActionAdmissionResult,
): ApplicationPermissionBasis {
  if (admission.admitted) {
    return admission.requiresConfirmation ? "requires-confirmation" : "granted-scope";
  }
  switch (admission.reason) {
    case "attachment-revoked":
      return "revoked";
    case "attachment-expired":
      return "expired";
    default:
      return "not-granted";
  }
}

/** Build a DENIED action record (the typed refusal is the evidence). */
export function buildDeniedActionRecord(input: {
  actionRecordId: SportaId;
  session: ApplicationSession;
  actor: string;
  capabilityId: string;
  /** Declared class when resolvable; the neutral default otherwise. */
  capabilityClass: ApplicationActionRecord["capabilityClass"];
  targetIdentity: string;
  /** The admission outcome being recorded (refusal or confirmation gate). */
  admission: ApplicationActionAdmissionResult;
  recordedAt: Iso8601;
}): ApplicationActionRecord {
  const note = !input.admission.admitted
    ? `admission refused: ${input.admission.reason} — ${input.admission.detail}`
    : input.admission.requiresConfirmation
      ? `confirmation required (class: ${input.admission.confirmationClass}) — the action was not executed`
      : "admitted without execution — the action was not executed";
  return {
    actionRecordId: input.actionRecordId,
    sessionId: input.session.sessionId,
    actor: input.actor,
    capabilityId: input.capabilityId,
    capabilityClass: input.capabilityClass,
    targetIdentity: input.targetIdentity,
    sanitizedInputRefs: [],
    sanitizedOutputRefs: [],
    permissionDecision: {
      decision: "denied",
      basis: permissionBasisFor(input.admission),
      decidedBy: "app-action-admission",
    },
    effects: [],
    status: "denied",
    reconciledRefs: { workGraphId: null, artifactRevisionIds: [] },
    recordedAt: input.recordedAt,
    missingCoverageNote: note,
  };
}

/**
 * Build an EXECUTED action record from the invocation outcome. The
 * honest-status law: only a "succeeded" invocation with a VERIFIED
 * effect yields status "succeeded"; failed and disconnected
 * invocations record "failed" with an explicit missing-coverage note
 * (a disconnected app is never successful — P9-19).
 */
export function buildExecutedActionRecord(input: {
  actionRecordId: SportaId;
  session: ApplicationSession;
  actor: string;
  capabilityId: string;
  capabilityClass: ApplicationActionRecord["capabilityClass"];
  targetIdentity: string;
  sanitizedInputRefs: readonly string[];
  invocation: ApplicationCapabilityInvocationResult;
  verified: boolean;
  verificationNote: string;
  reconciliation: ApplicationEffectSinkResult | null;
  recordedAt: Iso8601;
}): ApplicationActionRecord {
  const succeeded = input.invocation.status === "succeeded" && input.verified;
  const sanitizedOutputRefs =
    input.invocation.status === "succeeded" ? [...input.invocation.sanitizedOutputRefs] : [];
  const effects: ApplicationActionRecord["effects"] =
    input.invocation.status === "succeeded" && input.invocation.effect !== null
      ? [
          {
            kind: input.invocation.effect.kind,
            evidenceRef: sanitizedOutputRefs[0] ?? `effect:${input.actionRecordId}`,
            verified: input.verified,
          },
        ]
      : [];
  const missingCoverageNote = succeeded
    ? null
    : input.invocation.status === "disconnected"
      ? `target disconnected — ${input.invocation.detail} (a disconnected app is never reported successful)`
      : input.invocation.status === "failed"
        ? `invocation failed (${input.invocation.failureKind}) — ${input.invocation.detail}`
        : input.verificationNote;
  return {
    actionRecordId: input.actionRecordId,
    sessionId: input.session.sessionId,
    actor: input.actor,
    capabilityId: input.capabilityId,
    capabilityClass: input.capabilityClass,
    targetIdentity: input.targetIdentity,
    sanitizedInputRefs: [...input.sanitizedInputRefs],
    sanitizedOutputRefs,
    permissionDecision: {
      decision: "allowed",
      basis: "granted-scope",
      decidedBy: "app-action-admission",
    },
    effects,
    status: succeeded ? "succeeded" : "failed",
    reconciledRefs: {
      workGraphId: input.reconciliation === null ? null : input.reconciliation.workGraphId,
      artifactRevisionIds:
        input.reconciliation === null ? [] : [input.reconciliation.revisionId],
    },
    recordedAt: input.recordedAt,
    missingCoverageNote,
  };
}

/**
 * Sanitize an action request into input REFERENCES: content-hashed,
 * length-capped identifiers — never raw payloads, never secrets
 * (P9-21). Used for both the audit record and the tool endpoint.
 */
export function sanitizeInputRefs(
  parameters: Readonly<Record<string, unknown>>,
  hashText: (value: string) => string,
): string[] {
  const refs: string[] = [];
  for (const key of Object.keys(parameters).sort()) {
    const value = parameters[key];
    if (value === undefined) continue;
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    if (serialized === undefined) continue;
    const capped = serialized.slice(0, 256);
    refs.push(`in:${key}:${hashText(capped)}`);
  }
  return refs;
}

/** Append-only ledger law: duplicate ids are a typed integrity error. */
export function assertAppendOnly(
  existing: ApplicationActionRecord | null,
  actionRecordId: SportaId,
): void {
  if (existing !== null) {
    throw new ApplicationActionError(
      `action record ${actionRecordId} already exists — the audit trail is append-only and never rewrites evidence`,
      "audit-record-duplicated",
    );
  }
}
