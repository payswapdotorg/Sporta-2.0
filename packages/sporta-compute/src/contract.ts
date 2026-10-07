/**
 * sporta-compute — provider-neutral compute broker.
 *
 * Local and user-owned compute are first-class. Provider failure is a
 * typed refusal/fallback, never semantic corruption (invariant 17).
 *
 * Single public entrypoint: type declarations live in the domain layer
 * and are re-exported here (entrypoint-only convention); the service and
 * fixture providers are re-exported for wiring. The v1 export surface is
 * unchanged; Wave 1 additions are purely additive.
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
