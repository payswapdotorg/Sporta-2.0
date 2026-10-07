import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import { UnknownComputeJobError } from "../domain/errors.js";
import { policyPermitsJob, requiredUsageForJobKind } from "../domain/policy.js";
import type {
  ComputeBrokerDeps,
  ComputeBrokerPort,
  ComputeJobSpec,
  ComputeJobState,
  ComputeJobStatus,
  ComputeProviderPort,
  ComputeQuote,
  ProviderExecutionResult,
  SubmitComputeInput,
  TypedRefusal,
} from "../domain/ports.js";
import { transitionJob } from "../domain/stateMachine.js";
/**
 * ComputeBrokerService — the provider-neutral compute broker
 * (fixture-grade, synchronous execution).
 *
 * Quotes from every provider (refusals visible); submission idempotent
 * per jobId with policy checked BEFORE submission; refusals surface as
 * first-class terminal states (see SPEC.md).
 */

const BROKER_PROVIDER_ID = "sporta-compute-broker";

interface InternalJob {
  status: ComputeJobStatus;
  history: ComputeJobState[];
  submittedAt: Iso8601;
}

export class ComputeBrokerService implements ComputeBrokerPort {
  private readonly deps: ComputeBrokerDeps;
  private readonly jobs = new Map<SportaId, InternalJob>();
  private nextSequence = 0;

  constructor(deps: ComputeBrokerDeps) {
    this.deps = deps;
  }

  async quote(spec: ComputeJobSpec): Promise<readonly ComputeQuote[]> {
    return Promise.all(this.deps.providers.map((provider) => provider.quote(spec)));
  }

  async submit(input: SubmitComputeInput): Promise<ComputeJobStatus> {
    const jobId = input.jobId ?? this.mintJobId();
    const existing = this.jobs.get(jobId);
    if (existing !== undefined) return existing.status; // idempotent retry

    // 1. Policy check BEFORE submission — the job never reaches a provider.
    if (!policyPermitsJob(input.policy, input.spec.kind)) {
      const usage = requiredUsageForJobKind(input.spec.kind);
      return this.createJob(jobId, {
        jobId,
        state: "refused",
        providerId: BROKER_PROVIDER_ID,
        refusal: {
          kind: "policy-denied",
          providerId: BROKER_PROVIDER_ID,
          detail: `policy rights.usages must include "${usage}" for job kind "${input.spec.kind}"`,
        },
        detail: `policy-denied: missing usage "${usage}"`,
      });
    }

    // 2. Provider selection: first (registration order) non-refusing quote.
    let chosen: ComputeProviderPort | undefined;
    let firstRefusal: TypedRefusal | undefined;
    for (const provider of this.deps.providers) {
      const quote = await provider.quote(input.spec);
      if (quote.refusal === undefined) {
        chosen = provider;
        break;
      }
      if (firstRefusal === undefined) firstRefusal = quote.refusal;
    }
    if (chosen === undefined) {
      const refusal: TypedRefusal = firstRefusal ?? {
        kind: "provider-unavailable",
        providerId: BROKER_PROVIDER_ID,
        detail: "no compute provider is registered",
      };
      this.createJob(jobId, { jobId, state: "queued", providerId: refusal.providerId });
      return this.applyStatus(jobId, {
        jobId,
        state: "refused",
        providerId: refusal.providerId,
        refusal,
        detail: "every provider refused at quote time",
      });
    }

    // 3. Execute: queued -> running -> terminal (synchronous fixture).
    this.createJob(jobId, { jobId, state: "queued", providerId: chosen.providerId });
    this.applyStatus(jobId, { jobId, state: "running", providerId: chosen.providerId });
    let result: ProviderExecutionResult;
    try {
      result = await chosen.execute(input.spec);
    } catch (error) {
      result = {
        state: "failed",
        detail: `provider threw: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (result.state === "succeeded") {
      return this.applyStatus(jobId, {
        jobId,
        state: "succeeded",
        providerId: chosen.providerId,
        outputArtifactId: result.outputArtifactId,
      });
    }
    if (result.state === "failed") {
      return this.applyStatus(jobId, {
        jobId,
        state: "failed",
        providerId: chosen.providerId,
        detail: result.detail,
      });
    }
    return this.applyStatus(jobId, {
      jobId,
      state: "refused",
      providerId: chosen.providerId,
      refusal: result.refusal,
      detail: result.detail ?? "provider refused execution",
    });
  }

  async poll(jobId: SportaId): Promise<ComputeJobStatus> {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new UnknownComputeJobError(`unknown compute job ${jobId}`, jobId);
    }
    return job.status;
  }

  /** Additive accessor: the full state history of a job (evidence). */
  history(jobId: SportaId): readonly ComputeJobState[] {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new UnknownComputeJobError(`unknown compute job ${jobId}`, jobId);
    }
    return [...job.history];
  }

  /** Additive accessor: when the job was submitted (injected clock). */
  submittedAt(jobId: SportaId): Iso8601 {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new UnknownComputeJobError(`unknown compute job ${jobId}`, jobId);
    }
    return job.submittedAt;
  }

  private createJob(jobId: SportaId, status: ComputeJobStatus): ComputeJobStatus {
    this.jobs.set(jobId, { status, history: [status.state], submittedAt: this.deps.clock.now() });
    return status;
  }

  private applyStatus(jobId: SportaId, next: ComputeJobStatus): ComputeJobStatus {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new UnknownComputeJobError(`unknown compute job ${jobId}`, jobId);
    }
    job.history.push(transitionJob(job.status.state, next.state));
    job.status = next;
    return next;
  }

  private mintJobId(): SportaId {
    this.nextSequence += 1;
    return `job:${this.nextSequence}`;
  }
}
