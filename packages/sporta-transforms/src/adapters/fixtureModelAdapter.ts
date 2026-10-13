/**
 * W9A-3 — the model lane's FIXTURE adapter (adapters layer).
 *
 * EVIDENCE CLASS: FIXTURE — this adapter is deterministic, carries NO
 * provider credentials and reports `evidenceGrade: "fixture"` with
 * `cost: null` on every invocation. It exists so the provider-neutral
 * `TransformModelPort` lane is exercised end-to-end TODAY; a REAL
 * provider adapter plugs the same port later without contract
 * changes, and its evidence grade must be "real" with real cost
 * numbers only. Nothing here is ever reported as REAL evidence.
 *
 * Fixture behavior (deterministic, documented): parses the prompt as
 * an NDJSON event stream (the first-slice event shape) and produces a
 * JSON summary — event count, entity counts, time window, confidence
 * range. `forceRefusal: "<kind>"` forces the typed refusal lane for
 * fallback/failure tests (declared, labeled, never silent).
 */
import type {
  TransformModelInvokeInput,
  TransformModelInvokeOutput,
  TransformModelPort,
  TransformModelRefusalKind,
} from "../domain/ports.js";

/** The refusal kinds a forced refusal may name (the compute precedent set). */
const REFUSAL_KINDS: readonly string[] = [
  "provider-unavailable",
  "quota-exhausted",
  "credentials-missing",
  "policy-denied",
  "unsupported-operation",
];

export interface FixtureTransformModelDeps {
  /** Override the provider id label (default "fixture:model-lane"). */
  providerId?: string;
}

/** The FIXTURE model adapter. See the file header for the evidence law. */
export class FixtureTransformModelAdapter implements TransformModelPort {
  private readonly providerId: string;

  constructor(deps: FixtureTransformModelDeps = {}) {
    this.providerId = deps.providerId ?? "fixture:model-lane";
  }

  async invokeModel(input: TransformModelInvokeInput): Promise<TransformModelInvokeOutput> {
    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;
    const base = { providerId: this.providerId, evidenceGrade: "fixture" as const, cost: null };

    const forced = input.parameters.forceRefusal;
    if (typeof forced === "string" && REFUSAL_KINDS.includes(forced)) {
      return {
        ...base,
        output: null,
        refusal: { kind: forced as TransformModelRefusalKind, detail: `fixture refusal forced for lane test (${forced})` },
        timingMs: elapsed(),
        detail: `fixture refusal: ${forced}`,
      };
    }

    const summary = summarizeEventStream(input.prompt);
    if (typeof summary !== "object") {
      return {
        ...base,
        output: null,
        refusal: {
          kind: "unsupported-operation",
          detail: `the fixture model lane expects an NDJSON event-stream prompt (first-slice shape): ${summary}`,
        },
        timingMs: elapsed(),
        detail: "fixture refusal: prompt is not an NDJSON event stream",
      };
    }

    return {
      ...base,
      output: JSON.stringify(summary),
      refusal: null,
      timingMs: elapsed(),
      detail: `fixture-grade deterministic event summary (labeled fixture; model ${input.modelRef.name} @ ${input.modelRef.digest})`,
    };
  }
}

/**
 * Deterministic event-stream summary. Returns the summary record or
 * a string describing why the prompt is not an event stream.
 */
function summarizeEventStream(
  prompt: string,
): { eventCount: number; entityCounts: Record<string, number>; firstAtMs: number | null; lastAtMs: number | null; confidenceRange: [number, number] | null; fixture: true } | string {
  const lines = prompt.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) return "empty prompt";
  const entityCounts: Record<string, number> = {};
  let firstAtMs: number | null = null;
  let lastAtMs: number | null = null;
  let confidenceMin: number | null = null;
  let confidenceMax: number | null = null;
  for (const line of lines) {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) return "line is not an object";
      event = parsed as Record<string, unknown>;
    } catch {
      return "line is not JSON";
    }
    if (typeof event.entityId !== "string" || event.entityId.length === 0) return "entityId missing";
    if (typeof event.atMs !== "number" || !Number.isFinite(event.atMs)) return "atMs missing";
    entityCounts[event.entityId] = (entityCounts[event.entityId] ?? 0) + 1;
    firstAtMs = firstAtMs === null ? event.atMs : Math.min(firstAtMs, event.atMs);
    lastAtMs = lastAtMs === null ? event.atMs : Math.max(lastAtMs, event.atMs);
    if (typeof event.confidence === "number") {
      confidenceMin = confidenceMin === null ? event.confidence : Math.min(confidenceMin, event.confidence);
      confidenceMax = confidenceMax === null ? event.confidence : Math.max(confidenceMax, event.confidence);
    }
  }
  return {
    eventCount: lines.length,
    entityCounts,
    firstAtMs,
    lastAtMs,
    confidenceRange: confidenceMin !== null && confidenceMax !== null ? [confidenceMin, confidenceMax] : null,
    fixture: true,
  };
}
