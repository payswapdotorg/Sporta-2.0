import { ComputeError } from "../errors.js";
import type { FallbackChainPolicy } from "./types.js";
/**
 * The fallback-chain policy record (domain layer — pure).
 *
 * Determinism law: the provider order is an explicit, total list of
 * provider ids (registration order by default) — no ambient config, no
 * cost/latency guessing, no hidden retries. Validation is fail-closed
 * and reports EVERY reason at once.
 */

/** Default max attempts per provider (the work-order default: 1). */
export const DEFAULT_MAX_ATTEMPTS_PER_PROVIDER = 1;

/** Default same-provider retry on retryable failure (default no — the chain advances). */
export const DEFAULT_RETRY_SAME_PROVIDER_ON_RETRYABLE_FAILURE = false;

/**
 * The chain policy is invalid (wiring bug): empty/duplicate order,
 * bad attempt budget, or an order entry that is not a registered
 * provider. Carries every reason — never just the first.
 */
export class InvalidFallbackChainPolicyError extends ComputeError {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`invalid fallback chain policy: ${reasons.join("; ")}`, `invalid-fallback-policy:${reasons.join("|")}`);
    this.reasons = [...reasons];
  }
}

/**
 * The default policy: the registration order, one attempt per
 * provider, retryable failures ADVANCE the chain (never re-enter the
 * same provider).
 */
export function defaultFallbackChainPolicy(providerOrder: readonly string[]): FallbackChainPolicy {
  return {
    providerOrder: [...providerOrder],
    maxAttemptsPerProvider: DEFAULT_MAX_ATTEMPTS_PER_PROVIDER,
    retrySameProviderOnRetryableFailure: DEFAULT_RETRY_SAME_PROVIDER_ON_RETRYABLE_FAILURE,
  };
}

/**
 * Fail-closed validation of a chain policy. With `registeredProviderIds`,
 * every order entry must be a registered provider (a policy may
 * deliberately OMIT a registered provider — explicit exclusion — but
 * may never reference an unknown one). Throws
 * InvalidFallbackChainPolicyError carrying every reason.
 */
export function validateFallbackChainPolicy(
  policy: FallbackChainPolicy,
  registeredProviderIds?: readonly string[],
): void {
  const reasons: string[] = [];
  const order = policy.providerOrder;
  if (!Array.isArray(order) || order.length === 0) {
    reasons.push("providerOrder must be a non-empty array of provider ids");
  } else {
    const seen = new Set<string>();
    for (const id of order) {
      if (typeof id !== "string" || id.length === 0) {
        reasons.push(`providerOrder entry ${JSON.stringify(id)} is not a non-empty string`);
      } else if (seen.has(id)) {
        reasons.push(`providerOrder duplicates provider id "${id}"`);
      } else {
        seen.add(id);
      }
    }
    if (registeredProviderIds !== undefined) {
      const registered = new Set(registeredProviderIds);
      for (const id of order) {
        if (typeof id === "string" && id.length > 0 && !registered.has(id)) {
          reasons.push(`providerOrder references unregistered provider "${id}"`);
        }
      }
    }
  }
  const max = policy.maxAttemptsPerProvider;
  if (!Number.isInteger(max) || max < 1) {
    reasons.push(`maxAttemptsPerProvider must be an integer >= 1 (got ${String(max)})`);
  }
  if (reasons.length > 0) throw new InvalidFallbackChainPolicyError(reasons);
}
