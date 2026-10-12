import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import { classifyProviderOutcome, FallbackClassificationError } from "../domain/fallback/classify.js";
import {
  defaultFallbackChainPolicy,
  InvalidFallbackChainPolicyError,
  validateFallbackChainPolicy,
} from "../domain/fallback/policy.js";
import type { FallbackChainPolicy, FallbackChainTrail, ProviderAttempt } from "../domain/fallback/types.js";
import {
  aggregateRefusalForTrail,
  AllProvidersExhaustedError,
  lastFailingAttempt,
  summarizeTrailForDetail,
} from "../domain/fallback/trail.js";
import { UnknownComputeJobError } from "../domain/errors.js";
import { policyPermitsJob, requiredUsageForJobKind } from "../domain/policy.js";
import type {
  ComputeBrokerPort,
  ComputeClock,
  ComputeJobSpec,
  ComputeJobState,
  ComputeJobStatus,
  ComputeProviderPort,
  ComputeQuote,
  ProviderExecutionResult,
  SubmitComputeInput,
} from "../domain/ports.js";
import { transitionJob } from "../domain/stateMachine.js";
/**
 * FallbackComputeService — the provider-neutral FALLBACK CHAIN
 * (app layer, additive to the frozen ComputeBrokerService, which is
 * NOT edited and stays the quote-time-selection broker).
 *
 * The chain executes the spec against providers in the deterministic
 * policy order and carries the COMPLETE per-provider attempt trail
 * (B6 visible provider failure): every attempt's providerId, outcome
 * class, refusal/failure detail and clock-stamped timestamp — on the
 * additive trail(jobId) accessor, in the terminal status detail, and
 * in the typed aggregate error.
 *
 *   submit: idempotent per jobId (the terminal outcome replays — a
 *     status, or the SAME typed terminal error for exhaustion /
 *     classification); policy is checked BEFORE submission; then ONE
 *     chain run: queued -> running -> terminal. Per-provider attempts
 *     are trail facts, not job states.
 *
 *   terminal laws: success names the succeeding provider AND every
 *     earlier failed/refused attempt (never hidden); all-refused ends
 *     `refused` with the aggregate refusal (first-refuser law); any
 *     failure in the trail ends `failed` and submit throws the typed
 *     AllProvidersExhaustedError carrying the full trail. A refusal
 *     is never a failure, a failure is never a success, a partial
 *     result is never silent.
 */

const FALLBACK_SERVICE_PROVIDER_ID = "sporta-compute-fallback";

/** Constructor wiring for FallbackComputeService (all seams injected). */
export interface FallbackComputeDeps {
  readonly providers: readonly ComputeProviderPort[];
  readonly clock: ComputeClock;
  /** Defaults to the registration order, one attempt per provider. */
  readonly policy?: FallbackChainPolicy;
}

interface InternalChainJob {
  status: ComputeJobStatus;
  history: ComputeJobState[];
  submittedAt: Iso8601;
  /** The live attempt array of the (synchronous) chain run. */
  attempts: ProviderAttempt[];
  /** The typed error submit threw at terminal — replayed on idempotent retry. */
  terminalThrow?: AllProvidersExhaustedError | FallbackClassificationError;
}

export class FallbackComputeService implements ComputeBrokerPort {
  private readonly chain: readonly ComputeProviderPort[];
  private readonly policy: FallbackChainPolicy;
  private readonly clock: ComputeClock;
  private readonly jobs = new Map<SportaId, InternalChainJob>();
  private nextSequence = 0;

  constructor(deps: FallbackComputeDeps) {
    const registeredIds = deps.providers.map((provider) => provider.providerId);
    const duplicated = registeredIds.find((id, index) => registeredIds.indexOf(id) !== index);
    if (duplicated !== undefined) {
      throw new InvalidFallbackChainPolicyError([
        `duplicate registered provider id "${duplicated}"`,
      ]);
    }
    const policy = deps.policy ?? defaultFallbackChainPolicy(registeredIds);
    validateFallbackChainPolicy(policy, registeredIds);
    this.policy = policy;
    this.clock = deps.clock;
    this.chain = policy.providerOrder.flatMap((id) => {
      const provider = deps.providers.find((candidate) => candidate.providerId === id);
      return provider === undefined ? [] : [provider];
    });
  }

  async quote(spec: ComputeJobSpec): Promise<readonly ComputeQuote[]> {
    return Promise.all(this.chain.map((provider) => provider.quote(spec)));
  }

