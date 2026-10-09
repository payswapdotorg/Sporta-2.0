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

---

# Worker A Wave 3 Report — read seams (w3a)

Status: WAVE 3 IMPLEMENTED (branch wave3/worker-a; base 14836c6 — the
TL-serialized wave-3 contracts carry). Scope: W3A-1 WorkGraphNode refs
(sporta-work) + W3A-2 OrganizationCandidateReadPort (sporta-lab, with the
additive read-only promotion-history port in sporta-organizations).
Authority order honored: ADR wave-3 read seams → contracts
records/readSeams.ts → architecture lock → work orders.

## WORK ITEMS

- **W3A-1 — WorkGraphNode refs** (`packages/sporta-work`): the graph
  service appends typed refs at the status transitions it ALREADY owns —
  `escalateGap` (capability-gap + escalation refs on the owning node +
  the `executing|awaiting-user -> escalated` edge), `recordArenaResult`
  (arena-result ref; resolves `escalated -> executing` when the arena
  owns the frontier), `commitArtifactRevision` (artifact-revision ref on
  an artifact-kind node, no status change). New additive
  `WorkGraphRefsPort` + three typed inputs; pure mechanics in
  `src/domain/nodeRefs.ts` (append-only, idempotent per (kind, refId),
  never removed/rewritten — immutable ledger law). editor-session /
  learning-artifact kinds are NOT produced by this lane (consumed only;
  the runtime kind guard still validates the full closed union).
  Existing public inputs keep their shapes exactly; v1 graphs without
  refs stay valid (proven by test).
