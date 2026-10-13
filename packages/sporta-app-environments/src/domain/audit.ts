/**
 * W9C-4 — sanitized audit assembly (domain — pure, P9-19/21). Audit
 * records carry ONLY references, never secrets or raw payloads; dropped
 * secret-shaped refs surface in `missingCoverageNote` (never silent).
 * Record ids are deterministic so retries are idempotent appends.
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type {
  ApplicationActionAdmissionResult,
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationCapabilityClass,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import { admissionBasisFor } from "./admission.js";
import { fnv1aHex, stableStringify } from "./stable.js";

/** Secret-shaped markers — a ref containing one is NEVER recorded. */
const SECRET_MARKERS: readonly string[] = [
  "secret",
  "token",
  "credential",
  "password",
  "api-key",
  "apikey",
  "private-key",
];

/** A recorded ref must look like a reference, not free-form content. */
const REF_PATTERN = /^[\w:./@-]{1,160}$/;

/** The sanitizer outcome: safe refs + how many were dropped (honesty). */
export interface SanitizedRefs {
  refs: readonly string[];
  droppedCount: number;
}

/**
 * Sanitize action refs: keep only ref-shaped strings free of
 * secret-shaped markers. Everything dropped is COUNTED (the count lands
 * in the record's `missingCoverageNote` — never silent).
 */
export function sanitizeActionRefs(refs: readonly string[]): SanitizedRefs {
  const kept: string[] = [];
  let dropped = 0;
  for (const ref of refs) {
    const lowered = ref.toLowerCase();
    const secretShaped = SECRET_MARKERS.some((marker) => lowered.includes(marker));
    if (secretShaped || !REF_PATTERN.test(ref)) {
      dropped += 1;
      continue;
    }
    kept.push(ref);
  }
  return { refs: kept, droppedCount: dropped };
}

/**
 * Deterministic action record id: fnv1a over the stable identity content
 * (session, capability, actor, sanitized refs, the admission outcome key
 * and the effect digests — the before/after state digests plus the run
 * id). Retries of the SAME action produce the SAME id — the append-only
 * store collapses them; a DIFFERENT record under the same id is the
 * caller's typed conflict.
 */
export function buildActionRecordId(input: {
  sessionId: string;
  capabilityId: string;
  actor: string;
  sanitizedInputRefs: readonly string[];
  /** The admission outcome key (basis + refusal reason / confirmation class). */
  admissionKey: string;
  effectDigests: readonly string[];
}): string {
  return `act:${fnv1aHex(
    stableStringify({
      sessionId: input.sessionId,
      capabilityId: input.capabilityId,
      actor: input.actor,
      inputRefs: input.sanitizedInputRefs,
      admissionKey: input.admissionKey,
      effectDigests: input.effectDigests,
    }),
  )}`;
}

/** The assembled evidence of one executed (or refused) action. */
export interface ApplicationActionEvidence {
  /** Terminal verdict of the agent run ("completed" | "failed" | null when not executed). */
  runVerdict: "completed" | "failed" | null;
  /** Real before/after state digests (null when the action was not executed). */
  beforeDigest: string | null;
  afterDigest: string | null;
  /** Observation records newly present after the action (kind+detail — the effect basis). */
  newObservations: readonly { kind: string; detail: string }[];
  /** The declared side-effect kinds the capability promised. */
  declaredSideEffectKinds: readonly string[];
  /** Sanitized output references (evidence/artifact refs). */
  sanitizedOutputRefs: readonly string[];
  /** Reconciled lineage refs (only on VERIFIED success). */
  reconciledRefs: { workGraphId: string | null; artifactRevisionIds: readonly string[] };
  /** Honest note when coverage is missing (timeout, dropped refs, unverified effect). */
  missingCoverageNote: string | null;
}

/**
 * Assemble the frozen `ApplicationActionRecord` (pure projection — the
 * service supplies only real inputs). Status law: only a completed run
 * with a CHANGED state digest AND an observed declared side effect is
 * `succeeded`; everything else is `failed` (a disconnected/failed app is
 * never successful, P9-19). Denied admissions are `denied`.
 */
