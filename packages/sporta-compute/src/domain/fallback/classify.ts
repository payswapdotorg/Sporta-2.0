import { ComputeError } from "../errors.js";
import type { ProviderExecutionResult, TypedRefusal } from "../ports.js";
import type { ProviderOutcomeClass, TransientFailureMarker } from "./types.js";
/**
 * Provider outcome classification (domain layer — pure).
 *
 * The classification law is an EXPLICIT, EXHAUSTIVE RECORD, never an
 * ambient heuristic: a failure is "retryable" exactly when its detail
 * carries one of the recorded transient markers; every TypedRefusal
 * kind is TERMINAL for that provider (a refusal is an honest no, not
 * a retry trigger). Classification is TOTAL — unknown shapes are a
 * typed FallbackClassificationError, never a silent default.
 */

/** The five TypedRefusal kinds (ports law) — everything else is ill-shaped. */
const REFUSAL_KINDS: readonly string[] = [
  "provider-unavailable",
  "quota-exhausted",
  "credentials-missing",
  "policy-denied",
  "unsupported-operation",
];

/**
 * The explicit transient-failure record: exact case-sensitive
 * substrings matched against a failed result's `detail` (first match
 * in record order wins). Versioned and auditable — adding or removing
 * a marker is a SPEC-visible change, never an ambient heuristic.
 */
export const TRANSIENT_FAILURE_MARKERS: readonly TransientFailureMarker[] = [
  { marker: "timeout", label: "timeout" },
  { marker: "timed out", label: "timeout" },
  { marker: "ETIMEDOUT", label: "timeout" },
  { marker: "temporarily unavailable", label: "temporary-unavailability" },
  { marker: "overloaded", label: "overload" },
  { marker: "rate limit", label: "rate-limited" },
  { marker: "ECONNRESET", label: "connection-reset" },
  { marker: "ECONNREFUSED", label: "connection-refused" },
  { marker: "EPIPE", label: "broken-pipe" },
  { marker: "socket hang up", label: "socket-hangup" },
  { marker: "restarting", label: "restart-in-progress" },
];

/**
 * A provider result violated the port laws: an unknown state, a
 * "refused" result without a well-formed TypedRefusal, or a refusal
 * carried on a succeeded/failed result. Carries the machine-readable
 * reason and the ill-shaped value — never a silent default class.
 */
export class FallbackClassificationError extends ComputeError {
  readonly reason: string;
  readonly outcome: unknown;

  constructor(message: string, reason: string, outcome: unknown) {
    super(message, `fallback-classification:${reason}`);
    this.reason = reason;
    this.outcome = outcome;
  }
}

function isWellFormedRefusal(value: unknown): value is TypedRefusal {
  if (typeof value !== "object" || value === null) return false;
  const refusal = value as Partial<TypedRefusal>;
  return (
    typeof refusal.kind === "string" &&
    REFUSAL_KINDS.includes(refusal.kind) &&
    typeof refusal.providerId === "string" &&
    refusal.providerId.length > 0 &&
    typeof refusal.detail === "string"
  );
}

/**
 * Classify one provider execution result into the four classes (pure,
 * total, fail-closed):
 *
 * - "succeeded"            — state "succeeded" (artifact id optional);
 * - "terminal-refusal"     — state "refused" (every kind is terminal
 *                            for THAT provider — an honest no);
 * - "retryable-failure"    — state "failed" whose detail matches the
 *                            explicit transient record;
 * - "terminal-failure"     — state "failed" matching no marker.
 *
 * Anything else — not an object, no string state, a state outside the
 * three, a refused result without a well-formed refusal, or a refusal
 * on a succeeded/failed result — throws FallbackClassificationError.
 */
export function classifyProviderOutcome(result: ProviderExecutionResult): ProviderOutcomeClass {
  if (typeof result !== "object" || result === null) {
    throw new FallbackClassificationError(
      "the provider result is not an object",
      "not-an-object",
      result,
    );
  }
  const record = result as Partial<ProviderExecutionResult>;
  if (typeof record.state !== "string") {
    throw new FallbackClassificationError(
      "the provider result carries no string state",
      "no-string-state",
      result,
    );
  }
  if (record.refusal !== undefined && record.state !== "refused") {
    throw new FallbackClassificationError(
      `a "${record.state}" result must not carry a refusal (refusals belong to refused results only)`,
      `refusal-on:${record.state}`,
      result,
    );
  }
  if (record.state === "succeeded") return "succeeded";
  if (record.state === "refused") {
    if (!isWellFormedRefusal(record.refusal)) {
      throw new FallbackClassificationError(
        'a "refused" result must carry a well-formed TypedRefusal (one of the five kinds)',
        "refused-without-refusal",
        result,
      );
    }
    return "terminal-refusal";
  }
  if (record.state === "failed") {
    const detail = typeof record.detail === "string" ? record.detail : "";
    const transient = TRANSIENT_FAILURE_MARKERS.find((marker) => detail.includes(marker.marker));
    return transient === undefined ? "terminal-failure" : "retryable-failure";
  }
  throw new FallbackClassificationError(
    `unknown provider execution state "${record.state}"`,
    `unknown-state:${record.state}`,
    result,
  );
}
