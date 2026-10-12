import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type { ComputeJobState, TypedRefusal } from "../ports.js";
/**
 * Fallback-chain types (domain layer — pure, no IO).
 *
 * The B6 provider-neutral fallback lane's shared vocabulary: the four
 * outcome classes a provider result is classified into, the explicit
 * per-provider attempt record the trail carries, and the explicit
 * chain policy record. Typed facts only, never stringly (the W6-A/B
 * error-typing house style).
 */

/**
 * The four classes a provider execution outcome falls into. Total:
 * every well-shaped `ProviderExecutionResult` maps to exactly one.
 */
export type ProviderOutcomeClass =
  | "succeeded"
  | "retryable-failure"
  | "terminal-refusal"
  | "terminal-failure";

/**
 * One explicit transient-failure marker of the classification record.
 * The record is versioned and auditable — never an ambient heuristic.
 */
export interface TransientFailureMarker {
  /** Exact case-sensitive substring matched against a failure detail. */
  readonly marker: string;
  /** Stable audit label for the marker. */
  readonly label: string;
}

/**
 * One provider execution attempt, as carried in the chain trail — the
 * visible-provider-failure record (B6): providerId, outcome class,
 * refusal/failure detail, output artifact and clock-stamped time.
 */
export interface ProviderAttempt {
  readonly providerId: string;
  readonly outcomeClass: ProviderOutcomeClass;
  /** 1-based attempt count WITHIN this provider (the attempt budget). */
  readonly attemptNumber: number;
  /** Stamped by the injected clock; never ambient time. */
  readonly attemptedAt: Iso8601;
  /** Present exactly when outcomeClass is "terminal-refusal". */
  readonly refusal?: TypedRefusal;
  /** Present when the provider failed (retryable or terminal). */
  readonly failureDetail?: string;
  /** Present when the provider succeeded. */
  readonly outputArtifactId?: SportaId;
}

/**
 * The complete chain trail for one job — the B6 evidence record.
 * `jobState` is the job's state when the trail is read (the chain is
 * synchronous, so an observed trail always carries a terminal state:
 * succeeded, failed or refused).
 */
export interface FallbackChainTrail {
  readonly jobId: SportaId;
  readonly attempts: readonly ProviderAttempt[];
  readonly jobState: ComputeJobState;
}

/** The explicit, deterministic fallback-chain policy record. */
export interface FallbackChainPolicy {
  /**
   * The deterministic provider order (registration order). No ambient
   * config, no cost/latency guessing — the explicit, total order.
   */
  readonly providerOrder: readonly string[];
  /** Max attempts per provider (default 1). */
  readonly maxAttemptsPerProvider: number;
  /**
   * Whether a retryable failure re-enters the SAME provider (default
   * false — the chain advances to the next provider).
   */
  readonly retrySameProviderOnRetryableFailure: boolean;
}