export function assembleActionRecord(input: {
  actionRecordId: string;
  session: ApplicationSession;
  attachment: ApplicationAttachment;
  actor: string;
  capabilityId: string;
  capabilityClass: ApplicationCapabilityClass;
  targetIdentity: string;
  admission: ApplicationActionAdmissionResult;
  sanitizedInputRefs: readonly string[];
  droppedInputRefCount: number;
  evidence: ApplicationActionEvidence;
  recordedAt: Iso8601;
}): ApplicationActionRecord {
  const executed = input.evidence.runVerdict !== null;
  const mutationObserved =
    input.evidence.afterDigest !== null &&
    input.evidence.beforeDigest !== null &&
    input.evidence.afterDigest !== input.evidence.beforeDigest &&
    input.evidence.newObservations.some((observation) =>
      input.evidence.declaredSideEffectKinds.includes(observation.kind),
    );
  // Status law (P9-19): a MUTATING capability succeeds only when the run
  // completed AND the declared effect is observed; a PURE-OBSERVATION
  // capability (no declared side effects) succeeds when the run completed
  // and the target state was READ — observation has no effect to verify.
  const succeeded =
    input.admission.admitted &&
    input.evidence.runVerdict === "completed" &&
    (input.evidence.declaredSideEffectKinds.length === 0
      ? input.evidence.afterDigest !== null
      : mutationObserved);
  const effectObserved = input.evidence.declaredSideEffectKinds.length === 0
    ? input.evidence.afterDigest !== null
    : mutationObserved;

  const status: ApplicationActionRecord["status"] = !input.admission.admitted
    ? "denied"
    : input.admission.requiresConfirmation
      ? "denied"
      : succeeded
        ? "succeeded"
        : "failed";

  const effects: ApplicationActionRecord["effects"] = executed
    ? [
        {
          kind: input.evidence.declaredSideEffectKinds.length === 0 ? "state-observed" : "state-change",
          evidenceRef: `state:${input.evidence.afterDigest ?? "unobserved"}`,
          verified: effectObserved,
        },
        ...input.evidence.declaredSideEffectKinds.map((kind) => ({
          kind,
          evidenceRef: `observation:${kind}`,
          verified: input.evidence.newObservations.some((observation) => observation.kind === kind),
        })),
      ]
    : [];

  const notes: string[] = [];
  if (input.droppedInputRefCount > 0) {
    notes.push(`${input.droppedInputRefCount} input ref(s) sanitized out (secret-shaped or non-ref content)`);
  }
  if (executed && input.evidence.runVerdict !== "completed") {
    notes.push(`agent run verdict was "${input.evidence.runVerdict}" — a failed run is never a successful action`);
  }
  if (input.admission.admitted && executed && input.evidence.runVerdict === "completed" && !effectObserved) {
    notes.push("declared effect not observed in the target state after a completed run — never reported successful");
  }
  if (input.evidence.missingCoverageNote !== null) {
    notes.push(input.evidence.missingCoverageNote);
  }

  return {
    actionRecordId: input.actionRecordId,
    sessionId: input.session.sessionId,
    actor: input.actor,
    capabilityId: input.capabilityId,
    capabilityClass: input.capabilityClass,
    targetIdentity: input.targetIdentity,
    sanitizedInputRefs: [...input.sanitizedInputRefs],
    sanitizedOutputRefs: [...input.evidence.sanitizedOutputRefs],
    permissionDecision: {
      decision: input.admission.admitted && !input.admission.requiresConfirmation ? "allowed" : "denied",
      basis: admissionBasisFor(input.admission),
      decidedBy: `policy-snapshot:${input.attachment.policySnapshot}`,
    },
    effects,
    status,
    reconciledRefs: {
      workGraphId: input.evidence.reconciledRefs.workGraphId,
      artifactRevisionIds: [...input.evidence.reconciledRefs.artifactRevisionIds],
    },
    recordedAt: input.recordedAt,
    missingCoverageNote: notes.length > 0 ? notes.join("; ") : null,
  };
}

/** Byte-stable comparison for the append-only store's conflict check. */
export function actionRecordFingerprint(record: ApplicationActionRecord): string {
  return stableStringify(record);
}
