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
