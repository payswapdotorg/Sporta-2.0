/**
 * FsComputeBrokerService — the durable compute broker (adapters
 * layer): a COMPOSITION over the untouched ComputeBrokerService that
 * persists its job ledger through a FsComputeJobLedger.
 *
 * ComputeBrokerService is NOT edited (P8 additive law): the wrapper
 * goes through its port-shaped public surface only — quote/submit/
 * poll plus the additive history/submittedAt accessors — and maps
 * the in-memory job ledger onto disk:
 *
 *   submit: a caller-provided jobId already in the ledger returns
 *     the PERSISTED status without executing (idempotent across
 *     restarts — byte-identical, the provider never re-executes);
 *     otherwise the inner broker runs the job and the terminal
 *     status, full state history and submittedAt are persisted.
 *
 *   minted ids (no caller jobId): probe-and-advance past ids already
 *     persisted — a fresh broker over an old ledger never reuses a
 *     persisted job's id. The chosen id is passed explicitly, so the
 *     inner broker never mints its own.
 *
 *   poll/history/submittedAt: inner broker first; on
 *     UnknownComputeJobError (a fresh inner after a restart) the
 *     ledger's persisted record answers; absent in both, the typed
 *     error stands — never a fabricated status.
 *
 * Honest limitation: the inner broker is synchronous — it reaches a
 * terminal state inside submit, so what persists is terminal state.
 * A submit interrupted before the ledger write leaves no ledger
 * entry and the job honestly does not survive. Persisted refusals
 * replay byte-identically (invariant 17: a refusal stays a refusal).
 */
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import { ComputeBrokerService } from "../app/ComputeBrokerService.js";
import { UnknownComputeJobError } from "../domain/errors.js";
import type {
  ComputeBrokerDeps,
  ComputeBrokerPort,
  ComputeJobSpec,
  ComputeJobState,
  ComputeJobStatus,
  ComputeQuote,
  SubmitComputeInput,
} from "../domain/ports.js";
import type { FsComputeJobLedger } from "./fsComputeJobLedger.js";

/** Constructor wiring for FsComputeBrokerService (broker seams + ledger). */
export interface FsComputeBrokerDeps extends ComputeBrokerDeps {
  readonly ledger: FsComputeJobLedger;
}

export class FsComputeBrokerService implements ComputeBrokerPort {
  private readonly inner: ComputeBrokerService;
  private readonly ledger: FsComputeJobLedger;
  private nextSequence = 0;

  constructor(deps: FsComputeBrokerDeps) {
    this.inner = new ComputeBrokerService({ providers: deps.providers, clock: deps.clock });
    this.ledger = deps.ledger;
  }

  async quote(spec: ComputeJobSpec): Promise<readonly ComputeQuote[]> {
    return this.inner.quote(spec);
  }

  async submit(input: SubmitComputeInput): Promise<ComputeJobStatus> {
    // Idempotent across restarts: a persisted jobId answers from the
    // ledger without executing — the job survives byte-identically.
    if (input.jobId !== undefined) {
      const persisted = await this.ledger.readJob(input.jobId);
      if (persisted !== null) return persisted.status;
    }
    const jobId = input.jobId ?? (await this.mintJobId());
    const status = await this.inner.submit({ ...input, jobId });
    // Persist through the port-shaped seam: the inner's own additive
    // accessors carry the history and submission timestamp.
    await this.ledger.saveJob({
      jobId,
      status,
      history: this.inner.history(jobId),
      submittedAt: this.inner.submittedAt(jobId),
    });
    return status;
  }

  async poll(jobId: SportaId): Promise<ComputeJobStatus> {
    try {
      return await this.inner.poll(jobId);
    } catch (error) {
      if (!(error instanceof UnknownComputeJobError)) throw error;
      const persisted = await this.ledger.readJob(jobId);
      if (persisted === null) throw error;
      return persisted.status;
    }
  }

  /** Additive accessor (async: the durable seam is): the job's state history. */
  async history(jobId: SportaId): Promise<readonly ComputeJobState[]> {
    try {
      return this.inner.history(jobId);
    } catch (error) {
      if (!(error instanceof UnknownComputeJobError)) throw error;
      const persisted = await this.ledger.readJob(jobId);
      if (persisted === null) throw error;
      return [...persisted.history];
    }
  }

  /** Additive accessor (async: the durable seam is): when the job was submitted. */
  async submittedAt(jobId: SportaId): Promise<Iso8601> {
    try {
      return this.inner.submittedAt(jobId);
    } catch (error) {
      if (!(error instanceof UnknownComputeJobError)) throw error;
      const persisted = await this.ledger.readJob(jobId);
      if (persisted === null) throw error;
      return persisted.submittedAt;
    }
  }

  /** The inner broker (for hosts that need the untouched surface too). */
  protected broker(): ComputeBrokerService {
    return this.inner;
  }

  /**
   * Mint a fresh job id, skipping ids already persisted in the ledger
   * (probe-and-advance) — a fresh broker over an old ledger never
   * reuses a persisted job's id.
   */
  private async mintJobId(): Promise<SportaId> {
    for (;;) {
      this.nextSequence += 1;
      const candidate: SportaId = `job:${this.nextSequence}`;
      if (!(await this.ledger.hasJob(candidate))) return candidate;
    }
  }
}
