import type {
  ComputeJobSpec,
  ComputeProviderPort,
  ComputeQuote,
  ProviderExecutionResult,
} from "../domain/ports.js";
/**
 * Fixture compute providers (fixture-grade, in-memory).
 *
 * Two peers prove the broker's refusal semantics: a LOCAL provider that
 * executes trivial job kinds deterministically and a provider that
 * always refuses with a typed refusal. Real provider integrations
 * (ZCode tool system, hosted planes) are Wave 2.
 */

/**
 * Local in-memory provider: executes trivial job kinds deterministically
 * (kind "echo" succeeds with a deterministic output artifact id); other
 * kinds are a typed unsupported-operation refusal.
 */
export class LocalEchoComputeProvider implements ComputeProviderPort {
  readonly providerId = "local-in-memory";
  /** Fixture observability: how many executions actually ran. */
  executionCount = 0;

  async quote(_spec: ComputeJobSpec): Promise<ComputeQuote> {
    return {
      providerId: this.providerId,
      estimatedLatencyMs: 5,
      estimatedCost: { currency: "USD", amount: 0 },
    };
  }

  async execute(spec: ComputeJobSpec): Promise<ProviderExecutionResult> {
    this.executionCount += 1;
    if (spec.kind === "echo") {
      return {
        state: "succeeded",
        outputArtifactId: `out:echo:${spec.inputs.join(",")}`,
      };
    }
    return {
      state: "refused",
      refusal: {
        kind: "unsupported-operation",
        providerId: this.providerId,
        detail: `the local fixture provider only executes job kind "echo" (got "${spec.kind}")`,
      },
    };
  }
}

/**
 * Always-refusing provider: models an unavailable provider plane. Its
 * refusals stay visible at quote time AND execution time — the broker
 * must never convert them into failures or successes.
 */
export class RefusingComputeProvider implements ComputeProviderPort {
  readonly providerId = "refusing-fixture";
  quoteCount = 0;

  private refusal(): {
    kind: "provider-unavailable";
    providerId: string;
    detail: string;
  } {
    return {
      kind: "provider-unavailable",
      providerId: this.providerId,
      detail: "the fixture provider is always unavailable",
    };
  }

  async quote(_spec: ComputeJobSpec): Promise<ComputeQuote> {
    this.quoteCount += 1;
    return { providerId: this.providerId, refusal: this.refusal() };
  }

  async execute(_spec: ComputeJobSpec): Promise<ProviderExecutionResult> {
    return { state: "refused", refusal: this.refusal() };
  }
}
