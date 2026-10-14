# SPEC — Lane W10-B: Real model provider + typed-future documentation

Worker: w10b (P10 Wave 10, Worker B lane). Authority order:
`docs/work-orders/p10-integration-reality-work-orders.md` (Lane W10-B) →
`docs/architecture/adr-p10-integration-reality.md` (rules 13–15, placement law) →
`packages/sporta-transforms/src/contract.ts` + `src/domain/ports.ts` (the FROZEN
`TransformModelPort` surface) → `docs/testing/p10-acceptance.md` (gates
P10-06…P10-10, P10-18).

This SPEC is committed BEFORE implementation (SPEC-first law).

## 1. Ownership and placement

- Owned root: `packages/web/src/sporta/providers/**` (NEW, additive) + the
  minimal web `package.json` wiring for the SDK dependency. Nothing else.
- **Placement law (ADR / P10-18):** `z-ai-web-dev-sdk` becomes a dependency of
  the WEB package ONLY. The frozen `@sporta/transforms` package stays
  external-dep-free; this lane imports its contract, never edits it.
- This module is HOST-LAYER and HEADLESS: like `composition.ts`, it never
  enters the browser bundle (no React file imports it; the UI never imports
  provider internals — callers go through the frozen port).

## 2. The port law (frozen surface, imported only)

`SandboxModelAdapter implements TransformModelPort` from
`@sporta/transforms/contract`:

```ts
invokeModel(input: TransformModelInvokeInput): Promise<TransformModelInvokeOutput>
```