  async submit(input: SubmitComputeInput): Promise<ComputeJobStatus> {
    const jobId = input.jobId ?? this.mintJobId();
    const existing = this.jobs.get(jobId);
    if (existing !== undefined) {
      // Idempotent replay: the terminal outcome replays — the stored
      // typed terminal error if submit threw, else the stored status.
      // A provider NEVER re-executes for the same jobId.
      if (existing.terminalThrow !== undefined) throw existing.terminalThrow;
      return existing.status;
    }

    // 1. Policy check BEFORE submission — the job never reaches a provider.
    if (!policyPermitsJob(input.policy, input.spec.kind)) {
      const usage = requiredUsageForJobKind(input.spec.kind);
      return this.createJob(jobId, {
        jobId,
        state: "refused",
        providerId: FALLBACK_SERVICE_PROVIDER_ID,
        refusal: {
          kind: "policy-denied",
          providerId: FALLBACK_SERVICE_PROVIDER_ID,
          detail: `policy rights.usages must include "${usage}" for job kind "${input.spec.kind}"`,
        },
        detail: `policy-denied: missing usage "${usage}"`,
      });
    }

    // 2. One chain run: queued -> running -> terminal (per-provider
    //    attempts are trail facts, not job states).
    const headProviderId = this.chain[0]?.providerId ?? FALLBACK_SERVICE_PROVIDER_ID;
    const attempts: ProviderAttempt[] = [];
    this.createJob(jobId, { jobId, state: "queued", providerId: headProviderId }, attempts);
    this.applyStatus(jobId, { jobId, state: "running", providerId: headProviderId });
    try {
      await this.runChain(attempts, input.spec);
    } catch (error) {
      if (!(error instanceof FallbackClassificationError)) throw error;
      // Fail-closed AND ledger-coherent: record the honest terminal
      // failure, then the typed error still propagates.
      this.applyStatus(jobId, {
        jobId,
        state: "failed",
        providerId: FALLBACK_SERVICE_PROVIDER_ID,
        detail: `provider returned an ill-shaped result: ${error.message}`,
      });
      this.terminalThrow(jobId, error);
      throw error;
    }

    // 3. Terminal — the trail decides, never a conversion.
    const last = attempts[attempts.length - 1];
    if (last !== undefined && last.outcomeClass === "succeeded") {
      // Earlier failures/refusals stay VISIBLE in the success detail.
      return this.applyStatus(jobId, {
        jobId,
        state: "succeeded",
        providerId: last.providerId,
        outputArtifactId: last.outputArtifactId,
        detail: summarizeTrailForDetail(attempts),
      });
    }
    const aggregate = aggregateRefusalForTrail(attempts);
    if (aggregate !== null) {
      // Every provider refused: `refused` (never failed, never
      // succeeded) with the first-refuser aggregate law.
      return this.applyStatus(jobId, {
        jobId,
        state: "refused",
        providerId: aggregate.providerId,
        refusal: aggregate,
        detail: summarizeTrailForDetail(attempts),
      });
    }
    const failure = lastFailingAttempt(attempts);
    if (failure === undefined) {
      // Unreachable per the trail laws (a non-succeeded, non-all-refused
      // trail carries at least one failure) — fail-closed, never a
      // silent default.
      throw new FallbackClassificationError(
        "the chain trail is neither succeeded, all-refused nor failure-carrying",
        "trail-incoherent",
        attempts,
      );
    }
    this.applyStatus(jobId, {
      jobId,
      state: "failed",
      providerId: failure.providerId,
      detail: summarizeTrailForDetail(attempts),
    });
    const job = this.jobs.get(jobId);
    const exhaustion = new AllProvidersExhaustedError(jobId, job?.attempts ?? attempts);
    if (job !== undefined) job.terminalThrow = exhaustion;
    throw exhaustion;
  }

  async poll(jobId: SportaId): Promise<ComputeJobStatus> {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new UnknownComputeJobError(`unknown compute job ${jobId}`, jobId);
    }
    return job.status;
  }

  /** Additive accessor: the full per-provider attempt trail (B6 evidence). */
  trail(jobId: SportaId): FallbackChainTrail {
    const job = this.jobs.get(jobId);
    if (job === undefined) {
      throw new UnknownComputeJobError(`unknown compute job ${jobId}`, jobId);
    }
    return { jobId, attempts: [...job.attempts], jobState: job.status.state };
  }

  /** Additive accessor: the job's state history (queued -> running -> terminal). */
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

  /**
   * The deterministic chain run: execute each provider in policy
   * order; per provider, the attempt loop advances on refusals and
   * terminal failures, and re-enters the SAME provider on retryable
   * failures ONLY when the policy allows it and the attempt budget
   * remains.
   */
  private async runChain(attempts: ProviderAttempt[], spec: ComputeJobSpec): Promise<void> {
    for (const provider of this.chain) {
      let attemptNumber = 0;
      for (;;) {
        attemptNumber += 1;
        const result = await this.executeProvider(provider, spec);
        const outcomeClass = classifyProviderOutcome(result);
        attempts.push({
          providerId: provider.providerId,
          outcomeClass,
          attemptNumber,
          attemptedAt: this.clock.now(),
          refusal: outcomeClass === "terminal-refusal" ? result.refusal : undefined,
          failureDetail:
            outcomeClass === "retryable-failure" || outcomeClass === "terminal-failure"
              ? (result.detail ?? "provider failed without a detail")
              : undefined,
          outputArtifactId: outcomeClass === "succeeded" ? result.outputArtifactId : undefined,
        });
        if (outcomeClass === "succeeded") return;
        if (
          outcomeClass === "retryable-failure" &&
          this.policy.retrySameProviderOnRetryableFailure &&
          attemptNumber < this.policy.maxAttemptsPerProvider
        ) {
          continue;
        }
        break; // refusals and terminal failures NEVER re-enter the provider
      }
    }
  }

  /** The frozen-broker crash law: a throw is an honest failure, never a refusal or success. */
  private async executeProvider(
    provider: ComputeProviderPort,
    spec: ComputeJobSpec,
  ): Promise<ProviderExecutionResult> {
    try {
      return await provider.execute(spec);
    } catch (error) {
      return {
        state: "failed",
        detail: `provider threw: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private createJob(jobId: SportaId, status: ComputeJobStatus, attempts: ProviderAttempt[] = []): ComputeJobStatus {
    this.jobs.set(jobId, { status, history: [status.state], submittedAt: this.clock.now(), attempts });
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

  /** Record the typed terminal error an idempotent retry must replay. */
  private terminalThrow(jobId: SportaId, error: AllProvidersExhaustedError | FallbackClassificationError): void {
    const job = this.jobs.get(jobId);
    if (job !== undefined) job.terminalThrow = error;
  }

  private mintJobId(): SportaId {
    this.nextSequence += 1;
    return `job:${this.nextSequence}`;
  }
}
