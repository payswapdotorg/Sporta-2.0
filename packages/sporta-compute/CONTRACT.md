# sporta-compute

Provider-neutral compute broker.

Invariants that types cannot express:

- Local and user-owned compute are first-class execution planes, not fallbacks of last resort.
- Every provider failure surfaces as a TypedRefusal; no refusal is ever converted into a success claim.
- Submission is idempotent per jobId; retries never duplicate side effects.
- Policy (rights/privacy/retention) is checked before submission, not after.

## Wave 1 implementation notes

- Quotes come from EVERY injected provider in registration order; a
  refusing provider's quote carries its refusal visibly (never filtered).
- Policy is checked BEFORE submission: the required usage class is
  `compute:<kind>`; a denied job is born refused (history ["refused"])
  and never reaches a provider.
- Refusals are first-class terminal states: all-providers-refused and
  unsupported-kind refusals are surfaced with their TypedRefusal — the
  broker never converts a refusal into a failure or a success.
- Submission is idempotent per jobId; the chosen provider executes at
  most once per job (fixture observability: executionCount).
- The state machine is pure domain logic; every state change is appended
  to the job's history (queued -> running -> terminal) as evidence.
- Everything is in-memory fixture-grade (synchronous execution); real
  provider integrations are Wave 2.