- `TransformModelInvokeInput`: `{ modelRef: {name, digest}; prompt; parameters }`.
- `TransformModelInvokeOutput`: `{ providerId; evidenceGrade; output; refusal;
  timingMs; cost; detail }` — every field is produced on every return, exactly
  as the fixture adapter (`fixtureModelAdapter.ts`) produces them (the port is
  the law; the fixture's internals are not).
- Port behavioral contract (what conformance means): `output` is a non-null
  string exactly when the invocation was not refused; `refusal` is non-null
  exactly when it was; `cost` is `null` unless the service reported one;
  `timingMs` is a real measured number; `evidenceGrade`/`providerId`/`detail`
  are the adapter's honest identity.

## 3. Provider identity (honest labels — P10-09)

- `providerId`: `"zai:glm-sandbox"` (exact).
- `evidenceGrade`: `"real"` (exact — a REAL sandbox model service, never
  "production", never a public commercial provider; ADR rule 13).
- Label string: `"real sandbox model service"` (exact; carried in every
  success `detail` and exported as `SANDBOX_MODEL_PROVIDER_LABEL`).

## 4. Adapter design (`sandboxModelAdapter.ts`)

**Injected client seam.** The SDK client is a constructor-injected dependency
(`SandboxModelAdapterDeps.client?: SandboxChatCompletionClient`) — a narrow,
self-typed interface (`createChatCompletion(request): Promise<unknown>`),
NOT the SDK type (the frozen contract stays SDK-free; tests inject recording
clients). When no client is injected, the adapter lazily constructs the REAL
client through `ZAI.create()` (`z-ai-web-dev-sdk`, resolved at v0.0.18) on
first invocation; that default path is the one the REAL network test
exercises. No test-only behavior switches exist in src — only constructor
deps, per the packet.

**Real invocation.** One chat-completion call per `invokeModel`:
`messages = [systemLaneMessage, {role:"user", content: input.prompt}]`,
`thinking: {type: "disabled"}`. Parameter pass-through is minimal and
declared: a string `parameters.model` is forwarded; every other parameter is
ignored (never fabricated into request fields).

**Latency (measured, never estimated).** `timingMs = Date.now()` delta from
method entry to return (the fixture adapter's exact measurement point),
covering client acquisition (first call) + network round-trip.

**Cost (honest).** `null` unless the service response carries a machine-
readable `{amount: number, currency: string}` cost object — then surfaced
verbatim. Token `usage`, when present, is reported in `detail` as evidence,
never as cost.

**Wall-clock deadline.** `deps.timeoutMs` (default 30 000, must be > 0).
The invocation is raced against the deadline via `AbortSignal.timeout`;
losing the race yields the typed timeout refusal below. No unbounded wait.

## 5. Refusal mapping (frozen `TransformModelRefusalKind` set)

The frozen contract defines five kinds; the packet's four required failure
lanes map onto them (NO contract edit — additive kinds are not defined by
the frozen surface, so none are added):

| Failure lane (packet) | Refusal kind (frozen) | Detail signature |
|---|---|---|
| service unreachable | `provider-unavailable` | `sandbox model service unreachable: …` (original error retained) |
| timeout | `provider-unavailable` | `sandbox model service timed out after {timeoutMs}ms` |
| malformed response | `unsupported-operation` | `malformed response from the sandbox model service: …` |
| content refusal | `policy-denied` | `content refused by the sandbox model service: …` |

Additional honest classifications of real SDK failure modes (same frozen set):
SDK configuration missing → `credentials-missing`; HTTP status 401/403 →
`credentials-missing`; 429 → `quota-exhausted`; 400/422 (request shape
rejected) → `unsupported-operation`; any other thrown error →
`provider-unavailable`.

**Outage law (ADR rule 14):** an outage NEVER fabricates output, NEVER
silently becomes a fixture (`evidenceGrade` stays `"real"` on refusals), and
never corrupts the record. Falling back to a fixture lane is a CALLER policy
recorded in run evidence (the run service's declared-fallback lane), never
an adapter behavior.

**Content-refusal detection is signal-based, never guessed:** only a
service-declared filter signal counts (`choices[0].finish_reason ===
"content_filter"` or a string `choices[0].message.refusal`). Output text
that merely looks cautious is NOT a refusal.

**Malformed means unusable shape:** a response that is not an object, has no
`choices` array, or whose first choice's `message.content` is not a non-empty
string (with no content-filter signal) is a typed malformed refusal — the
SDK types completions as `unknown`, so shape failures are real and must be
typed, never stringly-crashed.

## 6. Typed-future documentation (this root, P10-10)

- `PAYMENT-TYPED-FUTURE.md` — the operator key request for a real payment
  provider: the exact `SettlementPort` seam it would implement; fixture
  settlement stays until keys exist; NO implementation claimed.
- `HF-TYPED-FUTURE.md` — the operator token request for Hugging Face weight
  hosting: the exact port/storage doctrine (digest-pinned
  `TransformPinnedDependency.storageRef`; HF hosts bytes, never authority);
  NO implementation claimed.
- `HOSTED-PREVIEW-PROBE.md` — the Vercel feasibility record AS OBSERVED from
  this sandbox + the P11 proposal; deploy belongs to the operator's
  confirmation; NO deployment performed or claimed.

## 7. Tests (`packages/web/test/sandboxModelAdapter.test.ts`)

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict — the project
law; no new framework). EVIDENCE CLASS labeled per test in its name:

1. Port conformance — the sandbox adapter (recording client, success) and
   the fixture adapter satisfy the SAME port behavioral law.
2. Honest labels + cost law — exact id/grade/label strings; cost null when
   unreported, verbatim when the service reports one.
3. Refusal lane: unreachable (thrown network error) → typed refusal, no
   fabricated output, grade stays real (outage law).
4. Refusal lane: timeout (hung client, short deadline) → typed refusal after
   the real wall-clock deadline; measured timingMs ≥ deadline.
5. Refusal lane: malformed response → typed unsupported-operation.
6. Refusal lane: content refusal (service-declared filter signal) → typed
   policy-denied.
7. Refusal classification: credentials-missing (SDK config error / 401) and
   HTTP status mapping (429 quota, 400 request-shape).
8. **REAL network invocation** (labeled REAL in the test name) through the
   REAL SDK default path: real completion, measured latency > 0 asserted,
   honest cost null, grade real asserted.
9. Port injection — the REAL `TransformRunService` (frozen app layer)
   executes a model node with this adapter injected as `models`; the run
   manifest pins real model-lane step evidence. (P10-16's lane-B half; the
   live-source half stays with the station's cross-lane slice.)

## 8. File-size and layer laws

Every new src file < 400 lines. No second runtime (the adapter invokes a
service; it does not schedule). UI never imports provider internals. Frozen
`packages/sporta-*` sources untouched (zero edits).
