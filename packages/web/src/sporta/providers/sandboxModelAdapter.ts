/**
 * W10B-1 — the model lane's REAL sandbox adapter (providers root, host
 * layer — packages/web ONLY; the frozen sporta-transforms package stays
 * external-dep-free by the ADR placement law).
 *
 * EVIDENCE CLASS: REAL — every invocation is a REAL chat-completion
 * network call through `z-ai-web-dev-sdk` (the sandbox's model service,
 * resolvable at v0.0.18 from this environment) with MEASURED wall-clock
 * latency and HONEST cost (null unless the service reports one).
 * `providerId: "zai:glm-sandbox"`, `evidenceGrade: "real"`, label
 * "real sandbox model service" — the honest labels of a real sandbox
 * service, never a public commercial provider (ADR rule 13).
 *
 * OUTAGE LAW (ADR rule 14): service unavailability, timeout, malformed
 * response and content refusal are TYPED refusals over the frozen
 * `TransformModelRefusalKind` set (mapping documented in SPEC.md — the
 * frozen contract defines no additive kinds, so the packet's four lanes
 * map onto the existing five). An outage NEVER fabricates output and
 * NEVER silently becomes a fixture: `evidenceGrade` stays "real" on
 * refusals too. Falling back to a fixture lane is a caller policy
 * recorded in run evidence, never an adapter behavior.
 *
 * DEPS LAW: the SDK client is INJECTED through the narrow
 * `SandboxChatCompletionClient` seam (constructor deps); tests inject
 * recording clients for the refusal lanes; the default path lazily
 * constructs the REAL SDK client (the path the REAL network test
 * exercises). No test-only behavior switches live in this file.
 *
 * HEADLESS HOST LAW: this module never enters the browser bundle (the
 * composition.ts law); the UI never imports provider internals — callers
 * go through the frozen `TransformModelPort`.
 */
import ZAI from "z-ai-web-dev-sdk";
import type {
  TransformModelInvokeInput,
  TransformModelInvokeOutput,
  TransformModelPort,
  TransformModelRefusalKind,
} from "@sporta/transforms/contract";

/** The frozen port this adapter implements (imported, never edited). */
export type { TransformModelInvokeInput, TransformModelInvokeOutput, TransformModelPort } from "@sporta/transforms/contract";

/** Honest provider identity (P10-09: asserted exactly by tests). */
export const SANDBOX_MODEL_PROVIDER_ID = "zai:glm-sandbox";
/** The honest label of a real sandbox model service (never "production"). */
export const SANDBOX_MODEL_PROVIDER_LABEL = "real sandbox model service";

/** Default wall-clock deadline per invocation (milliseconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Declared lane preamble (short, fixed — the port's prompt is the payload). */
const LANE_SYSTEM_MESSAGE =
  "You are the Sporta transform model lane (real sandbox model service). Complete the user payload faithfully.";

/** One chat message (mirrors the SDK's ChatMessage shape; self-typed so this file owns no SDK type). */
export interface SandboxChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The minimal request this lane sends (pass-through: model + thinking only). */
export interface SandboxChatCompletionRequest {
  messages: readonly SandboxChatMessage[];
  model?: string;
  thinking?: { type: "enabled" | "disabled" };
}

/**
 * The injected client seam: one chat-completion call per invocation.
 * Returns `unknown` on purpose — the SDK types completions loosely, so
 * shape failures are REAL and must be typed, never stringly-crashed.
 */
export interface SandboxChatCompletionClient {
  createChatCompletion(request: SandboxChatCompletionRequest): Promise<unknown>;
}

/**
 * Construct the REAL client over `z-ai-web-dev-sdk` (async factory:
 * `ZAI.create()` resolves the sandbox service configuration). Exposed
 * for host composition; the adapter also uses it lazily by default.
 */
export async function createZaiSandboxModelClient(): Promise<SandboxChatCompletionClient> {
  const zai = await ZAI.create();
  return {
    async createChatCompletion(request: SandboxChatCompletionRequest): Promise<unknown> {
      return zai.chat.completions.create({
        messages: [...request.messages],
        ...(request.model !== undefined ? { model: request.model } : {}),
        thinking: request.thinking ?? { type: "disabled" },
      });
    },
  };
}

