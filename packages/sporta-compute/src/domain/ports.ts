import type { Iso8601, PolicySet, SportaId } from "@sporta/contracts/contract";
/**
 * sporta-compute ports and operational types (domain layer — pure).
 *
 * Re-exported through src/contract.ts, the single public entrypoint. The
 * v1 shapes are frozen; Wave 1 adds the provider port, the execution
 * result type, the clock seam and an optional `detail` field on job
 * status (all additive).
 */

/** Injectable clock; job ledger timestamps come only from here. */
export interface ComputeClock {
  now(): Iso8601;
}

/** What kind of execution is being quoted or submitted. */
export interface ComputeJobSpec {
  kind: string;
  inputs: readonly SportaId[];
  requirements: readonly string[];
  timeoutMs: number;
  budget?: { currency: string; limit: number };
}

/** A typed refusal — honest infrastructure state, never a weakened success. */
export interface TypedRefusal {
  kind:
    | "provider-unavailable"
    | "quota-exhausted"
    | "credentials-missing"
    | "policy-denied"
    | "unsupported-operation";
  providerId: string;
  detail: string;
}

export type ComputeJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "refused"
  | "cancelled";

/** Job status; `refusal` is present exactly when state is "refused". */
export interface ComputeJobStatus {
  jobId: SportaId;
  state: ComputeJobState;
  providerId: string;
  refusal?: TypedRefusal;
  outputArtifactId?: SportaId;
  /** Human-readable context for failures/refusals (additive, optional). */
  detail?: string;
}

/** A quote from one provider. Quotes may be refusals. */
export interface ComputeQuote {
  providerId: string;
  estimatedCost?: { currency: string; amount: number };
  estimatedLatencyMs?: number;
  refusal?: TypedRefusal;
}

/** Input for submitting a job. `jobId` provides idempotency. */
export interface SubmitComputeInput {
  jobId?: SportaId;
  spec: ComputeJobSpec;
  policy: PolicySet;
}

/** The compute broker port. */
export interface ComputeBrokerPort {
  quote(spec: ComputeJobSpec): Promise<readonly ComputeQuote[]>;
  submit(input: SubmitComputeInput): Promise<ComputeJobStatus>;
  poll(jobId: SportaId): Promise<ComputeJobStatus>;
}

/**
 * The synchronous result of one provider execution. Providers report
 * refusals here as first-class typed refusals; the broker never converts
 * a refusal into a failure or a success.
 */
export interface ProviderExecutionResult {
  state: "succeeded" | "failed" | "refused";
  outputArtifactId?: SportaId;
  refusal?: TypedRefusal;
  detail?: string;
}

/**
 * One compute provider (local, user-owned or hosted — all peers).
 * Local execution is a first-class plane, not a fallback of last resort.
 */
export interface ComputeProviderPort {
  readonly providerId: string;
  quote(spec: ComputeJobSpec): Promise<ComputeQuote>;
  execute(spec: ComputeJobSpec): Promise<ProviderExecutionResult>;
}

/** Constructor wiring for ComputeBrokerService (all seams injected). */
export interface ComputeBrokerDeps {
  readonly providers: readonly ComputeProviderPort[];
  readonly clock: ComputeClock;
}
