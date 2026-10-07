# sporta-arena

CapabilityGap intake and the Arena client boundary.

Invariants that types cannot express:

- Escalations are idempotent per idempotencyKey; identical retries return the original record, divergent retries throw `EscalationConflictError`. The escalationId is derived deterministically from (tenantRef, idempotencyKey) via sha-256, so the same key never produces a second escalation even across service instances.
- recordGap is idempotent per gapId (identical retries return the current stored record; divergent retries throw `GapConflictError`). Omitting gapId assigns `gap:auto:<seq>` and is non-idempotent by design.
- Only permitted context leaves the tenant boundary: the escalation record itself carries NO contextRefs; the caller's contextRefs travel exactly as given inside the transport submission. No secrets, unrelated tenant data or chain-of-thought.
- escalate refuses empty permittedActions (`EscalationPolicyError`), unknown gaps (`UnknownGapError`) and gaps not in status `open` (`IllegalGapTransitionError`).
- Gap lifecycle: open -> escalated -> resolved | closed, resolved -> closed; illegal transitions throw.
- Escalation lifecycle is the literal contract chain (created -> triaged -> matching -> offered -> accepted -> session_ready -> in_progress -> submitted -> validating -> accepted_result | revision_required | rejected -> closed). revision_required and rejected proceed only to closed in v1; the expert rework loop is deferred to the real Arena lifecycle wave.
- readResult mirrors the authoritative Arena lifecycle into the client's own record copy only through the LEGAL path; illegal jumps throw `IllegalEscalationTransitionError`.
- Arena results are always validated before any application; the application decision belongs to Sporta. validateResult evaluates every check (payload-hash-present, provenance-source-kind, escalation-known, result-type-session-mode) without short-circuit and mutates nothing — verdicts only.
- Session-mode → expected result-type policy (v1 additive table): observe → evidence-bundle/review/evaluation-verdict; correct → correction/solution; unblock → unblock/solution/correction; takeover → correction/solution; teach → knowledge-patch/solution/learning-artifact-ref; review → review/evaluation-verdict/correction.
- `ArenaResultRecord.validated` is an Arena-side flag and is never trusted as Sporta-side validation; the fake transport deliberately sets it to false.
- Idempotency conflict fingerprints are key-order insensitive (stable stringify) but array-order sensitive: a retry with reordered arrays is a conflict.
- The transport port (`ArenaTransportPort`) is module-internal (app layer) — consumers depend on `ArenaClientPort` only. It lives in the app layer because the architecture layer-direction law forbids app -> adapters imports; the in-memory fake and the future HTTP adapter implement it from the adapters layer.
- No record in this module carries a timestamp; the injectable clock lives on the fake transport (result provenance capturedAt).
