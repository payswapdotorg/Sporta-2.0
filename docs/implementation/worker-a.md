# Worker A Implementation Report

Status: WAVE 1 IMPLEMENTED (branch wave1/worker-a, commit 98a1b35)

Scope executed: dependency-graph Wave 1 Worker A line — "WorkGraph, Intent,
Organization model, resolver, Lab/evaluation ports", with the A5
personalization boundary seed and A6 as the minimal immutable-promotion path.

## Ownership

Intent, WorkGraph, Organizations, Lab, Evaluation, personalization and promotion.

## WORK ITEMS

- **A1 — WorkGraph + Intent** (`packages/sporta-work`): pure domain aggregate
  (idempotent node append per `nodeId`, monotonic `seq`, strict status machine
  `open → executing → awaiting-user → escalated → closed` with append-driven
  triggers + explicit successor table), append ledger with actor provenance
  (manual takeover first-class), deterministic content-derived ids,
  `WorkGraphService` app layer over an injectable store port + clock,
  in-memory fixture store, **declared** `AgentRuntimeExecutionPort` execution
  seam (fixture simulation only — no second runtime), additive
  `WorkGraphLifecyclePort` (escalation edges) and `WorkGraphLedgerPort`
  (takeover evidence).
- **A2 — organization model/registry** (`packages/sporta-organizations`):
  append-only draft registry, contiguous-monotonic versions per
  organizationId, typed errors for every illegal operation.
- **A6 (minimal) — promotion**: evidence + policy gated `PromotionRecord`
  (decision `promoted`), idempotent re-promotion, and **immutability after
  promotion** — any content mutation attempt on a promoted version is
  `OrganizationImmutableError`. Rollback deferred (see NEXT DEPENDENCIES).
- **A3 — resolver + explainability**: `OrganizationResolverService`
  (promoted-only candidates, deterministic total ranking, weighted
  `SelectionFactor` explanation with factor/weight/detail for every
  selection).
- **A5 (seed) — personalization boundary**: per-user preference records
  (`UserPreferencePort`), applied ONLY when resolving for the same
  `userRef`; isolation is structural (single keyed lookup), proven by test.
- **A4 (seed) — Lab**: `searchPopulation` (declared deterministic population
  heuristics over registry entries, typed refusal of unknown kinds, honest
  empty results) and `replay` (simulation over the WorkGraph + append
  ledger; report typed as replay/fixture evidence, never production truth).
- **Evaluation** (`packages/sporta-evaluation`): deterministic
  `EvaluationReportRecord` across the contract's axes (report-level means),
  `intervention-cost` included when input present, **honest basis labels**
  (simulated metrics are always `fixture`; `measured` only via explicit
  caller opt-in).

Spec-before-code: every package gained `SPEC.md` (behavior, single state
owner, invariants, failure semantics, event order) BEFORE implementation;
`CONTRACT.md` invariants extended additively.

## CHANGED FILES

49 files, all inside the four owned packages
(`git diff --name-only c9a90ac..98a1b35`):

- sporta-work: `SPEC.md`, `src/contract.ts` (v1 surface preserved; now a
  re-export hub), `src/contract.example.ts` (additive examples),
  `src/domain/{ports,workGraph,errors,hash}.ts`,
  `src/app/workGraphService.ts`,
  `src/adapters/{inMemoryWorkGraphStore,fixtureAgentRuntime,clock}.ts`,
  `test/workGraph.test.ts`, `CONTRACT.md`.
- sporta-organizations: `SPEC.md`, `src/contract.ts`,
  `src/contract.example.ts`, `src/domain/{ports,registry,scoring,stable,errors}.ts`,
  `src/app/{organizationRegistryService,organizationResolverService,userPreferenceService}.ts`,
  `src/adapters/{inMemoryOrganizationStore,inMemoryUserPreferenceStore,clock}.ts`,
  `test/organization.test.ts`, `CONTRACT.md`.