/** Constructor deps — every IO seam injectable; no test-only switches. */
export interface SandboxModelAdapterDeps {
  /** Injected client (tests: recording clients). Default: the REAL SDK client, lazily constructed on first invocation. */
  client?: SandboxChatCompletionClient;
  /** Wall-clock deadline per invocation in ms (default 30 000; must be > 0). */
  timeoutMs?: number;
}

/** Internal marker: the declared wall-clock deadline won the race. Never escapes this file. */
class SandboxDeadlineMarker {
  constructor(readonly timeoutMs: number) {}
}

/** The REAL model adapter. See the file header for the evidence and outage laws. */
export class SandboxModelAdapter implements TransformModelPort {
  readonly #injected: SandboxChatCompletionClient | null;
  readonly #timeoutMs: number;
  #realClient: Promise<SandboxChatCompletionClient> | null = null;

  constructor(deps: SandboxModelAdapterDeps = {}) {
    this.#injected = deps.client ?? null;
    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`SandboxModelAdapter: timeoutMs must be a positive finite number (got ${timeoutMs})`);
    }
    this.#timeoutMs = timeoutMs;
  }

  async invokeModel(input: TransformModelInvokeInput): Promise<TransformModelInvokeOutput> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const base = { providerId: SANDBOX_MODEL_PROVIDER_ID, evidenceGrade: "real" as const };
    try {
      const client = await this.#resolveClient();
      const completion = await this.#withDeadline(
        client.createChatCompletion({
          messages: [
            { role: "system", content: LANE_SYSTEM_MESSAGE },
            { role: "user", content: input.prompt },
          ],
          ...(typeof input.parameters.model === "string" ? { model: input.parameters.model } : {}),
          thinking: { type: "disabled" },
        }),
      );
      const extracted = extractCompletion(completion);
      if (!extracted.ok) {
        return {
          ...base,
          output: null,
          refusal: { kind: extracted.kind, detail: extracted.detail },
          timingMs: elapsed(),
          cost: null,
          detail: `sandbox refusal: ${extracted.kind}`,
        };
      }
      const { content, cost, usageNote } = extracted.value;
      const usageSuffix = usageNote !== null ? `; ${usageNote}` : "";
      return {
        ...base,
        output: content,
        refusal: null,
        timingMs: elapsed(),
        cost,
        detail: `${SANDBOX_MODEL_PROVIDER_LABEL} (labeled real; model ${input.modelRef.name} @ ${input.modelRef.digest}${usageSuffix})`,
      };
    } catch (error) {
      const classified = classifyThrown(error);
      return {
        ...base,
        output: null,
        refusal: { kind: classified.kind, detail: classified.detail },
        timingMs: elapsed(),
        cost: null,
        detail: `sandbox refusal: ${classified.kind}`,
      };
    }
  }

  /** The injected client, or the lazily-constructed REAL one (memoized). */
  async #resolveClient(): Promise<SandboxChatCompletionClient> {
    if (this.#injected !== null) return this.#injected;
    this.#realClient ??= createZaiSandboxModelClient();
    return this.#realClient;
  }

  /** Race one invocation against the declared wall-clock deadline (AbortSignal.timeout; never keeps the loop alive). */
  #withDeadline<T>(promise: Promise<T>): Promise<T> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new SandboxDeadlineMarker(this.#timeoutMs));
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }
}

/** Narrow `unknown` to a record (defensive — the SDK's completions are untyped). */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** A typed refusal classification (the frozen five-kind set; mapping per SPEC.md). */
type RefusalClassification = { kind: TransformModelRefusalKind; detail: string };

/** The usable heart of one completion. */
interface ExtractedCompletion {
  content: string;
  cost: { amount: number; currency: string } | null;
  usageNote: string | null;
}

/** Extraction outcome: usable content, or a typed refusal classification. */
type ExtractionResult = { ok: true; value: ExtractedCompletion } | ({ ok: false } & RefusalClassification);

/**
 * Extract the usable completion from an `unknown` response, honestly:
 * malformed shapes are TYPED refusals; content refusal is detected only
 * from service-declared filter signals (never guessed from output text);
 * cost is surfaced verbatim when the service reports one.
 */
