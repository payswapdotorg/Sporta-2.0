import type { SportaId } from "@sporta/contracts/contract";
import { ComputeError } from "../errors.js";
import type { TypedRefusal } from "../ports.js";
import { FallbackClassificationError } from "./classify.js";
import type { ProviderAttempt } from "./types.js";
/**
 * Chain-trail aggregation (domain layer — pure): the terminal laws
 * that turn a completed attempt trail into the chain's honest
 * outcome — the aggregate refusal when every provider refused, the
 * typed exhaustion error when any provider failed, and the
 * deterministic human summary that keeps every attempt visible.
 */

/**
 * The typed aggregate for a chain that exhausted every provider
 * without a success while at least one provider FAILED (an honest
 * infrastructure failure — visible, impossible to ignore). Carries the
 * jobId and the FULL attempt trail as structured facts.
 */
export class AllProvidersExhaustedError extends ComputeError {
  readonly jobId: SportaId;
  readonly attempts: readonly ProviderAttempt[];

  constructor(jobId: SportaId, attempts: readonly ProviderAttempt[]) {
    const summary = attempts.map((a) => `${a.providerId}=${a.outcomeClass}`).join(",");
    super(
      `all ${attempts.length} provider attempt(s) exhausted without success for job ${jobId}`,
      `all-providers-exhausted:${jobId}:${summary}`,
    );
    this.jobId = jobId;
    this.attempts = [...attempts];
  }
}

/**
 * Whether the trail is a pure all-refusal trail: at least one attempt
 * and every attempt a terminal refusal (no failure anywhere).
 */
export function isAllRefusalTrail(attempts: readonly ProviderAttempt[]): boolean {
  return attempts.length > 0 && attempts.every((a) => a.outcomeClass === "terminal-refusal");
}

/**
 * The honest aggregate refusal for an all-refusal trail: kind and
 * providerId follow the FIRST refusing provider (the frozen broker's
 * all-refuse law); the detail names EVERY provider's refusal kind.
 * Returns null exactly when the trail is not all-refusal (the failed
 * path — exhaustion with failures — applies instead).
 */
export function aggregateRefusalForTrail(attempts: readonly ProviderAttempt[]): TypedRefusal | null {
  if (!isAllRefusalTrail(attempts)) return null;
  const first = attempts[0];
  if (first === undefined || first.refusal === undefined) {
    // Unreachable per the trail laws (an all-refusal attempt carries
    // its refusal) — fail-closed, never a silent default.
    throw new FallbackClassificationError(
      "an all-refusal trail attempt is missing its refusal",
      "trail-incoherent",
      attempts,
    );
  }
  const names = attempts.map((a) => `${a.providerId}:${a.refusal?.kind ?? "unknown"}`).join("; ");
  return {
    kind: first.refusal.kind,
    providerId: first.refusal.providerId,
    detail: `aggregate: every provider refused — ${names}`,
  };
}

/**
 * The last attempt that FAILED (retryable or terminal) — the provider
 * whose failure finalized the chain's terminal `failed` status.
 * Undefined when no attempt failed.
 */
export function lastFailingAttempt(attempts: readonly ProviderAttempt[]): ProviderAttempt | undefined {
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const attempt = attempts[i];
    if (
      attempt !== undefined &&
      (attempt.outcomeClass === "retryable-failure" || attempt.outcomeClass === "terminal-failure")
    ) {
      return attempt;
    }
  }
  return undefined;
}

/**
 * The deterministic human summary of a trail — every attempt named
 * (index, provider, class, refusal kind or failure detail). A success
 * reached after earlier failures NEVER hides them: this summary goes
 * into the terminal status `detail`.
 */
export function summarizeTrailForDetail(attempts: readonly ProviderAttempt[]): string {
  if (attempts.length === 0) return "chain trail: (no provider attempts)";
  const entries = attempts.map((attempt, index) => {
    const fact =
      attempt.refusal !== undefined
        ? `(${attempt.refusal.kind})`
        : attempt.failureDetail !== undefined
          ? `(${attempt.failureDetail})`
          : "";
    return `#${index + 1} ${attempt.providerId} ${attempt.outcomeClass}${fact}`;
  });
  return `chain trail: ${entries.join("; ")}`;
}