- sporta-lab: `SPEC.md`, `src/contract.ts`,
  `src/domain/{ports,population,replay,errors}.ts`, `src/app/labService.ts`,
  `src/adapters/clock.ts`, `test/lab.test.ts`, `CONTRACT.md`.
- sporta-evaluation: `SPEC.md`, `src/contract.ts`,
  `src/contract.example.ts`, `src/domain/{ports,evaluation,hash,errors}.ts`,
  `src/app/evaluationService.ts`, `test/evaluation.test.ts`, `CONTRACT.md`.

Largest file: 349 lines (a test file); largest source file: 216 lines
(`sporta-organizations/src/domain/scoring.ts`); every `contract.ts` ≤ 300
lines (all ≈ 60–70). No file exceeds 400 lines.

## TESTS

`node:test` via the repo tsx recipe, zero new dependencies. 47 tests:

| package | file | tests |
| --- | --- | --- |
| sporta-work | test/workGraph.test.ts | 16 (idempotent openIntent/appendNode, seq monotonic, status machine incl. illegal-transition rejection, user-takeover lineage, closed-graph rules, parent validation, conflicts, fixture seam) |
| sporta-organizations | test/organization.test.ts | 16 (draft idempotency, monotonic versions, promotion gates + idempotency, **promoted immutability**, catalog determinism, resolver determinism/ranking/explanation, resolution refusal, env mismatch, **personalization isolation A/B**, preference idempotency) |
| sporta-lab | test/lab.test.ts | 8 (population filtering, multi-kind dedup, empty result, unknown kind, replay shape, intervention-cost simulation, outcome mapping, missing graph) |
| sporta-evaluation | test/evaluation.test.ts | 7 (intervention-cost presence/absence, fixture basis labels, measured opt-in, determinism/reportId, mean aggregation, empty-candidates refusal) |

## REAL EVIDENCE

Executed in `/home/z/sporta-2.0-a` (worktree, branch `wave1/worker-a`),
final state after a from-scratch build (tsbuildinfo + dist removed first):

1. `node scripts/architecture/architecture-check.mjs check`
   → `architecture: OK`, `violations: 0`, `baseline: 0`, `new: 0`
2. `pnpm exec tsc -b packages/sporta-policy packages/sporta-contracts packages/sporta-work packages/sporta-organizations packages/sporta-lab packages/sporta-evaluation`
   → exit 0, clean, 168 emitted files (fresh build)
3. `pnpm exec tsx --test packages/sporta-work/test/*.test.ts packages/sporta-organizations/test/*.test.ts packages/sporta-lab/test/*.test.ts packages/sporta-evaluation/test/*.test.ts`
   → `tests 47, pass 47, fail 0, cancelled 0, skipped 0` (per-package:
   16/16, 16/16, 8/8, 7/7)
4. `pnpm lint` → `Found 70 warnings and 0 errors` — identical to the Wave 0
   baseline (no new warnings; my packages lint 0/0 scoped)
5. `pnpm exec oxfmt packages/sporta-work packages/sporta-organizations packages/sporta-lab packages/sporta-evaluation`
   then `--check` → `All matched files use the correct format`

Environment note (inherited, typed honestly): the full-repo `pnpm typecheck`
is OOM-killed on this 4 GB sandbox (Wave 0 PROJECT-STATE record); the scoped
`tsc -b` protocol above is the verified worker gate.

## FIXTURE EVIDENCE

Everything in-memory is fixture-grade and labeled so in code and SPECs:

- `InMemoryWorkGraphStore`, `InMemoryOrganizationStore`,
  `InMemoryUserPreferenceStore` — deterministic JSON-cloning fixtures;
  they prove semantics (idempotency, ordering, immutability), never
  durability.
- `FixtureAgentRuntimeAdapter` — deterministic event simulation of the
  execution seam; every event detail says "fixture simulation". The real
  ZCode AgentRuntime adapter implements the port in a later wave.
