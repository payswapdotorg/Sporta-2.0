# sporta-compute SPEC (Wave 1, Worker B — work order B6)

Status: SPEC — written before implementation.

## Scope

Provider-neutral compute broker: quoting, submitting and polling jobs
across injected providers with local execution as a first-class plane.
Provider failure is a typed refusal/fallback, never semantic corruption
(architecture lock invariant 17).

Fixture-grade: two in-memory fixture providers (a local deterministic
executor for trivial job kinds and an always-refusing provider), injectable
clock. Real provider integrations are Wave 2.

## Behavior

### Job state machine (domain, pure)

```text
queued -> running -> succeeded | failed | refused | cancelled
queued -> cancelled | refused
terminal: succeeded, failed, refused, cancelled (no outgoing edges)
```

- `transitionJob(from, to)` refuses every illegal transition with a typed
  `IllegalJobTransitionError` (e.g. `succeeded -> running`,
  `queued -> succeeded`, any transition out of a terminal state).
- Refusal is terminal and always carries a `TypedRefusal`.

### quote(spec) -> readonly ComputeQuote[]

- Returns a quote from EVERY injected provider, in registration order.
- A refusing provider returns a quote WITH `refusal` set — visible, never
  hidden, never filtered out by the broker.
- The broker never converts a refusing quote into an error, an omission or
  a success.

### submit(input) -> ComputeJobStatus

- Idempotent per `jobId`: a retry returns the SAME job status; the chosen
  provider executes at most once per jobId. Without a `jobId` the broker
  mints `job:<n>`.
- Policy check BEFORE submission: `policy.rights.usages` must include the
  usage class required by the job kind (`compute:<kind>`, a deterministic
  domain mapping) and must not prohibit it — otherwise the job is created
  directly in the terminal `refused` state with a `policy-denied`
  `TypedRefusal` naming the missing usage. The job never reaches a
  provider.
- Provider selection: the first provider (registration order) whose quote
  is NOT a refusal. If every provider refuses, the job is `refused` with
  the first refusing provider's refusal — visible, not failed.
- Execution (fixture, synchronous): `queued` -> `running` ->
  terminal state from the provider result:
  - `succeeded` with `outputArtifactId`;
  - `failed` with a `detail` (honest infrastructure failure);
  - `refused` with the provider's `TypedRefusal` — first-class, never
    converted to failed or succeeded.
- A provider that throws is recorded as `failed` with the reason (a crash
  is an honest failure, not a typed refusal and never a success).
- The broker records the full state history per job (additive
  `history(jobId)` accessor) so the queued -> running -> succeeded path is
  verifiable evidence.

### poll(jobId) -> ComputeJobStatus

- Returns the current status; an unknown job id is a typed
  `UnknownComputeJobError` (never a fabricated status).

## Single state owner

`ComputeBrokerService` (app layer) solely owns the in-memory job ledger
(status, history, submission timestamps). Providers own their own
execution state; the broker is the only writer of job status.

## Invariants

1. Submission is idempotent per jobId; retries never duplicate side
   effects.
2. Policy (rights) is checked before submission, not after.
3. Every provider failure surfaces as a typed refusal; no refusal is ever
   converted into a success or a failure.
4. The state machine has no illegal transitions; terminal states are
   final.
5. Local and user-owned compute are first-class planes (the local provider
   is a peer provider, not a special case).
6. Domain layer is pure; clocks live in adapters and are injected.

## Failure semantics

| Failure                           | Typed error / state                          |
| --------------------------------- | -------------------------------------------- |
| Illegal state transition (domain) | `IllegalJobTransitionError`                  |
| Poll of unknown job               | `UnknownComputeJobError`                     |
| Policy denies the job kind        | terminal `refused` + `policy-denied` refusal |
| All providers refuse              | terminal `refused` + provider refusal        |
| Provider returns failure          | terminal `failed` + detail                   |
| Provider crashes                  | terminal `failed` + detail                   |

## Event order (submit)

1. idempotency check on `jobId`;
2. policy check (usage class for the job kind);
3. provider quote loop in registration order — first non-refusing quote
   wins;
