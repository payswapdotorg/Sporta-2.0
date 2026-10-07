# sporta-arena SPEC (Wave 1)

Scope: CapabilityGap intake (C1) and the Arena client boundary (C2) —
`ArenaClientPort` lifecycle/result boundary over a typed transport port.
The real Arena transport (HTTP) and deployment/provider integration are
Wave 2 (C5); rights propagation across planes is Wave 2 (C6).

## Behavior

### CapabilityGap intake (`recordGap`)

- `recordGap` stores a typed `CapabilityGapRecord` with status `open`.
- Idempotent per `gapId`: a retry with the same `gapId` and identical
  business fields returns the CURRENT stored record (same identity; the
  record's status may have legitimately progressed to `escalated`).
- A retry with the same `gapId` but different business fields is a typed
  `GapConflictError` (first write wins; no silent overwrite).
- If `gapId` is omitted, the service assigns `gap:auto:<seq>` (one counter
  per service instance). Omitting `gapId` is a non-idempotent call by
  design — only caller-supplied `gapId`s are idempotent.

### Escalation (`escalate`)

- Idempotent per `idempotencyKey`: the first call assigns
  `escalationId = "esc:" + sha256(tenantRef, idempotencyKey)[0..24]`
  (deterministic — the same key + tenant yields the same escalation id
  even across service instances) and stores the record; a retry with the
  same key and identical payload returns the EXISTING record.
- A retry with the same key but a different payload is a typed
  `EscalationConflictError`.
- Refusals (typed errors, no state change):
  - empty `permittedActions` → `EscalationPolicyError` (Arena sessions
    are isolated capsules; actions must be explicit);
  - unknown `gapId` → `UnknownGapError`;
  - gap not in status `open` → `IllegalGapTransitionError` (the pure
    gap transition function rejects e.g. escalating an already-escalated
    gap).
- Context minimization: the escalation RECORD carries exactly the fields
  of the canonical `ArenaEscalationRecord` (it carries NO contextRefs).
  The caller's `contextRefs` travel only inside the transport submission
  (`ArenaTransportSubmission`), exactly as given — the service adds,
  infers or filters nothing.
- The record's `workGraphId` is derived from the stored gap, never
  re-supplied by the caller.
- After the transport accepts the submission, the service transitions
  its OWN gap record `open -> escalated` (the gap record is arena-client
  state; no work-graph/organization state is touched).

### Result boundary (`readResult` / `validateResult`)

- `readResult(escalationId)`: `null` for unknown escalation or when the
  transport has no status. Otherwise it reads the transport status and
  mirrors the transport's lifecycle into the client's own record copy by
  walking the LEGAL lifecycle path (`escalationLifecyclePath`; an illegal
  jump throws `IllegalEscalationTransitionError`), then returns the
  transport's result (or `null` before the Arena submitted one).
- `validateResult(result)`: structured checks, verdicts only, never
  mutates anything (Arena never mutates Sporta state; unvalidated
  results are never auto-applied):
  1. `payload-hash-present` — sha-256 hex shape (64 hex chars);
  2. `provenance-source-kind` — `provenance.sourceKind === "arena-session"`;
  3. `escalation-known` — the escalation exists in the client store;
  4. `result-type-session-mode` — `result.resultType` is compatible with
     the escalation's `sessionMode` (policy table below).
  `accepted: false` when any check fails. `ArenaResultRecord.validated`
  is an Arena-side flag and is NOT trusted as Sporta validation.

## Session-mode → expected result-type policy (v1 table)

| sessionMode | expected resultTypes |
| --- | --- |
| observe | evidence-bundle, review, evaluation-verdict |
| correct | correction, solution |
| unblock | unblock, solution, correction |
| takeover | correction, solution |
| teach | knowledge-patch, solution, learning-artifact-ref |
| review | review, evaluation-verdict, correction |

## Lifecycles (pure transition functions; illegal transitions are typed errors)

Gap: `open -> escalated -> resolved | closed`, `resolved -> closed`,
`closed` is terminal.

Escalation (docs/contracts/arena-escalation.md, literal):

```
created -> triaged -> matching -> offered -> accepted -> session_ready
        -> in_progress -> submitted -> validating
        -> accepted_result | revision_required | rejected -> closed
```

All three post-validating outcomes proceed only to `closed` in v1 (an
expert rework loop `revision_required -> in_progress` is deferred to the
real Arena lifecycle wave; it is NOT invented here).

## Single state owner

- Gap records, escalation records and the idempotency index: this
  module's app service (in-memory, fixture-grade).
- The authoritative escalation lifecycle: the Arena side (represented by
  the transport); the client only mirrors it into its own copy.
- The application decision for validated results: Sporta (the caller) —
  never this module.

## Invariants

- Arena never mutates work-graph/organization/artifact state. The client
  service writes only its own store and calls only the transport port.
- Escalation record deep-equals the canonical `ArenaEscalationRecord`
  shape — no leaked fields, no contextRefs on the record.
- Retryable writes are idempotent (gapId / idempotencyKey).
- Fingerprint comparison for idempotency conflicts is key-order
  insensitive (stable stringify) but array-order sensitive (documented).
- Clocks: no record in this module carries a timestamp; the injectable
  clock lives on the fake transport (result provenance `capturedAt`).

## Failure semantics

- All illegal inputs/transitions are typed errors extending `ArenaError`
  (exported from the public contract): `GapConflictError`,
  `EscalationConflictError`, `EscalationPolicyError`, `UnknownGapError`,
  `IllegalGapTransitionError`, `IllegalEscalationTransitionError`.
- Port errors from the transport propagate unchanged (no swallowing).

## Event order (escalate happy path)

1. idempotency-key lookup (hit → conflict-check → return existing);
2. refusals (empty permittedActions, unknown gap, illegal gap status);
3. build record (lifecycle `created`);
4. `transport.submit({ escalation, contextRefs })`;
5. commit own-store state (gap → escalated; store escalation + key);
6. return the record.

`readResult` order: own-store lookup → transport.status → legal-path
lifecycle mirror → return result.
