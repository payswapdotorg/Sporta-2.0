# sporta-evaluation — SPEC (Wave 1)

Spec-before-code record for the evaluation module (worker packet A:
"organization evaluation/promotion" evidence side). Spec-before-code per
AGENTS.md; the repository is authoritative.

## Scope

`EvaluationService` implements `EvaluationPort.evaluateCandidates`:
produces an immutable `EvaluationReportRecord` comparing organization
candidates across the contract's evaluation axes, including
`intervention-cost` when the caller supplies measured intervention data.

## Single state owner

The service owns no state: `evaluateCandidates` is a pure computation over
the input (constructor takes no dependencies). The report is deterministic
and idempotent per input — the same input produces the byte-identical
report, including the same `reportId`
(`evaluation:<fnv1a(stableStringify(input))>`).

## Metrics

Wave 1 constraint (frozen contract): `EvaluationReportRecord.metrics` has
no per-candidate slot, so each axis value is the **report-level mean over
candidates** (documented limitation; a per-candidate metric shape is a
contract work-order note, see the worker report).

Simulated axes (basis **`fixture`** — declared heuristics over
`OrganizationVersionRecord` fields, deterministic):

| axis                    | per-candidate value                                           |
| ----------------------- | ------------------------------------------------------------- |
| intent-success          | min(1, evidence.length / 3)                                   |
| output-quality          | min(1, (agentBodies.length + workflowGraph.length) / 4)       |
| source-fidelity         | min(1, toolGraph.length / 3)                                  |
| preference-fit          | min(1, learnedPreferences.length / 3)                         |
| latency                 | latencyMsMax declared ? clamp01(1 − latencyMsMax/60000) : 0.5 |
| resource-cost           | costMax declared ? clamp01(1 − costMax/100) : 0.5             |
| reliability             | fallbacks non-empty ? 1 : 0.5                                 |
| determinism             | 0.8 (no candidate field carries this signal in Wave 1)        |
| provenance              | min(1, evidence.length / 2)                                   |
| rights-security-privacy | rights holders AND usages non-empty ? 1 : 0.5                 |

`intervention-cost` (only when `input.interventionCost` is present):
value = `manualInterventions` (count of manual interventions — the
first-class signal, architecture-lock invariant 19; lower is better; it is
a cost axis, not a score axis). `userSeconds` is accepted by the frozen
input type but has no per-axis slot in Wave 1 (noted as a contract
work-order).

## Basis honesty (the core rule)

- Every metric the service derives itself is labeled `basis: "fixture"`.
- `intervention-cost` uses `input.interventionCost.basis ?? "fixture"`.
  **Nothing in Wave 1 is labeled `measured` unless the caller explicitly
  asserts it** — converting fixture input into a "measured" claim would be
  a dishonest-evidence violation. `estimated` is reserved for future
  modeled values.

## Failure semantics

- empty `candidates` → `EvaluationCandidatesError` (evaluating nothing is
  a typed refusal, not an empty report).
- no other failure paths; evidence ids pass through unchanged.

## Output shape

- `candidateIds`: `<organizationId>:<version>` per candidate, input order
  (deterministic; disambiguates multi-version candidates).
- `metrics`: fixed axis order (the table order), `intervention-cost`
  appended last when present.
- `evidence`: input evidence ids, unchanged.

## Event order

validate (non-empty candidates) → derive per-candidate axis values →
aggregate means → append intervention-cost if present → deterministic
reportId → return. No writes, no clock (the frozen record has no
timestamp field).
