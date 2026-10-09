/**
 * Arena result validation (domain layer — pure).
 *
 * Sporta validates Arena results before any application (invariant 16).
 * Validation is structured: every check is evaluated (no short-circuit)
 * and reported per-check; `accepted` is true only when every check
 * passes. The domain function never mutates anything — verdicts only.
 */
import type { ArenaEscalationRecord, ArenaResultRecord } from "@sporta/contracts/contract";

/** Session mode of an escalation. */
export type SessionMode = ArenaEscalationRecord["sessionMode"];

/** Result type of an Arena result. */
export type ArenaResultType = ArenaResultRecord["resultType"];

/** Provenance source kind of an Arena result (contract view). */
export type ProvenanceSourceKind = ArenaResultRecord["provenance"]["sourceKind"];

/**
 * The full result-type vocabulary of the escalation contract. Boundary
 * adapters narrow wire strings against this list before constructing a
 * typed ArenaResultRecord (validate-before-apply).
 */
export const ARENA_RESULT_TYPES: readonly ArenaResultType[] = [
  "correction",
  "unblock",
  "solution",
  "review",
  "evidence-bundle",
  "knowledge-patch",
  "tool-gap-signal",
  "evaluation-verdict",
  "learning-artifact-ref",
];

/**
 * The full provenance source-kind vocabulary of the contract. Boundary
 * adapters narrow wire strings against this list the same way.
 */
export const ARENA_PROVENANCE_SOURCE_KINDS: readonly ProvenanceSourceKind[] = [
  "authorized-source",
  "observation",
  "measurement",
  "human-judgment",
  "agent-run",
  "editor-session",
  "arena-session",
];

/**
 * v1 policy table: which result types each session mode may produce.
 * Additive module policy (the escalation contract fixes the result-type
 * vocabulary; this table maps it onto session modes).
 */
const SESSION_MODE_EXPECTED_RESULT_TYPES: Readonly<
  Record<SessionMode, readonly ArenaResultType[]>
> = {
  observe: ["evidence-bundle", "review", "evaluation-verdict"],
  correct: ["correction", "solution"],
  unblock: ["unblock", "solution", "correction"],
  takeover: ["correction", "solution"],
  teach: ["knowledge-patch", "solution", "learning-artifact-ref"],
  review: ["review", "evaluation-verdict", "correction"],
};

/** Result types the given session mode is expected to produce. */
export function expectedResultTypes(sessionMode: SessionMode): readonly ArenaResultType[] {
  return SESSION_MODE_EXPECTED_RESULT_TYPES[sessionMode];
}

/** One structured validation check result. */
export interface ValidationCheckResult {
  check: string;
  passed: boolean;
}

const SHA_256_HEX = /^[0-9a-f]{64}$/;

function isWellFormedPayloadHash(hash: string): boolean {
  return SHA_256_HEX.test(hash);
}

/**
 * Evaluate every validation check for one result against its escalation
 * (null when the escalation is unknown to the client):
 * 1. payload-hash-present — sha-256 hex shape (canonical ContentHash);
 * 2. provenance-source-kind — provenance.sourceKind === "arena-session";
 * 3. escalation-known — the escalation exists in the client store;
 * 4. result-type-session-mode — the resultType is compatible with the
 *    escalation's sessionMode.
 */
export function validateArenaResultChecks(
  result: ArenaResultRecord,
  escalation: ArenaEscalationRecord | null,
): readonly ValidationCheckResult[] {
  return [
    {
      check: "payload-hash-present",
      passed: isWellFormedPayloadHash(result.payloadHash),
    },
    {
      check: "provenance-source-kind",
      passed: result.provenance.sourceKind === "arena-session",
    },
    {
      check: "escalation-known",
      passed: escalation !== null,
    },
    {
      check: "result-type-session-mode",
      passed:
        escalation !== null &&
        expectedResultTypes(escalation.sessionMode).includes(result.resultType),
    },
  ];
}
