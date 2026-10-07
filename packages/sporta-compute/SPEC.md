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
