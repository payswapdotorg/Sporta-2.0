# sporta-compute

Provider-neutral compute broker.

Invariants that types cannot express:

- Local and user-owned compute are first-class execution planes, not fallbacks of last resort.
- Every provider failure surfaces as a TypedRefusal; no refusal is ever converted into a success claim.
- Submission is idempotent per jobId; retries never duplicate side effects.
- Policy (rights/privacy/retention) is checked before submission, not after.
