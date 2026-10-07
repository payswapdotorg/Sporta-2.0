/**
 * ArenaClientService — app-layer implementation of `ArenaClientPort`.
 *
 * Owns (in-memory, fixture-grade): gap records, escalation records and
 * the idempotency index. It never mutates work-graph/organization/
 * artifact state; its only outside interaction is the injected
 * transport port. Results are validated as verdicts only — Arena never
 * mutates Sporta state, and unvalidated results are never auto-applied.
 */
import { createHash } from "node:crypto";
import type {
  ArenaClientPort,
  EscalateInput,
  RecordCapabilityGapInput,
  ValidationVerdict,
} from "../contract.js";
import type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  CapabilityGapRecord,
  SportaId,
} from "@sporta/contracts/contract";
import { escalationLifecyclePath } from "../domain/escalation.js";
import { transitionGapStatus } from "../domain/gap.js";
import { stableStringify } from "../domain/fingerprint.js";
import {
  EscalationConflictError,
  EscalationPolicyError,
  GapConflictError,
  UnknownGapError,
} from "../domain/errors.js";
import { validateArenaResultChecks } from "../domain/resultValidation.js";
import type { ArenaTransportPort } from "./arenaTransport.js";

/** Constructor dependencies of the Arena client service. */
export interface ArenaClientServiceDeps {
  transport: ArenaTransportPort;
}

interface GapEntry {
  record: CapabilityGapRecord;
  inputFingerprint: string;
}

interface EscalationEntry {
  record: ArenaEscalationRecord;
  contextRefs: readonly SportaId[];
  inputFingerprint: string;
}

function gapFingerprint(input: RecordCapabilityGapInput): string {
  return stableStringify({
    workGraphId: input.workGraphId,
    capabilityNeed: input.capabilityNeed,
    attemptedStrategies: input.attemptedStrategies,
    contextRefs: input.contextRefs,
    evidence: input.evidence,
  });
}

function escalationFingerprint(input: EscalateInput): string {
  return stableStringify({
    gapId: input.gapId,
    tenantRef: input.tenantRef,
    urgency: input.urgency,
    budget: input.budget,
    sessionMode: input.sessionMode,
    permittedActions: input.permittedActions,
    learningPermissions: input.learningPermissions,
    policy: input.policy,
    contextRefs: input.contextRefs,
  });
}

/** Deterministic escalation id from (tenantRef, idempotencyKey). */
function escalationIdFor(tenantRef: string, idempotencyKey: string): SportaId {
  const digest = createHash("sha256")
    .update(`${tenantRef}\u0000${idempotencyKey}`)
    .digest("hex")
    .slice(0, 24);
  return `esc:${digest}`;
}

/** The Arena client boundary service. */
export class ArenaClientService implements ArenaClientPort {
  readonly #gaps = new Map<SportaId, GapEntry>();
  readonly #escalations = new Map<SportaId, EscalationEntry>();
  readonly #byIdempotencyKey = new Map<string, EscalationEntry>();
  #autoGapSequence = 0;
  readonly #deps: ArenaClientServiceDeps;

  constructor(deps: ArenaClientServiceDeps) {
    this.#deps = deps;
  }

  async recordGap(input: RecordCapabilityGapInput): Promise<CapabilityGapRecord> {
    const fingerprint = gapFingerprint(input);
    if (input.gapId !== undefined) {
      const existing = this.#gaps.get(input.gapId);
      if (existing !== undefined) {
        if (existing.inputFingerprint !== fingerprint) {
          throw new GapConflictError(input.gapId);
        }
        return existing.record;
      }
    }
    const gapId = input.gapId ?? `gap:auto:${(this.#autoGapSequence += 1)}`;
    const record: CapabilityGapRecord = {
      gapId,
      workGraphId: input.workGraphId,
      capabilityNeed: input.capabilityNeed,
      attemptedStrategies: [...input.attemptedStrategies],
      contextRefs: [...input.contextRefs],
      evidence: [...input.evidence],
      status: "open",
    };
    this.#gaps.set(gapId, { record, inputFingerprint: fingerprint });
    return record;
  }

  async escalate(input: EscalateInput): Promise<ArenaEscalationRecord> {
    const existing = this.#byIdempotencyKey.get(input.idempotencyKey);
    if (existing !== undefined) {
      if (existing.inputFingerprint !== escalationFingerprint(input)) {
        throw new EscalationConflictError(input.idempotencyKey);
      }
      return existing.record;
    }
    if (input.permittedActions.length === 0) {
      throw new EscalationPolicyError(
        "permittedActions must not be empty — Arena sessions are isolated capsules with explicitly permitted actions only",
      );
    }
    const gapEntry = this.#gaps.get(input.gapId);
    if (gapEntry === undefined) {
      throw new UnknownGapError(input.gapId);
    }
    const escalatedGapStatus = transitionGapStatus(gapEntry.record.status, "escalated");

    const escalationId = escalationIdFor(input.tenantRef, input.idempotencyKey);
    const record: ArenaEscalationRecord = {
      escalationId,
      idempotencyKey: input.idempotencyKey,
      gapId: input.gapId,
      tenantRef: input.tenantRef,
      workGraphId: gapEntry.record.workGraphId,
      urgency: input.urgency,
      sessionMode: input.sessionMode,
      permittedActions: [...input.permittedActions],
      learningPermissions: {
        scopes: [...input.learningPermissions.scopes],
        requireConsent: input.learningPermissions.requireConsent,
      },
      lifecycle: "created",
      policy: input.policy,
    };
    if (input.budget !== undefined) {
      record.budget = { currency: input.budget.currency, limit: input.budget.limit };
    }

    await this.#deps.transport.submit({
      escalation: record,
      contextRefs: [...input.contextRefs],
    });

    // Commit own-store state only after the transport accepted the submission.
    this.#gaps.set(gapEntry.record.gapId, {
      record: { ...gapEntry.record, status: escalatedGapStatus },
      inputFingerprint: gapEntry.inputFingerprint,
    });
    const entry: EscalationEntry = {
      record,
      contextRefs: [...input.contextRefs],
      inputFingerprint: escalationFingerprint(input),
    };
    this.#escalations.set(escalationId, entry);
    this.#byIdempotencyKey.set(input.idempotencyKey, entry);
    return record;
  }

  async readResult(escalationId: SportaId): Promise<ArenaResultRecord | null> {
    const entry = this.#escalations.get(escalationId);
    if (entry === undefined) {
      return null;
    }
    const status = await this.#deps.transport.status(escalationId);
    if (status === null) {
      return null;
    }
    if (status.lifecycle !== entry.record.lifecycle) {
      // Mirror the authoritative Arena lifecycle into our own record copy,
      // refusing illegal jumps through the pure path function.
      escalationLifecyclePath(entry.record.lifecycle, status.lifecycle);
      entry.record = { ...entry.record, lifecycle: status.lifecycle };
    }
    return status.result;
  }

  async validateResult(result: ArenaResultRecord): Promise<ValidationVerdict> {
    const entry = this.#escalations.get(result.escalationId);
    const checks = validateArenaResultChecks(result, entry?.record ?? null);
    return {
      resultId: result.resultId,
      accepted: checks.every((check) => check.passed),
      checks,
    };
  }
}