- Resolver factor weights/formulas and Lab population heuristics are
  declared Wave 1 heuristics over record fields — deterministic and
  explainable, not learned values.
- Lab replay is SIMULATION: the intervention-cost formula (historical user
  appends minus learned preferences, floor 0) is a declared fixture
  heuristic; `LabReplayReport` values are replay evidence, never production
  truth (invariant 6).
- Evaluation metric values are report-level fixture simulations; basis
  labels are `fixture` for every service-derived metric.

## CONTRACT CHANGES

All additive; no frozen v1 export removed or renamed. Per package the
existing public surface moved verbatim from inline `contract.ts`
declarations to module-internal declaration files re-exported through
`contract.ts` (the Wave 0 sporta-contracts layout — same exported names
from the same entrypoint, plus additions):

- sporta-work: + `SportaId` re-export; + `WorkAppendRecord`,
  `WorkGraphStatus`, `WorkGraphLifecyclePort`, `WorkGraphLedgerPort`,
  `StartAgentRunInput`, `AgentRunHandle`, `AgentRunEvent`,
  `AgentRuntimeExecutionPort`; + error classes, `WorkGraphService` (+deps,
  + store port type), `InMemoryWorkGraphStore`,
  `FixtureAgentRuntimeAdapter`, `systemClockNow`.
- sporta-organizations: + `OrganizationCatalogEntry`,
  `OrganizationCatalogPort`, `PromoteOrganizationInput`,
  `OrganizationPromotionPort`, `OrganizationUserPreference`,
  `SetUserPreferenceInput`, `UserPreferencePort`; + error classes,
  `FACTOR_WEIGHTS`, the three services (+deps, +store port types), the two
  in-memory stores, `systemClockNow`.
- sporta-lab: + `POPULATION_KINDS`, `LabPopulationKindError`,
  `LabWorkGraphNotFoundError`, `LabService` (+deps), `systemClockNow`.
- sporta-evaluation: `InterventionCostInput` gained the optional honest
  `basis?: "measured" | "estimated" | "fixture"` field (defaults to
  `fixture`); + `EvaluationCandidatesError`, `EvaluationService`.

Public method signature counts (honest count across port interfaces
re-exported per contract.ts, limit 12): work 7, organizations 7, lab 2,
evaluation 1. The architecture checker (which counts declarations in
contract.ts source) reports 0 declared methods per contract.ts because all
declarations live in module-internal files — the honest surface count is
the one above.

No changes to `@sporta/contracts` or `@sporta/policy` (TL-owned).

## RIGHTS-PROVENANCE

- Rights/privacy/retention propagate untouched: every fixture
  `IntentSpec`/`OrganizationVersionRecord` carries a full `PolicySet`
  (from `@sporta/policy`); services never strip or weaken policy fields.
- Promotion gate `policy-defined` requires non-empty rights holders and
  usages — an organization without declared rights cannot be promoted.
- IDs are opaque Sporta ids; no provider identifier is used as a domain id.
- Replay evidence references only node ids that exist in the replayed
  WorkGraph; no evidence ids are fabricated anywhere.
- No hidden chain-of-thought is stored (no such fields exist in Wave 1).

## PERFORMANCE

- All operations are in-memory; no network, no timers, no IO. Targeted
  47-test suite runtime: ~0.8 s wall (tsx startup included).
- Registry mutations are O(n) over the catalog list (fixture-grade store
  port granularity, documented in SPEC); resolver scoring is O(n·factors)
  with a fixed 4–5 factor set. No performance claims beyond fixture scale
  are made.

## SECURITY

- No secrets, credentials, user data or internal addresses in code, tests
  or this report. Fixtures use opaque placeholder ids only.
- Personalization boundary is enforced structurally (single keyed lookup
  per resolving user), not by filtering after fetch.
