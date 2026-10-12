/**
 * sporta-compute — provider-neutral compute broker.
 *
 * Local and user-owned compute are first-class. Provider failure is a
 * typed refusal/fallback, never semantic corruption (invariant 17).
 *
 * Single public entrypoint: type declarations live in the domain layer
 * and are re-exported here (entrypoint-only convention); the service and
 * fixture providers are re-exported for wiring. The v1 export surface is
 * unchanged; Wave 1 additions are purely additive. Wave 7 adds the
 * durable job ledger and the persisting broker composition (P8
 * persistent workers — additive adapters; ComputeBrokerService itself
 * stays untouched).
 */
export type { PolicySet } from "@sporta/contracts/contract";

export type {
  ComputeJobSpec,
  TypedRefusal,
  ComputeJobState,
  ComputeJobStatus,
  ComputeQuote,
  SubmitComputeInput,
  ComputeBrokerPort,
  ProviderExecutionResult,
  ComputeProviderPort,
  ComputeClock,
  ComputeBrokerDeps,
} from "./domain/ports.js";

export {
  ComputeError,
  IllegalJobTransitionError,
  UnknownComputeJobError,
} from "./domain/errors.js";

export { canTransition, transitionJob } from "./domain/stateMachine.js";
export { requiredUsageForJobKind, policyPermitsJob } from "./domain/policy.js";

export { ComputeBrokerService } from "./app/ComputeBrokerService.js";

export { LocalEchoComputeProvider, RefusingComputeProvider } from "./adapters/providers.js";
export { FixedClock, SystemClock } from "./adapters/clock.js";

// Wave 7 additions (P8 persistent workers — W7A). Additive only.

// Durable job ledger (FsSharedSessionStore persistence pattern).
export {
  ComputeLedgerError,
  FsComputeJobLedger,
  parseComputeJobLedger,
  sha256ComputeLedgerHash,
} from "./adapters/fsComputeJobLedger.js";
export type {
  ComputeJobLedgerRecord,
  ComputeLedgerHashFn,
} from "./adapters/fsComputeJobLedger.js";

// Persisting broker composition over the untouched ComputeBrokerService.
export { FsComputeBrokerService } from "./adapters/fsComputeBrokerService.js";
export type { FsComputeBrokerDeps } from "./adapters/fsComputeBrokerService.js";

// Wave 7 additions (P8 B6 provider-neutral fallback — W7B). Additive only.

// Fallback-chain domain vocabulary (typed facts, never stringly).
export type {
  ProviderOutcomeClass,
  TransientFailureMarker,
  ProviderAttempt,
  FallbackChainTrail,
  FallbackChainPolicy,
} from "./domain/fallback/types.js";

// Deterministic outcome classification (total, fail-closed).
export {
  TRANSIENT_FAILURE_MARKERS,
  classifyProviderOutcome,
  FallbackClassificationError,
} from "./domain/fallback/classify.js";

// The explicit chain policy record + fail-closed validation.
export {
  DEFAULT_MAX_ATTEMPTS_PER_PROVIDER,
  DEFAULT_RETRY_SAME_PROVIDER_ON_RETRYABLE_FAILURE,
  defaultFallbackChainPolicy,
  validateFallbackChainPolicy,
  InvalidFallbackChainPolicyError,
} from "./domain/fallback/policy.js";

// Chain-trail terminal laws: aggregate refusal, typed exhaustion, visible summary.
export {
  AllProvidersExhaustedError,
  aggregateRefusalForTrail,
  isAllRefusalTrail,
  lastFailingAttempt,
  summarizeTrailForDetail,
} from "./domain/fallback/trail.js";

// The fallback chain service (additive to the frozen ComputeBrokerService).
export { FallbackComputeService } from "./app/FallbackComputeService.js";
export type { FallbackComputeDeps } from "./app/FallbackComputeService.js";