4. `queued` recorded;
5. `running` recorded;
6. provider `execute`;
7. terminal state recorded from the provider result;
8. status returned.

Every state change is appended to the job's history.

## Wave 7 — durable compute job ledger (W7A, P8 persistent workers)

Spec-before-code record for the P8 "persistent workers" lane in the
compute plane. Everything is ADDITIVE: new adapters-layer files only
(`src/adapters/fsComputeJobLedger.ts`,
`src/adapters/fsComputeBrokerService.ts`); the frozen domain
(`ports.ts`, `stateMachine.ts`, `policy.ts`, `errors.ts`) and
`ComputeBrokerService` stay untouched. New public names are appended
to `src/contract.ts` (surface stays additive-only).

### Scope problem

`ComputeBrokerService` owns its job ledger (`Map<SportaId,
InternalJob>`) in process memory. A host restart drops every job
status, refusal and history: a caller that polls a previously
submitted job after a restart sees only `UnknownComputeJobError`.
Wave 7 maps the broker's in-memory ledger onto real disk.

### Durable job ledger — `FsComputeJobLedger`

Persistence pattern source: `FsSharedSessionStore` (sporta-editors
W6) — hash-addressed per-id JSON files, atomic writes, typed
integrity errors, fresh-instance durability.

- **Public layout**: one ledger file per job at
  `rootDir/<sha256(jobId)[0:2]>/<sha256(jobId)>.json`
  (default root: `<os tmpdir>/sporta-compute-jobs`).
- **Record**: the broker's own `InternalJob` shape, on disk:
  `{ jobId, status: ComputeJobStatus, history: ComputeJobState[],
  submittedAt: Iso8601 }` — pretty-printed JSON, one file per job.
- **Atomic writes**: stage under `rootDir/.tmp`, rename into place —
  a reader never observes a torn file (the W2/W6 precedent).