function extractCompletion(response: unknown): ExtractionResult {
  const root = asRecord(response);
  if (root === null) return { ok: false, kind: "unsupported-operation", detail: "malformed response from the sandbox model service: response is not an object" };
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, kind: "unsupported-operation", detail: "malformed response from the sandbox model service: no choices array" };
  }
  const choice = asRecord(choices[0]);
  if (choice === null) return { ok: false, kind: "unsupported-operation", detail: "malformed response from the sandbox model service: first choice is not an object" };
  const message = asRecord(choice.message);
  if (message === null) return { ok: false, kind: "unsupported-operation", detail: "malformed response from the sandbox model service: first choice carries no message object" };
  const content = message.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    // Content-refusal detection is SIGNAL-based: only a service-declared
    // filter marker counts (finish_reason / message.refusal), never a guess.
    const finishReason = choice.finish_reason;
    const declaredRefusal = typeof message.refusal === "string" ? message.refusal : null;
    if (finishReason === "content_filter" || declaredRefusal !== null) {
      const signal = finishReason === "content_filter" ? "finish_reason=content_filter" : `message.refusal="${declaredRefusal}"`;
      return { ok: false, kind: "policy-denied", detail: `content refused by the sandbox model service (${signal})` };
    }
    return { ok: false, kind: "unsupported-operation", detail: "malformed response from the sandbox model service: first choice carries no usable content string" };
  }
  return { ok: true, value: { content, cost: extractCost(root), usageNote: extractUsageNote(root) } };
}

/** Cost verbatim when the service reports a machine-readable cost object; null otherwise. */
function extractCost(root: Record<string, unknown>): { amount: number; currency: string } | null {
  const cost = asRecord(root.cost);
  if (cost === null) return null;
  const amount = cost.amount;
  const currency = cost.currency;
  if (typeof amount !== "number" || !Number.isFinite(amount) || typeof currency !== "string" || currency.length === 0) {
    return null;
  }
  return { amount, currency };
}

/** Token usage as DETAIL evidence (never as cost) when the service reports it. */
function extractUsageNote(root: Record<string, unknown>): string | null {
  const usage = asRecord(root.usage);
  if (usage === null) return null;
  const totalTokens = usage.total_tokens;
  if (typeof totalTokens !== "number" || !Number.isFinite(totalTokens)) return null;
  return `service-reported usage total_tokens: ${totalTokens}`;
}

/**
 * Classify a thrown failure onto the frozen refusal-kind set (SPEC.md
 * mapping): deadline → provider-unavailable (timeout); SDK configuration
 * missing → credentials-missing; the SDK's HTTP failures carry the
 * status in the message (401/403 credentials, 429 quota, 400/422
 * request-shape, else provider-unavailable); anything else thrown is an
 * unreachable service. The original error text is always retained.
 */
function classifyThrown(error: unknown): RefusalClassification {
  if (error instanceof SandboxDeadlineMarker) {
    return { kind: "provider-unavailable", detail: `sandbox model service timed out after ${error.timeoutMs}ms (no completion before the declared wall-clock deadline)` };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/configuration file not found/i.test(message)) {
    return { kind: "credentials-missing", detail: `sandbox model service credentials missing (SDK configuration not found): ${message}` };
  }
  const statusMatch = /API request failed with status (\d+)/.exec(message);
  if (statusMatch !== null) {
    const status = Number(statusMatch[1]);
    if (status === 401 || status === 403) {
      return { kind: "credentials-missing", detail: `sandbox model service rejected the credentials (HTTP ${status}): ${message}` };
    }
    if (status === 429) {
      return { kind: "quota-exhausted", detail: `sandbox model service quota exhausted (HTTP 429): ${message}` };
    }
    if (status === 400 || status === 422) {
      return { kind: "unsupported-operation", detail: `sandbox model service rejected the request shape (HTTP ${status}): ${message}` };
    }
    return { kind: "provider-unavailable", detail: `sandbox model service reported HTTP ${status}: ${message}` };
  }
  return { kind: "provider-unavailable", detail: `sandbox model service unreachable: ${message}` };
}
