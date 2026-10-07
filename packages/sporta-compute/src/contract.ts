/**
 * sporta-compute — provider-neutral compute broker.
 *
 * Local and user-owned compute are first-class. Provider failure is a
 * typed refusal/fallback, never semantic corruption (invariant 16).
 */
import type { PolicySet, SportaId } from "@sporta/contracts/contract";

export type { PolicySet } from "@sporta/contracts/contract";

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