- **W3A-2 — OrganizationCandidateReadPort**
  (`packages/sporta-lab`): `OrganizationCandidateReadService` implements
  the contracts port EXACTLY — `listOrganizationCandidates` (summaries
  field-for-field: candidateId/organizationId/version/status/basis;
  filters organizationId/candidateId/status) and `listPromotions`
  (mirrors PromotionRecord identity fields: promotionId/candidateId/
  decision/decidedAt). Bounded queries: default limit 50, hard cap 50,
  non-positive/non-integer limit = typed refusal. Read-only: no mutation
  surface (proven structurally by test).
  **Package choice (recorded per packet)**: the port is re-exported
  additively from `@sporta/lab/contract` because the Lab is the package
  whose population actually holds candidates (the organizations registry
  catalog — already the Lab's declared dependency);
  sporta-evaluation is stateless pure computation over caller-provided
  candidates and holds no population.
- **Enabling seam** (`packages/sporta-organizations`, owned lane):
  additive read-only `OrganizationPromotionHistoryPort.
  listPromotionRecords()` on `OrganizationRegistryService` (deterministic
  store order; drafts contribute nothing) + additive export of
  `candidateIdFor` (the canonical `<orgId>:<version>` convention) so the
  Lab seam and evaluation derive identical ids — no second convention.

## CHANGED FILES

All inside the four owned packages (git diff --name-only 14836c6..HEAD):

- sporta-work: `SPEC.md` (Wave 3 section), `CONTRACT.md`, `src/contract.ts`,
  `src/contract.example.ts`, `src/domain/errors.ts` (+3 typed errors),
  `src/domain/ports.ts` (+refs port), `src/app/workGraphService.ts`
  (+3 methods), `src/domain/nodeRefs.ts` (NEW, 141 lines),
  `test/workGraphRefs.test.ts` (NEW, 12 tests).
- sporta-organizations: `SPEC.md`, `CONTRACT.md`, `src/domain/ports.ts`
  (+history port), `src/app/organizationRegistryService.ts`
  (+listPromotionRecords), `src/contract.ts` (additive re-exports),
  `test/organization.test.ts` (+1 test).
- sporta-lab: `SPEC.md` (Wave 3 section), `src/contract.ts` (additive
  re-exports), `src/contract.example.ts`, `src/domain/errors.ts`
  (+LabCandidateQueryError), `src/domain/candidateReads.ts` (NEW, pure),
  `src/app/organizationCandidateReadService.ts` (NEW),
  `test/candidateReads.test.ts` (NEW, 10 tests).
- sporta-evaluation: unchanged (stateless; nothing to read).
- This report file (append-only wave-3 section).

Largest new file: 155 lines (`sporta-lab/src/domain/candidateReads.ts`);
largest touched test file 372 lines (`organization.test.ts`); every file
< 400 (file-size law measured via `wc -l`).

## TESTS

node:test + tsx only (no new frameworks). 23 new tests:

| package | file | new tests |
| --- | --- | --- |
| sporta-work | test/workGraphRefs.test.ts | 12 (escalateGap refs+status+idempotency+illegal-edge-no-partial-state; recordArenaResult resolution/non-escalated/late-idempotency; commitArtifactRevision idempotency+kind-refusal; append-order ledger; v1-no-refs validity) |
| sporta-lab | test/candidateReads.test.ts | 10 (field-for-field summaries; org/candidate/status filters; rejected/rolled-back honest empty; default cap 50 + explicit + capped; invalid-limit typed refusals; promotions field-for-field + filters + candidate-matches-nothing; empty registry; read-only surface) |
| sporta-organizations | test/organization.test.ts | +1 (listPromotionRecords determinism, drafts contribute nothing, stable after idempotent re-promotion) |

## REAL EVIDENCE

Measured first-hand on this machine at the delivered branch head
(`/home/z/sporta-2.0`, pnpm 10.33.2, node v24.21.0), commands exactly as
the packet specifies:

1. `pnpm architecture:check` → `architecture: OK / violations: 0 /
   baseline: 0 / new: 0`.
2. `node scripts/architecture/sporta-surface-check.mjs` → `OK — frozen
   surfaces intact, growth is additive-only` (sporta-work +32 additive,
   sporta-organizations +27, sporta-lab +15, sporta-evaluation +2).
3. `pnpm exec tsc -b packages/sporta-work packages/sporta-organizations
   packages/sporta-lab packages/sporta-evaluation` → exit 0, no output.
4. `pnpm exec tsx --test packages/sporta-work/test/*.test.ts
   packages/sporta-lab/test/*.test.ts
   packages/sporta-evaluation/test/*.test.ts` → `tests 53, pass 53,
   fail 0` (base: 31).
5. Full sporta suite (all 12 packages) → `tests 222, pass 222, fail 0`
   (base: 199; +23 = 12+10+1).
6. `pnpm lint 2>&1 | tail -3` → `Found 70 warnings and 0 errors`
   (identical to the pre-existing baseline; two transient warnings I
   introduced in a new test were fixed before delivery — scoped oxlint
   on my four packages reports 0 warnings).
7. Hygiene: `pnpm exec oxfmt --check` on my four packages — every file
   I created/modified is format-clean (the 96 pre-existing flagged
   files in those directories are untouched baseline noise, including
   gitignored dist/ artifacts).

## FIXTURE EVIDENCE

Everything runs on the in-memory fixture stores (InMemoryWorkGraphStore,
InMemoryOrganizationStore) with a fixed clock — fixture-grade by design:
the tests prove the read-seam and ref laws (idempotency, append-only,
bounded queries, honest mapping), never durability. No fabricated ids:
candidate ids/promotion ids/promotionId bases are derived from real
registry state; `promotion record <promotionId>` basis references the
actual immutable record read through the history port.

## CONTRACT CHANGES

None to `@sporta/contracts` (frozen; base 14836c6 types implemented
verbatim). Additive-only growth of my owned entrypoints:

- sporta-work: + types `WorkGraphNodeRef`, `WorkGraphNodeRefKind`,
  `EscalateGapInput`, `RecordArenaResultInput`,
  `CommitArtifactRevisionInput`, `WorkGraphRefsPort`; + errors
  `WorkGraphNodeNotFoundError`, `WorkGraphNodeKindError`,
  `WorkGraphNodeRefError`.
- sporta-organizations: + type `OrganizationPromotionHistoryPort`; +
  `candidateIdFor` function export.
- sporta-lab: + types `OrganizationCandidateReadPort`,
  `OrganizationCandidateSummary`, `PromotionSummary`,
  `OrganizationCandidateQuery` (contracts re-exports); + error
  `LabCandidateQueryError`; + consts `DEFAULT_CANDIDATE_LIMIT`,
  `MAX_CANDIDATE_LIMIT`; + `OrganizationCandidateReadService` (+deps).
- sporta-evaluation: no change.

## RIGHTS-PROVENANCE

Read seams propagate rights untouched: summaries carry no policy fields
to strip (field-for-field law), the registry store clones on read so
callers never alias policy-bearing records, and the refs appended by
sporta-work reference external record ids only (gap/escalation/result/
revision) — no policy weakening, no new data leaves its owner. The
OrganizationCandidateReadService deps are read-only by construction
(no mutation method exists on them). No hidden chain-of-thought is
stored (refs are id references only).

## PERFORMANCE

All in-memory: escalateGap/recordArenaResult/commitArtifactRevision are
O(nodes) per call (node lookup + map rebuild — same order as an append);
the read seam is O(catalog + promotions) per query with a map join,
bounded by the 50-row cap on output. Scoped 53-test battery runs in
~1.0 s wall (tsx startup included); full 222-test suite ~4.8 s. No
performance claims beyond fixture scale.

## SECURITY

No secrets or credentials in code/tests/report (the delivery token
appears only in the push URL, never committed or echoed). Typed
refusals everywhere: illegal status edges, missing nodes, wrong node
kinds, malformed refs, invalid limits, promoted-without-record registry
invariant violation — all typed errors, no silent fallbacks. Queries are
bounded (no unbounded reads — ADR law). Domain layers remain pure
(architecture checker domain-io rule: 0 violations).

## RISKS

- **recordArenaResult on a non-escalated graph appends the ref without
  a status change** (including closed graphs). This is a documented
  decision (cross-domain facts stay recordable; the ref ledger records
  history, it never rewrites it) — see SPEC.md "Refs vs the closed-graph
  law". If the TL wants results recordable ONLY while escalated, that is
  a one-line policy change at the app layer.
- **basis strings are minimal** ("unpromoted registry draft" /
  "promotion record <id>") — deterministic and honest, but a richer
  basis (gates/evidence summary) may be wanted when the projection UX
  lands (wave 4).
- **The 55-row bulk test pins the 50-row cap** — if the ADR cap changes,
  the test constant travels with `MAX_CANDIDATE_LIMIT` (imported, not
  duplicated).

## BLOCKERS

None. The contracts shapes worked as declared; no type was forked.

## DEVIATIONS

- `escalateGap` takes BOTH `gapId` and `escalationId` (the packet's
  "escalation ref + capability-gap ref" requires two refIds; the input
  carries both explicitly rather than deriving one from the other —
  honest ids, no fabrication).
- `commitArtifactRevision` returns the updated `WorkGraphNode` (not the
  graph record) — the natural unit for a single-node ref append; the
  other two methods return the graph record because they also transition
  status. Documented in SPEC.md.
- A generic optional `refs` field on `AppendWorkNodeInput` was
  considered and REJECTED: it would let callers produce kinds this lane
  must not produce (editor-session/learning-artifact). The additive
  typed-method surface enforces the produced-kinds law structurally.
  This satisfies "optional refs input field only where natural" — it
  was not natural anywhere in this lane.
- sporta-evaluation was left untouched: its population is caller-supplied
  (stateless); the port belongs to the Lab (choice recorded above per
  the packet's instruction).

## NEXT DEPENDENCIES

None required by this lane. Work-order notes for the TL (no TL-owned
file touched):

1. `rejected`/`rolled-back` candidate statuses and promotion decisions
   remain unproducible (wave-1 note carried forward): the honest empty
  arrays will become real data only after a rollback/rejection decision
   path exists in the registry (contracts already carry the union).
2. When worker-c's product projection consumes
   `OrganizationCandidateReadPort`, it should inject it as an optional
   dep per the ADR (absent seam ⇒ organization-improvement stage stays
   seam-pending).
3. If richer `basis` content is wanted for the wave-4 UX, extend the
   summary mapping in `sporta-lab/src/domain/candidateReads.ts` — the
   field-for-field law allows supersets.

DELIVERY: branch wave3/worker-a @ <sha recorded in the chat report — the single work commit on top of base 14836c6>