- **Integrity verification on every read**: the file must parse;
  fields must be present and well-typed; `status.jobId` must equal
  the record `jobId`; the `jobId` must hash back to the file's own
  address (id-address law); `history` must be non-empty with its last
  entry equal to `status.state` (the status is the history's tip);
  `refusal` must be present exactly when `state === "refused"` (the
  port law). Anything else is a typed `ComputeLedgerError` carrying
  the path and reason — never silent corruption.
- **Durability**: a fresh instance over the same directory reads
  everything earlier instances wrote.

### Persisting broker — `FsComputeBrokerService` (composition)

`ComputeBrokerService` is NOT edited. `FsComputeBrokerService`
composes it and persists through its port-shaped public surface
(`quote`/`submit`/`poll` + the additive `history`/`submittedAt`
accessors) plus a `FsComputeJobLedger`:

- **`submit(input)`**:
  - caller-provided `jobId` already in the ledger → return the
    PERSISTED status WITHOUT executing (idempotent across restarts —
    the job survives byte-identically and the provider never
    re-executes);
  - otherwise → delegate to the inner broker, then persist the
    resulting status, the inner's full state history and
    `submittedAt` through the ledger.
- **Minted job ids** (no caller `jobId`): skip ids already persisted
  — a fresh broker over an old ledger never reuses a persisted job's
  id (probe-and-advance mint). The chosen id is passed explicitly to
  the inner broker, so the inner never mints its own.
- **`poll(jobId)` / `history(jobId)` / `submittedAt(jobId)`**: inner
  broker first; on `UnknownComputeJobError` (a fresh inner after a
  restart) → the ledger's persisted record; absent in both → the
  typed error stands (never a fabricated status).
- **In-flight limitation (honest)**: the inner broker is synchronous
  — it reaches a terminal state inside `submit`, so what persists is
  terminal state. A submit interrupted mid-flight (host crash before
  the ledger write) leaves NO ledger entry and the job honestly does
  not survive. Persisted refusal/failure states replay byte-
  identically — a refusal stays a refusal (invariant 17).

### Failure semantics (new typed error, adapters layer)

| Failure                          | Typed error                                  |
| -------------------------------- | -------------------------------------------- |
| Corrupt ledger file (any cause)  | `ComputeLedgerError` (path + reason)        |
| Ledger write failure (disk etc.) | `ComputeLedgerError` — fail-closed; the job state stays in the inner broker and the error surfaces |

## Wave 7 — provider-neutral fallback chain (W7B, B6)

Spec-before-code record for the B6 "provider-neutral compute/fallback"
lane (work-order proof: "provider fallback" + "visible provider
failure"). Everything is ADDITIVE: new files only
(`src/domain/fallback/{types,classify,policy,trail}.ts`,
`src/app/FallbackComputeService.ts`); the frozen domain (`ports.ts`,
`stateMachine.ts`, `policy.ts`, `errors.ts`) and
`ComputeBrokerService` stay untouched. New public names are APPENDED
to `src/contract.ts` (surface stays additive-only).

Anchor — the frozen law this section extends (invariant 3, quoted):
"Every provider failure surfaces as a typed refusal; no refusal is
ever converted into a success or a failure." The fallback chain
extends that law from ONE provider to a CHAIN of providers: no
provider's refusal or failure is ever converted, hidden, or silently
retried away — and the caller SEES which provider failed, how, and
what the chain did about it.

### Scope problem

`ComputeBrokerService` selects ONE provider at quote time (first
non-refusing quote) and executes only that provider; a failure of the
chosen provider is terminal for the job. B6 requires the compute
plane to FALL BACK across providers at execution time —
deterministically, with every provider's honest outcome visible.

### Outcome classification (domain, pure — `classifyProviderOutcome`)

Every `ProviderExecutionResult` is classified into exactly one of
four classes:

- `succeeded` — state `"succeeded"` (with or without an
  `outputArtifactId`; both are legal port shapes);
- `retryable-failure` — state `"failed"` whose `detail` matches an
  entry of the EXPLICIT transient-failure record
  `TRANSIENT_FAILURE_MARKERS` (an exact, case-sensitive substring
  match; the record — timeouts, temporary unavailability, overload,
  rate limits, connection resets/refusals, broken pipes, socket
  hang-ups, restarts — is a versioned, auditable list, never an
  ambient heuristic; first match in record order wins);
- `terminal-refusal` — state `"refused"`: EVERY `TypedRefusal` kind
  is terminal for THAT provider (a refusal is an honest no, never a
  retry trigger);
- `terminal-failure` — state `"failed"` matching no transient marker.

Classification is TOTAL and fail-closed. A result whose shape violates
the port laws — a state outside the three, a `"refused"` result
without a well-formed `TypedRefusal` (one of the five kinds), or a
`refusal` field carried on a `"succeeded"`/`"failed"` result — is a
typed `FallbackClassificationError` carrying the reason and the
ill-shaped value. There is NO silent default class.

### FallbackChainPolicy (explicit record)

```text
providerOrder                          — the deterministic order (registration order)
maxAttemptsPerProvider                 — default 1
retrySameProviderOnRetryableFailure    — default false (the chain advances)
```

- The order is the explicit, total provider-id list: no ambient
  config, no cost/latency guessing, no reordering.
  `defaultFallbackChainPolicy(ids)` derives it from registration order.
- `validateFallbackChainPolicy` fail-closes: an empty order, duplicate
  order ids, a non-integer or `< 1` maxAttemptsPerProvider, or an
  order entry that is not a registered provider is a typed
  `InvalidFallbackChainPolicyError` carrying EVERY reason. A policy may
  deliberately OMIT a registered provider (explicit exclusion); it may
  never reference an unknown one. Duplicate ids among the registered
  providers themselves are rejected at construction.

### FallbackComputeService (app — the chain)

`FallbackComputeService implements ComputeBrokerPort`, additive to the
frozen `ComputeBrokerService` (which stays the quote-time-selection
broker). The chain executes the spec against providers in the
deterministic order; per provider, the attempt loop:

- `succeeded` → the chain terminates with success;
- `terminal-refusal` → the chain ADVANCES (never a same-provider
  retry — a refusal is an honest no, not a retry trigger);
- `terminal-failure` → the chain ADVANCES;
- `retryable-failure` → same-provider retry ONLY when the policy
  allows it and the provider's attempt budget remains; otherwise the
  chain advances.

- `quote(spec)` returns a quote from EVERY chain provider in order
  (refusals visible) — the same law as the frozen broker. The chain
  does NOT use quotes for selection: B6 is EXECUTION-time fallback, so
  every chain provider is EXECUTED until one succeeds (the deliberate,
  documented divergence from the frozen broker's quote-time skip).
- `submit` event order: 1. jobId idempotency check; 2. policy check
  BEFORE submission (the same domain `policyPermitsJob`; a denied job
  is terminal `refused`, never queued, no provider touched); 3.
  `queued` → `running` recorded (the chain is ONE job run;
  per-provider attempts are trail facts, not job states); 4. provider
  attempts per the loop above; 5. terminal state recorded.
- **Visible provider failure (the B6 proof)**: the outcome carries the
  COMPLETE per-provider attempt trail — every attempt's providerId,
  outcome class, refusal/failure detail and clock-stamped timestamp —
  on three surfaces: the additive `trail(jobId)` accessor (the
  structured `FallbackChainTrail`), the terminal status `detail` (a
  deterministic summary naming EVERY attempt), and the typed aggregate
  error. A success reached after earlier provider failures/refusals
  NEVER hides them: the succeeded status's `detail` names every
  earlier attempt.
- **All-refused exhaustion**: a job that EVERY provider refused (no
  failure anywhere) ends `refused` — never `failed`, never
  `succeeded` — with the honest aggregate refusal carrying the full
  trail: kind and providerId follow the FIRST refusing provider (the
  frozen broker's all-refuse law), and the detail names every
  provider's refusal kind. Recorded refusals replay byte-identically
  (invariant 17).
- **Exhaustion with at least one failure**: the job is recorded
  terminal `failed` (the status names the LAST failing provider;
  `poll` returns it) AND `submit` THROWS the typed
  `AllProvidersExhaustedError` carrying the jobId and the full attempt
  trail — the honest aggregate failure, impossible to ignore.
- **Ill-shaped provider result**: a `FallbackClassificationError`
  propagates out of `submit` (fail-closed totality) AND the job is
  recorded terminal `failed` with the reason, so the ledger stays
  coherent (`poll`/`trail` answer with the partial trail).
- **Idempotency**: same jobId → the terminal outcome REPLAYS
  (byte-identical status, or the same typed terminal error — the
  service stores the terminal throw and re-throws it on retry); a
  provider never re-executes for the same jobId. Without a jobId the
  service mints `job:<n>` (the broker's law).
- **Never convert**: a refusal is never a failure, a failure is never
  a success, a partial result is never silent (the W1 broker law,
  restated for the chain). A provider that THROWS is recorded as a
  failed attempt with the reason (the frozen broker's crash law) and
  the chain advances per classification.
- Terminal status providerId law: `succeeded` → the succeeding
  provider; all-refused → the first refusing provider; failed → the
  last failing provider. Deterministic in all three cases.
- `poll(jobId)` returns the recorded terminal status; unknown → typed
  `UnknownComputeJobError` (never a fabricated status). Additive
  `history(jobId)` (state evidence: `queued → running → terminal`) and
  `trail(jobId)` (attempt evidence) accessors, mirroring the frozen
  broker's additive-accessor pattern. The chain is synchronous: an
  observed trail always carries a terminal job state.
- Clock law: attempt timestamps come ONLY from the injected clock
  (domain purity holds; the domain trail helpers are pure and receive
  timestamps as values).

### Failure semantics (new typed errors, this lane)

| Failure                             | Typed error / state                                          |
| ---------------------------------- | ------------------------------------------------------------ |
| Ill-shaped provider result          | `FallbackClassificationError` (reason + value) + terminal `failed` |
| Invalid chain policy (wiring)       | `InvalidFallbackChainPolicyError` (every reason)              |
| Chain exhausted with ≥ 1 failure    | terminal `failed` + thrown `AllProvidersExhaustedError` (full trail) |
| Chain exhausted, all refused       | terminal `refused` + aggregate refusal (first-refuser kind, full trail in detail) |
| Idempotent retry of a thrown outcome | the SAME typed terminal error replays (never a re-execution) |
| Poll/trail of unknown job           | `UnknownComputeJobError`                                     |
