/**
 * Shared test fixtures for sporta-arena tests (fixture-grade, in-memory).
 */
import type { ArenaEscalationRecord, PolicySet } from "@sporta/contracts/contract";
import type { EscalateInput, RecordCapabilityGapInput } from "../src/contract.js";
import type { ArenaTransportPort, ArenaTransportSubmission } from "../src/app/arenaTransport.js";

export function fixturePolicySet(): PolicySet {
  return {
    rights: { holders: ["holder:fixture"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "escalation", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

export function fixtureGapInput(
  overrides: Partial<RecordCapabilityGapInput> = {},
): RecordCapabilityGapInput {
  return {
    gapId: "gap:fixture",
    workGraphId: "wg:fixture",
    capabilityNeed: "broadcast-frame-tracking",
    attemptedStrategies: ["builtin-tracker@0"],
    contextRefs: ["run:fixture"],
    evidence: ["ev:fixture"],
    ...overrides,
  };
}

export function fixtureEscalateInput(overrides: Partial<EscalateInput> = {}): EscalateInput {
  return {
    idempotencyKey: "esc-key-fixture",
    gapId: "gap:fixture",
    tenantRef: "tenant:fixture",
    urgency: "high",
    sessionMode: "unblock",
    permittedActions: ["observe", "correct"],
    learningPermissions: { scopes: ["capability"], requireConsent: true },
    policy: fixturePolicySet(),
    contextRefs: ["wg:fixture", "run:fixture"],
    ...overrides,
  };
}

/** A full escalation record as created by the client (lifecycle "created"). */
export function fixtureEscalationRecord(): ArenaEscalationRecord {
  const input = fixtureEscalateInput();
  const gap = fixtureGapInput();
  return {
    escalationId: "esc:fixture-0000000000000000",
    idempotencyKey: input.idempotencyKey,
    gapId: input.gapId,
    tenantRef: input.tenantRef,
    workGraphId: gap.workGraphId,
    urgency: input.urgency,
    sessionMode: input.sessionMode,
    permittedActions: [...input.permittedActions],
    learningPermissions: { ...input.learningPermissions },
    lifecycle: "created",
    policy: input.policy,
  };
}

/** Spy transport: records submissions, never advances, reports no status. */
export class SpyTransport implements ArenaTransportPort {
  readonly submissions: ArenaTransportSubmission[] = [];
  statusCallCount = 0;

  async submit(submission: ArenaTransportSubmission): Promise<void> {
    this.submissions.push({
      escalation: { ...submission.escalation },
      contextRefs: [...submission.contextRefs],
    });
  }

  async status(): Promise<null> {
    this.statusCallCount += 1;
    return null;
  }
}

/** Scripted transport: the test drives the reported lifecycle directly. */
export class ScriptedTransport implements ArenaTransportPort {
  lifecycle: ArenaEscalationRecord["lifecycle"] = "created";

  async submit(): Promise<void> {}

  async status(): Promise<{ lifecycle: ArenaEscalationRecord["lifecycle"]; result: null }> {
    return { lifecycle: this.lifecycle, result: null };
  }
}