- Typed refusals everywhere: illegal transitions, immutability violations,
  failed promotion gates, unknown population kinds, unknown graphs and
  empty evaluation input are errors, never silent fallbacks.
- Domain layers are pure (architecture checker `domain-io` rule: 0
  violations).

## RISKS

- **Population heuristics and scoring weights are declared heuristics** —
  honest for Wave 1, but real-world organization selection will need
  learned/validated weights (Wave 2 per the dependency graph:
  "organization scoring, personalization").
- **Auto `nodeId`s are not retry-stable** (documented in SPEC): append
  idempotency requires an explicit `nodeId`; `openIntent` auto ids ARE
  content-derived and retry-stable.
- **`EvaluationReportRecord` has no per-candidate metric slot** (frozen
  contract) — Wave 1 aggregates means; cross-candidate comparison via this
  record alone is coarse.
- **Promotion rollback absent** (A6 minimal path): promoted versions cannot
  be rolled back to drafts; a rollback decision path needs contract +
  policy work (work-order note below).
- **WorkGraphNode carries no actor field** (frozen contract) — actor
  provenance lives in the WorkGraph append ledger (module-internal state +
  `WorkGraphLedgerPort`); consumers needing actor data must read the
  ledger, not the node record.

## BLOCKERS

None. All Wave 1 gates green on this machine; nothing was skipped.

## DEVIATIONS

- The v1 type declarations moved from inline `contract.ts` to
  module-internal files re-exported through `contract.ts` (public surface
  unchanged). Reason: `contract.ts` must re-export the service
  constructors (single public entrypoint), and inlining both directions
  would create an import cycle the architecture checker forbids. This is
  the same layout the TL used for `sporta-contracts` in Wave 0.
- `appendNode` on a `closed` graph accepts `evidence` appends only
  (post-closure evidence attachment); all other kinds are typed errors.
  Rationale documented in SPEC.md.
- Lab `searchPopulation` does not filter by environment/constraints (the
  resolver owns fit-scoring); documented in SPEC.md, not an omission.
- `userSeconds` is accepted by the frozen input type but has no per-axis
  slot; noted as a work-order below rather than silently inventing a
  second intervention metric.

## NEXT DEPENDENCIES

Work-order notes to the TL (no TL-owned file was touched):

1. **`@sporta/contracts` (frozen) — candidate extensions for Wave 2**:
   - per-candidate evaluation metrics (or a per-candidate report shape) —
     the current `EvaluationReportRecord` forces report-level means;
   - an actor/provenance field on `WorkGraphNode` (or a canonical append
     event record in contracts) so takeover evidence is not module-internal;
   - a "cancelled"/"abandoned" WorkGraph status or explicit cancellation
     record if product flows need closing unexecuted intents (currently
     `open → closed` is an illegal skip by design).
2. **ZCode AgentRuntime seam**: `AgentRuntimeExecutionPort` in
   `@sporta/work/contract` is the declared seam
   (`startRun(workGraphId, organization, task) → AgentRunHandle`,
   `observeRun(runRef) → AgentRunEvent[]`). The ZCode-side adapter (and any
   module.ts `requires` additions it needs) is TL-serialized work; the
   fixture adapter is simulation only.
3. **Promotion rollback (A6 full)**: needs a `rolled-back` decision path +
   gates (cross-run evidence per the organization-learning contract);
   requires contracts/policy decisions before implementation.
4. **Takeover admission**: user appends during active runs currently use
   the WorkGraph port directly; when ZCode admission/lease boundaries are
   wired (PROJECT-STATE seam 4), the app layer should route user appends
   through that boundary — no contract change needed in my modules, but an
   integration decision for the TL.
5. **Evaluation "measured" provenance**: a real measurement channel (e.g.
   EvidenceRecord-linked intervention measurements) should feed
   `InterventionCostInput.basis` before any "measured" label is trusted.
