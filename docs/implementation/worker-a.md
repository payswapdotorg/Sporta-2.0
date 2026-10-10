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

DELIVERY: branch wave3/worker-a @ d421db688d99a940a43aa7d65d9cb0011afda3cc (work commit on top of base 14836c6)

---

# Worker A Wave 4 Report (w4a)

Status: WAVE 4 LANDED (branch wave4/worker-a, base e40efb0)

Scope executed: the TL-serialized wave-4 worker-A lane (ADR:
docs/architecture/adr-wave4-c6-host.md) — W4A-1 (stabilize the W2
a17-real-execution flake) + W4A-2 (the organization
rejection/rollback decision path, P5 rollback leg).

## Ownership

W4A-1: the W2 lane-A authored artifacts
(packages/sporta-product/test/a17-real-execution.test.ts,
test/fixtures/zcode-cli-standin.mjs) + the W2 adapter
(packages/sporta-work/src/adapters/zcodeAgentRuntime.ts) + a new
sporta-work adapter-law test file. W4A-2: packages/sporta-organizations
+ packages/sporta-lab. Zero touches to contracts/policy/arena/editors/
artifacts/product-src/root manifests/lockfile.

## WORK ITEMS

- **W4A-1 — the W2 flake, root-caused first-hand.** The intermittent
  failure "the terminal event carries the real exit code: stand-in
  session completed" is a race between the ADAPTER's two
  terminal-ish event sources: (a) the stdout stream parser mapped the
  CLI's own `completed` session line to a TERMINAL-TYPE AgentRunEvent
  through the unguarded record() path, and (b) the child 'close'
  handler synthesized the REAL terminal event from the exit code
  ("zcode-cli exited with code 0") after stdio drained. An observer
  polling at 25ms could sample the run as terminal between (a) and (b)
  — the sampled "terminal" carried the stream message, not the exit
  code. Reproduced deterministically with a 1ms-poll harness against
  the REAL adapter + REAL stand-in: 60/60 race hits pre-fix (event
  list at break time: 1:started 2:started 3:progress 4:completed —
  the stream line masquerading as terminal), and a 25ms-poll
  histogram showing TWO terminal-type events per run (the structural
  duplication). Post-fix: 0/60 race hits, exactly ONE terminal-type
  event per run.
- **W4A-1 — the fix (owned code only; zero assertion weakening).**
  Three layers:
  1. Adapter (sporta-work/src/adapters/zcodeAgentRuntime.ts) — four
     documented W4A-1 laws: (1) exactly one terminal-type event per
     run, synthesized ONLY from the real process lifecycle (the
     finish() guard is the only path that records terminal-type
     events); (2) THE STREAM NEVER DECIDES THE VERDICT — terminal-
     looking stream lines record as progress evidence with their
     message verbatim; (3) the terminal event is the last event ever
     recorded; (4) line-buffered stdout parsing (a JSON line split
     across pipe chunks parses as ONE event, never raw fragments; a
     trailing newline-less line is flushed at stream end). This makes
     "last observed event is terminal-type" and "the run terminated"
     the same fact for every observer — the interleaving window no
     longer exists. This also stabilizes worker-c's a17-full-real
     test, which shares the stand-in and the same polling pattern.
  2. Stand-in fixture (zcode-cli-standin.mjs) — flush determinism:
     stream lines are awaited through stdout write-completion
     callbacks and the success path exits NATURALLY with
     process.exitCode = 0 (process.exit(0) can truncate pending
     async pipe writes); the usage path exits 1 with stderr flushed
     (verified: usage/no-args/bad-format all exit 1). The process,
     pipes, wall time and exit codes stay REAL.
  3. Test (a17-real-execution.test.ts) — the polling loop is now
     sound; assertions were STRENGTHENED: exactly one terminal-type
     event exists, and a settle-and-re-observe after the terminal
     must return the byte-identical final event list (the
     terminal-is-last law observed, not assumed). No assertion
     deleted or loosened; every original assertion still present.
- **W4A-1 — regression protection.** New
  sporta-work/test/zcodeAgentRuntime.test.ts (7 tests): the four
  adapter laws pinned against REAL child processes (executable
  wrapper scripts in a temp dir speaking the headless interface):
  terminal-looking stream lines stay progress evidence; exit code 3
  is the ONLY failed-verdict source; split-line parsing; ENOENT spawn
  failure is the single failed terminal; dispose kills a live child
  (observed via the child's stopped heartbeat) and discards run
  state; unknown-run observation never fabricates; startRun
  idempotency never re-spawns.
- **W4A-2 — the decision path (sporta-organizations).** Additive to
  OrganizationRegistryService, declared on the new
  OrganizationDecisionPort: rejectCandidate (decision "rejected",
  deterministic promotionId `rejection:<orgId>:<version>`, gates
  exactly the promotion gates: version-registered, evidence-present,
  policy-defined) and rollbackPromotion (decision "rolled-back",
  deterministic promotionId `rollback:<orgId>:<version>`, gates:
  version-registered, prior-promotion [a granted non-retracted
  promotion of the SAME candidate], evidence-present, policy-defined).
  Decision records are immutable PromotionRecords (the contracts
  union, no fork); idempotent per candidate+decision for identical
  effective evidence (input ∪ record evidence, deduped, input first);
  typed refusals otherwise: OrganizationDecisionError (failed gates,
  NEW typed error), OrganizationImmutableError (conflicting decisions:
  reject-after-promote, promote-after-reject, promote-after-rollback,
  rollback-after-reject/draft via the prior-promotion gate). Rollback
  RETRACTS the entry's promoted flag (the version leaves the
  resolver's candidate set) while KEEPING the granted promotion record
  (append-only history). Per-candidate ledger law: at most one
  rejection on a never-promoted draft, or one promotion followed by
  at most one rollback; the escape hatch for every refusal is the
  append-only registry itself (register a new version).
  listPromotionRecords (Wave 3 port, additive behavior evolution) now
  surfaces the full decision ledger in grant order.
- **W4A-2 — the read seam surfacing (sporta-lab).**
  candidateReads.ts: the honest empty arrays for rejected/rolled-back
  became REAL data — status derives from the LATEST decision record
  per candidate (listPromotionRecords returns grant order, so the
  last record per candidateId is the current state; a rolled-back
  candidate surfaces "rolled-back", not "promoted"); basis
  `decision record rejection:<id>` / `decision record rollback:<id>`
  (the promoted path keeps the Wave 3 wording byte-identical).
  organizationCandidateReadService.ts: the promotion join became the
  latest-decision join. listPromotions surfaces all three decisions
  field-for-field (the earlier promotion of a rolled-back candidate
  stays listed as history). The read-only surface is unchanged.

## CHANGED FILES

- packages/sporta-work/src/adapters/zcodeAgentRuntime.ts (MODIFIED —
  W4A-1 laws 1-4: stream-verdict downgrade + line-buffered stdout +
  stream-end flush; 270 lines)
- packages/sporta-work/test/zcodeAgentRuntime.test.ts (NEW, 309 —
  the adapter-law regression tests, real child processes)
- packages/sporta-product/test/a17-real-execution.test.ts (MODIFIED —
  strengthened assertions + stabilized-observation note; 240)
- packages/sporta-product/test/fixtures/zcode-cli-standin.mjs
  (MODIFIED — flush-deterministic writes + natural exit; 90)
- packages/sporta-organizations/src/domain/ports.ts (MODIFIED —
  additive: RejectCandidateInput, RollbackPromotionInput,
  OrganizationDecisionPort; 159)
- packages/sporta-organizations/src/domain/registry.ts (MODIFIED —
  StoredOrganizationVersion additive rejection/rollback records;
  promote refusal extensions; rejectStoredCandidate +
  rollbackStoredPromotion pure transitions; 292)
- packages/sporta-organizations/src/domain/errors.ts (MODIFIED —
  additive OrganizationDecisionError; 63)
- packages/sporta-organizations/src/app/organizationRegistryService.ts
  (MODIFIED — additive rejectCandidate/rollbackPromotion; the
  OrganizationDecisionPort implements clause; listPromotionRecords
  surfaces the decision ledger; 163)
- packages/sporta-organizations/src/contract.ts (MODIFIED — additive
  re-exports of the new types + error; 75)
- packages/sporta-organizations/test/organizationDecisions.test.ts
  (NEW, 395 — 14 decision-path tests)
- packages/sporta-lab/src/domain/candidateReads.ts (MODIFIED —
  latest-decision status mapping + decided basis strings; 182)
- packages/sporta-lab/src/app/organizationCandidateReadService.ts
  (MODIFIED — latest-decision join; 98)
- packages/sporta-lab/test/candidateReads.test.ts (MODIFIED — stale
  "unreachable states" test renamed honestly; split note; 243)
- packages/sporta-lab/test/candidateReadsDecisions.test.ts (NEW, 244 —
  6 decided-state surfacing tests)
- packages/sporta-organizations/SPEC.md + CONTRACT.md,
  packages/sporta-lab/SPEC.md (MODIFIED — Wave 4 sections)
- docs/implementation/worker-a.md (this section, append-only)

File-size law: every touched/created file ≤ 395 lines (wc -l;
organizationDecisions.test.ts 395 is the largest — the two lab test
files were split at 403 to stay under the law).

## TESTS

- NEW: 27 tests — 7 (sporta-work adapter laws) + 14
  (sporta-organizations decision path: gates, idempotency,
  immutability, rollback-requires-prior-promotion incl. cross-
  candidate, promote-after-reject/rollback refusals, decided-content
  draft-conflict semantics, ledger ordering, resolver retraction) +
  6 (sporta-lab decided-state surfacing: field-for-field, filters,
  latest-decision-wins, full decision ledger, determinism,
  bounded-read over decided populations).
- MODIFIED: 1 test renamed honestly (the lab rejected/rolled-back
  empty-array test — same assertions, honest name: "no candidate
  carries those decisions in this fixture"); the a17-real-execution
  assertions strengthened (exactly-one-terminal + event-list-final).
- Counts: scoped Worker-A battery 97/97 (70 base + 27 new — math
  exact); FULL battery 296/296 (269 base + 27 new — math exact),
  0 skipped.
- Flake gate: a17-real-execution 20/20 consecutive green runs, 17s
  wall (measured twice: pre-W4A-2 tree and final tree). a17-full-real
  (worker-c's, same stand-in + same poll pattern) 10/10.

## REAL EVIDENCE

All numbers below were measured first-hand on this machine (pnpm
10.33.2, node v24.21.0, pnpm exec tsx --test):

- pnpm architecture:check → OK, violations 0, baseline 0, new 0.
- node scripts/architecture/sporta-surface-check.mjs → OK, frozen
  surfaces intact, additive-only (organizations +31 additive [was +27
  at W3-A: +4 new names], work +32 [unchanged — no new exports], lab
  +15 [unchanged — internal mapping only], evaluation +2
  [unchanged]).
- pnpm exec tsc -b packages/sporta-work packages/sporta-organizations
  packages/sporta-lab packages/sporta-evaluation → exit 0 clean.
- Scoped battery (work+organizations+lab+evaluation) → 97 pass / 0
  fail / 0 skipped (duration ~2.2s).
- FULL battery pnpm exec tsx --test packages/sporta-*/test/*.test.ts →
  296 pass / 0 fail / 0 skipped, ~8.1s duration, 8s wall (run twice
  on the final tree: 296/296 both).
- pnpm lint → 0 errors, 70 warnings — identical to the wave-0/1/2/3
  baseline (all pre-existing).
- Flake reproduction harness (diagnostic, not committed): the exact
  a17 polling pattern at 1ms against the REAL adapter + REAL
  stand-in, 60 runs: 60/60 race hits pre-fix (terminal detail
  "stand-in session completed" — the W3-C-recorded failure
  reproduced), 2 terminal-type events per run; 0/60 post-fix, 1
  terminal-type event per run.
- a17-real-execution.test.ts: 20/20 consecutive green, 17s wall (the
  gate command from the packet, run verbatim; also 10 runs green
  before the fix era ended at 0/10 — the race is timing-dependent,
  which is why the 1ms harness is the deterministic proof).
- a17-full-real.test.ts: 10/10 green (stabilized by the adapter law
  fix without touching worker-c's file).
- Stand-in usage paths verified by direct invocation: wrong-flag /
  no-args / bad-format all exit 1 with the usage line on stderr.

## FIXTURE EVIDENCE

The adapter-law regression tests spawn REAL child processes whose
executable is a fixture wrapper script (temp dir, chmod 755, headless
interface); the process lifecycle observations (spawn, pipes, exit
codes, kill via heartbeat) are real, the script content is fixture.
The organizations/lab decision tests run on InMemoryOrganizationStore
with a fixed clock — fixture-grade by design (they prove the decision
LAWS, never durability). The a17-real-execution evidence classes are
unchanged from W2 (REAL execution leg + fixture stores + executable
stand-in, honestly labeled in the test header).

## CONTRACT CHANGES

None to @sporta/contracts (frozen; the PromotionRecord decision union
already carried rejected/rolled-back — implemented, not forked; no
contracts shape mismatch appeared). Additive-only growth of my owned
entrypoints:

- sporta-work: no new exports (adapter-internal laws; the 4 W4A-1
  laws live in code + tests).
- sporta-organizations: + types RejectCandidateInput,
  RollbackPromotionInput, OrganizationDecisionPort; + error
  OrganizationDecisionError.
- sporta-lab: no new exports (the read seam surface is unchanged;
  the latest-decision mapping is internal).

## RIGHTS-PROVENANCE

W4A-2 decision records carry the record's own evidence + policy
gates (promotion parity — no policy weakening: rejection and rollback
are REFUSED when policy is undefined). The lab summaries carry no
policy fields to strip (field-for-field law); the registry store
clones on read so callers never alias policy-bearing records. W4A-1
adds no data flow (process lifecycle evidence only). No hidden
chain-of-thought is stored (decision records carry gate names +
evidence ids).

## PERFORMANCE

All in-memory for W4A-2 (O(store) reads, map-join reads at the seam,
bounded by the 50-row cap; promote/reject/rollback are O(1) store
reads + one write). W4A-1 adds one string buffer per run (amortized
O(bytes)); the full battery runs in ~8s wall (unchanged order vs the
269-test baseline). The 20× flake gate: 17s wall (≈0.85s per run,
tsx startup included). No performance claims beyond fixture scale.

## SECURITY

No secrets or credentials in code/tests/report (the delivery token
appears only in the push URL, never committed or echoed). Fake
evidence ids in tests are literal fixture strings (no credential
fragments to assemble). Typed refusals everywhere: OrganizationDecisionError
carries failed gate names; immutability refusals carry the honest
escape hatch; invalid limits remain typed LabCandidateQueryError. The
stand-in validates its args and exits non-zero on usage errors (a
real CLI's contract). No new dependencies.

## RISKS

- The promote-after-rollback / promote-after-reject refusals make
  decided candidates TERMINAL by design (the escape hatch is a new
  version). If the TL later wants re-promotion after rollback (a
  "re-promote" decision), that is a new ADR — the per-candidate
  ledger law would need a third transition.
- The latest-decision join relies on listPromotionRecords' grant
  order (promotion before its rollback within one entry). The order
  is structural (the flatMap order is fixed) and pinned by tests,
  but a future store that reorders records must preserve it (or the
  join must switch to an explicit timestamp/sequence comparison —
  decidedAt is wall-clock and non-monotonic under a fixed clock, so
  it cannot be the ordering key today).
- The a17 polling loop is sound given the adapter laws; a future
  adapter that re-introduces stream-sourced terminal events would
  re-open the race — the zcodeAgentRuntime.test.ts regression tests
  pin the laws structurally.
- The basis strings for decided candidates ("decision record
  rejection:<id>") follow the Wave 3 minimal-by-design convention;
  richer basis content for the wave-4 UX remains a projection-layer
  decision (NEXT DEPENDENCIES note 3 from W3-A carries forward).

## BLOCKERS

None. The contracts shapes worked as declared (the decision union
was already frozen); no type was forked. The real zcode-cli bundle
remains unbuildable in this sandbox (the carried W2 BLOCKER — the
stand-in speaks the same headless interface; real zcode-cli execution
stays unmeasured here).

## DEVIATIONS

- The new organizations decision-path tests live in
  organizationDecisions.test.ts (NOT appended into
  organization.test.ts): the packet said "new decision-path tests in
  packages/sporta-organizations/test/organization.test.ts", but
  organization.test.ts is 372 lines and the file-size law (400) would
  be violated. Same deviation applied to the lab extension
  (candidateReadsDecisions.test.ts) — candidateReads.test.ts hit 403
  lines mid-edit and was split back under the law.
- The stale W3-A test name "status filters for rejected/rolled-back
  return an honest empty array (unreachable states)" was renamed to
  "...when no candidate carries those decisions (this fixture)" —
  same assertions, honest name (the states ARE reachable now; the
  fixture simply has none). Documented here as a test-name change.
- listPromotionRecords' behavior evolved additively (it now surfaces
  rejection/rollback records too): required by the packet's
  "extend only additively" for the promotion-history port — the
  signature, ordering law and read-only law are unchanged; the W3-A
  consumers see identical output when no decisions exist (all W3-A
  tests pass unchanged).

## NEXT DEPENDENCIES

None required by this lane (no new dependencies; pnpm-lock.yaml
untouched). Work-order notes for the TL:

1. The carried wave-1 note is CLOSED: rejected/rolled-back candidate
   statuses and promotion decisions are now producible end-to-end
   (registry decision path + lab read seam surfacing).
2. Worker-c's product projection can now surface real
   rejected/rolled-back rows through OrganizationCandidateReadPort
   (the organization-improvement stage detail may want to count
   decided states separately — a projection-layer choice).
3. If a re-promotion-after-rollback lifecycle is ever wanted, it
   needs a TL-serialized ADR (see RISKS).

# Wave 5 — Worker A (w5a)

Status: WAVE 5 LANE A COMPLETE (branch wave5/worker-a, base e919f81;
SPEC commit 317d90b before code; code commit 62341cc; this report
commit sits on top — the W3-B/W4-B documentation-commit pattern).

Scope executed: the TL-serialized wave-5 worker-A lane (ADR:
docs/architecture/adr-wave5-p6-sports-production.md, Decision 1 +
Decision 4) — W5A-1 (the sports-world-model contract's pipeline stages
as pure additive domain functions in sporta-world), W5A-2 (end-to-end
composition -> the EXISTING ingestObservations boundary), W5A-3 (the
domain-extension law invariant with a second synthetic domain).

## WORK ITEMS

- **W5A-1 — pipeline domain surface (NEW
  `packages/sporta-world/src/domain/pipeline/`, additive; the Wave 1
  ingestion seam is FROZEN — zero edits to snapshot.ts/ports.ts/
  WorldModelService.ts/domain errors, verified by empty diff at the
  delivered head).** Six stage files + shared vocabulary + typed
  errors + composition, every stage: typed input/output records,
  typed errors (all extending the Wave 1 `WorldModelError`),
  deterministic + idempotent per batch, provenance carried (every
  output cites the authorized acquisition chain), uncertainty carried
  (confidence NEVER raised — carry or min-lower only):
  1. `acquisition.ts` — an authorized source declaration (media refs,
     rights scope, provenance seed) becomes a typed acquisition
     record (the chain root). Fail-closed: non-authorized source
     kinds are a typed `AcquisitionProvenanceError` (the seam's
     ingestible vocabulary, mirrored not invented); a rights scope
     that affirms no usage is a typed `AcquisitionRightsError` (the
     W3-B/W4-B empty-usage law); structural manifest violations (no
     media, dup media/manifest ids, mixed domains in one batch) are
     refused; the seed must DECLARE a valid confidence; the effective
     source ceiling = min(seed confidence, declared ceiling).
  2. `normalization.ts` — raw observations -> normalized records in
     THE EXACT `ObservationInput` vocabulary `ingestObservations`
     already accepts (zero seam edits): canonical payload hashing
     (recursive key-sort; key-order independent), the SEAM's own
     `deriveObservationId` for stable ids (natural retries idempotent
     at the seam), provenance MINTED from the validated chain, the
     manifest's declared policy carried on every observation, source
     ceiling applied by min. Refusals: unknown media, unparseable
     timestamps, out-of-range confidence, dup rawIds, non-plain
     payloads.
  3. `perception.ts` — HONEST typed transform (the SPEC's honesty
     statement is law: NO ML model is loaded, executed or claimed
     anywhere; every fact is a DECLARED rule applied
     deterministically to a payload). Rule vocabulary: entity-state /
     ball-state field maps (+ optional z, optional possession, rule
     confidence factor). Application law: a rule engages when any
     mapped field is present; every PRESENT mapped field must be
     well-typed (mistyped = typed `PerceptionError` naming rule +
     field); a fact is produced only when ALL required mapped fields
     are present; absence is never a fact. Facts sorted+deduped by
     deterministic factId (length-prefixed opaque id segments — no
     hash seam threaded past normalization).
  4. `tracking.ts` — entity continuity by DECLARED keys only
     (grouping on (entityId, kind); positional proximity is never
     identity — that would be guessing). Required `maxGapMs`
     continuity budget (+ optional gap confidence ceiling); gaps
     beyond budget are RECORDED as typed `TrackGap`s, never
     interpolated (no state invented); states ordered by capturedAt
     with factId tie-break; track confidence = min over states (min
     gap ceiling when gaps exist).
  5. `calibration.ts` — camera/timing alignment: typed parameters in,
     typed corrections out. Optional `TimingCalibration` (per-media
     ms offsets) and `CameraCalibration` (per-media axis-aligned
     per-axis scale/translation); absent stage = dimension carried
     unchanged. Fail-closed: an active stage must affirm EVERY cited
     media ref; scales finite non-zero; offsets finite; ceilings
     valid. The gap PAIRING was decided at tracking; calibration
     corrects the measurement (corrected endpoints, recomputed
     duration). Confidence narrowed by active ceilings only.
  6. `eventReconstruction.ts` — the contract's event vocabulary:
     `zone-entry` (axis-aligned ground-plane zone, watched entities;
     fires ONLY on an observed outside->inside consecutive pair — a
     first state already inside emits nothing) and `possession-change`
     (the declared ball's ball-state track; fires only between
     consecutive differing possessions; a change to/from an absent
     possession is carried honestly with the missing side omitted).
     Every event carries per-event provenance refs to its SOURCE
     OBSERVATIONS (`sourceObservationIds`) and source facts, the
     acquisition chains, the rule id, the calibrated timestamp and
     min-carried confidence; deterministic eventIds; dedup + sort.
- **W5A-2 — end-to-end composition (`pipeline/composition.ts`).**
  `planPipelineObservations(plan, seams)` is a PURE evaluation of the
  whole chain (manifest -> stages -> planned observations in the seam
  vocabulary); `runPipeline(world, plan, seams)` then calls the
  EXISTING `WorldModelPort.ingestObservations` boundary unchanged and
  returns the `SportsWorldModelRecord`. All-or-nothing is STRUCTURAL:
  every stage is pure, so a failure at ANY stage throws before the
  seam is ever called (proven by tests at an early stage AND a late
  stage: zero ledger entries, zero snapshots). Event observations are
  minted deterministically (`obs:<eventId>`, payloadHash over the
  canonical event detail INCLUDING source observation ids, eventRefs/
  entityRefs, the declared policy) so pipeline retries re-ingest
  idempotently. Composition refusals: missing manifest, empty raws
  (mirroring the seam's own empty-batch refusal) — typed
  `PipelineCompositionError`.
- **W5A-3 — domain-extension law invariant (ADR Decision 4).** One
  full end-to-end test with a SECOND synthetic domain that is not
  football and not a sport at all — "warehouse-robotics" (site
  telemetry + lidar, robots, a pallet) — flowing through the SAME
  composition function, the SAME stage functions and the SAME types
  with only new DATA (domain tag, different field vocabulary,
  different zones, per-media calibration), landing an independent
  `swm:warehouse-robotics` snapshot that coexists with `swm:football`
  on the same world (disjoint entities, independent ledgers, no
  cross-domain mutation). No WorkGraph or Organizations change exists
  or is needed anywhere in this lane.

## CHANGED FILES

- `packages/sporta-world/SPEC.md` — appended the Wave 5 pipeline SPEC
  section FIRST (own commit 317d90b, before any code — the
  SPEC-before-code law), including the NO-ML honesty statement, stage
  laws, per-stage behavior, composition semantics, the
  domain-extension law and the failure-semantics table.
- `packages/sporta-world/src/domain/pipeline/` (NEW, 9 files, 1673
  lines total, all <= 288 lines): `provenance.ts` (shared chain
  types, canonicalJson, opaque id segments, carry-or-lower,
  runtime guards), `errors.ts` (8 typed pipeline errors),
  `acquisition.ts` (209), `normalization.ts` (165),
  `perception.ts` (222), `tracking.ts` (173), `calibration.ts` (288),
  `eventReconstruction.ts` (283), `composition.ts` (165).
- `packages/sporta-world/src/contract.ts` — additive re-exports only
  (34 types + 18 values = 52 new public names; the frozen Wave 1
  surface untouched; 121 lines, under the 300 contract-line cap).
- `packages/sporta-world/src/contract.example.ts` — additive pipeline
  example (manifest, raws, rules, a complete plan + seams).
- `packages/sporta-world/CONTRACT.md` — additive "Wave 5 pipeline
  notes" section (invariants types cannot express).
- `packages/sporta-world/test/` — 8 NEW test files (all <= 333
  lines): `pipeline-acquisition.test.ts` (5),
  `pipeline-normalization.test.ts` (4), `pipeline-perception.test.ts`
  (3), `pipeline-tracking.test.ts` (3), `pipeline-calibration.test.ts`
  (4), `pipeline-events.test.ts` (4), `pipeline-composition.test.ts`
  (8), `pipeline-domains.test.ts` (3) — 34 new tests total.
- NOT touched: snapshot.ts, ports.ts, WorldModelService.ts, the Wave
  1 domain errors, world.test.ts (empty diff at the delivered head —
  the frozen-seam law), sporta-contracts, all other packages, root
  manifests, pnpm-lock.yaml (zero new dependencies — stdlib only).

## TESTS

34 new tests (node:test via the repo tsx devDependency — zero new
test-framework dependencies), all green:

- acquisition (5): authorized manifest -> chain record; every
  non-authorized source kind refused (all 5 non-ingestible kinds,
  typed + named); seed-confidence law (missing/invalid/ceiling +
  effective-ceiling min); empty-usage rights refused; malformed
  batches (no media, dup media, dup manifest id, mixed domains)
  refused; empty batch total.
- normalization (4): exact seam vocabulary + minted provenance +
  canonical hash + the seam's own id derivation; key-order
  independence (same payload, same id); source ceiling carry-or-lower
  (three exact values); typed refusals (unknown media, bad timestamp,
  bad confidence, dup rawId, array payload) + empty-batch totality.
- perception (3): deterministic extraction (sorted/deduped factIds,
  exact confidences 0.9 carried / 0.8 narrowed, possession carried,
  chain citations, re-run deepEqual); skip/partial/mistyped laws (no
  match, engaged-but-incomplete, wrong type = typed refusal naming
  rule+field, z present/absent semantics, optional possession);
  mixed domains + malformed rule batches refused.
- tracking (3): declared-key identity + gap recording (exact gap
  9000ms, no interpolation, gap-ceiling confidence 0.7, acquisition
  citations); factId tie-break determinism; param validation
  (0/negative/NaN/Infinity, bad ceiling) even with empty facts.
- calibration (4): exact corrections (offset +100ms re-serialized,
  scale/translation positions, ceiling-narrowed confidences, gap
  carried with corrected endpoints, re-run deepEqual); z-axis law
  (declared -> corrected, undeclared -> carried); absent params carry
  everything unchanged; refusals (undeclared media per active stage,
  zero scale, NaN offset, bad ceiling) + declared-identity transform
  legality + empty-batch totality.
- events (4): zone-entry fires only on observed outside->inside
  (exact record: timestamp, confidence, detail, 2 source
  observations/facts, chains); first-state-inside/exit/unwatched emit
  nothing; possession-change laws (differing fire with honest absent
  side, equal/both-absent emit nothing, entity-state tracks are not
  ball tracks); rule validation + determinism + sort.
- composition (8): pure full-chain plan (every stage's records, 9
  planned observations, deterministic re-plan deepEqual); end-to-end
  SWM snapshot (entities/events/uncertainty exact multiset, declared
  policy, all-authorized ledger, snapshot hash recomputed from the
  ledger via the seam's own function, every event's source
  observations present); idempotent re-run (same snapshot, no
  duplicates); all-or-nothing at an EARLY stage and a LATE stage
  (zero side effects both); composition refusals (empty raws,
  missing manifest, null plan); absent optional stages (tracking
  params still validated); weaker-policy re-run refused at the seam
  (rights never weaken silently); confidence never raised through
  the whole chain (per-observation against raw origins).
- domains/W5A-3 (3): the second synthetic NON-SPORT domain
  end-to-end through the SAME seams (independent snapshot, exact
  uncertainty multiset, per-domain vocabulary, per-media timing
  -50ms and camera +2 asserted on the events/tracks); two-domain
  coexistence on one world (disjoint entities, independent ledgers,
  football hash untouched); cross-domain manifest batch refused at
  the gate.

## REAL EVIDENCE

How measured: every gate command run at the delivered code commit
62341cc in this sandbox, outputs quoted verbatim in the gate table
below. The pipeline functions themselves run for real — the tests
assert EXACT deterministic outputs of the real functions on the real
fixture inputs (exact confidences 0.95/0.9/0.85/0.8/0.7, exact
canonical sha-256 payload hashes via the real
`sha256WorldHash` adapter, exact corrected timestamps
(2026-04-01T00:00:01.100Z etc.), exact corrected positions
((5,5)->(11,11)), exact gap 9000ms, exact event records), and the
determinism assertions are real re-run deepEquals against the real
outputs. Test durations are real wall-time reported by node:test
(individual pipeline tests 0.1-6.5ms; full battery 352 tests in
~10.1s wall). The tsx caveat is the documented repo law: tests
execute by transpilation without typechecking; src/ carries the full
tsc gate (clean, exit 0).

## FIXTURE EVIDENCE

Everything the pipeline CONSUMES in the tests is fixture-grade,
labeled in every test-file header exactly like the a17 reference: a
synthetic football broadcast (one authorized broadcaster seed, one
camera, one player, one ball, one zone — invented data), and a
synthetic warehouse-robotics site (telemetry + lidar, one robot, one
pallet — invented data, chosen NON-SPORT to prove the domain law the
hard way). No real media file, real rights holder, real camera model
or real perception provider exists in this lane, and none is claimed.
The honest claim of this wave (typed in SPEC + test headers): the
pipeline's LAWS (typing, provenance carry, confidence
carry-or-lower, idempotency, fail-closed refusals, domain
additivity, all-or-nothing composition) are proven end-to-end at
fixture grade. NO ML: no model is loaded, executed or claimed — the
perception stage is a deterministic rule-based typed transform, and
the SPEC says so explicitly before the code.

## CONTRACT CHANGES

None to frozen contracts. `@sporta/contracts` untouched (the
per-package duplication law — the pipeline's vocabulary lives in
sporta-world's domain layer). sporta-world's public entrypoint grew
ADDITIVELY: 52 new exported names (34 types + 18 values) re-exported
from the new domain/pipeline files; the frozen Wave 1 surface is
intact (surface check: "sporta-world exports all 3 frozen names
(+71 additive)" — 19 additive before this wave, 71 after). The
ingestion seam signatures are byte-identical to the base (empty git
diff on snapshot.ts/ports.ts/WorldModelService.ts).

## RIGHTS-PROVENANCE

- The acquisition RIGHTS GATE is fail-closed and FIRST: a manifest
  whose policy carries no rights scope, or whose rights declare NO
  usage class, is refused before any observation enters the chain
  (`AcquisitionRightsError`) — a scope that affirms nothing
  authorizes nothing (the W3-B/W4-B doctrine, mirrored for the
  pipeline entry).
- Holders are carried, never evaluated (the seam-level doctrine:
  holder-bound authorization is a policy-domain concern above this
  package).
- The declared manifest policy is carried on EVERY planned
  observation, so it becomes the snapshot's established policy at the
  seam; a later pipeline run with a weaker policy is refused by the
  SEAM's own WorldPolicyConflictError (tested — rights are never
  silently weakened through the pipeline path).
- Provenance chain: every stage output cites the authorized
  acquisition chain (acquisitionIds); reconstructed events
  additionally cite their source observations and source facts; the
  seam's per-observation ledger retains the minted authorized-source
  provenance (tested: all 9 ledger entries cite the broadcaster).
- C6 usage-context vocabulary consumed, never invented: the gate
  checks `RightsScope.usages` classes only, exactly the
  `@sporta/policy` vocabulary.

## PERFORMANCE

Measured (real wall-time, node:test durations on this 4 GB sandbox):
individual pipeline stage tests 0.1-6.5ms; the full end-to-end
composition test (6 raws -> 6 observations + 3 events -> seam ingest
-> snapshot) ~1.5ms; the whole 352-test battery ~10.1s wall (base
318-test battery was ~9.4s — the +34 tests add ~0.7s). Structural
costs: canonical payload hashing is O(payload size) with one
sha-256 per raw observation; perception is
O(normalized x rules) with short-circuit engagement; tracking sorts
per (entity,kind) group; calibration is O(states); event
reconstruction is O(tracks x states). All state is per-call and
ephemeral (pure functions) — no caching, no growth across calls. The
in-memory WorldModelService seam remains fixture-grade (the Wave 1
record); a durable store swap is the same seam change typed since
Wave 2.

## SECURITY

- No credentials, tokens or real user data appear in code, tests or
  this report (the git push URL token is never echoed in any
  committed file).
- No network, no filesystem, no timers in the new code (domain
  layer — the architecture checker's domain-io rule: 0 violations).
- Fail-closed everywhere: unauthorized source kinds, empty rights
  scopes, unknown media, mistyped rule fields, undeclared
  calibration media and malformed parameters are all typed refusals
  that name the offending record; a refusal at any stage leaves zero
  ingestion side effects (structural, tested at an early and a late
  stage).
- Runtime type guards on every caller-supplied structure (plain-
  object/finite-number/non-empty-string checks) — malformed JS
  callers get typed refusals, not TypeErrors.
- Deterministic ids are length-prefixed over their segments —
  caller-supplied id strings cannot collide through concatenation.
- Canonical JSON is bounded by payload size; non-JSON payloads
  (bigint) are a typed refusal, not a crash.

## RISKS

- The source-kind gate and the empty-usage rights gate mirror the
  seam's vocabulary at the PIPELINE entry; the seam itself remains
  the final enforcement (defense in depth, not a replacement).
- Identity association is strictly by declared keys — two entities
  sharing one declared id are ONE track by law (never positionally
  disambiguated); callers must declare their identity vocabulary
  honestly.
- Calibration corrects measurements, not detections: a detected gap
  can end up with a smaller (even negative) corrected duration when
  per-media offsets diverge — the honest corrected measurement of a
  real detection decision; renderers must not assume gapless or
  positive-corrected chains.
- Zone-entry is a consecutive-pair crossing law: entries that happen
  entirely between two observed states (out->in->out within one gap)
  are NOT detected — honest absence, but downstream consumers must
  not equate "no event" with "never entered".
- The fixture-grade in-memory seam is the production-truth store
  today (the Wave 1 record); the pipeline is pure and seam-agnostic,
  so a durable store swap changes nothing here.

## BLOCKERS

None. The frozen seam's `ObservationInput` vocabulary accepted the
pipeline's planned observations exactly as specified — zero seam
edits were needed (empty diff on all five frozen files).

## DEVIATIONS

- SPEC clarification (stage totality): the SPEC's stage-laws section
  says every stage maps an empty batch to an empty batch, while the
  normalization section listed "non-empty raws" as a validation.
  Implemented per the stage-laws section (stages total on empty
  input) with the COMPOSITION refusing empty raws (typed
  `PipelineCompositionError`) — which the same SPEC paragraph
  prescribes. No behavioral gap: direct stage callers get [];
  pipeline callers get the seam-mirroring refusal.
- `ReconstructedEvent` carries a `domain` field (the SPEC's
  reconstructEvents signature takes a domain parameter; its field
  list did not mention it) — resolved by carrying the validated
  domain on every event so events self-describe; used by the
  composition when minting event observations.
- `zField` is required-if-declared (a rule declaring z applies only
  to payloads that carry it) and `possessionField` is an optional
  mapped field (present -> type-validated + carried; absent -> honest
  possession-less fact) — both are the fail-closed readings of the
  SPEC's "ALL mapped fields present" application law plus its
  "optional carried possession" wording; documented in the stage
  file headers.
- Test files were split per stage (8 files) so every file stays
  under the 400-line law — no file in this wave exceeds it (max
  production file 288 lines, max test file 333 lines).
- Three transient lint warnings appeared during development (one
  unused import, two redundant spreads) and were fixed before
  delivery — the delivered lint count is byte-identical to the
  baseline (0 errors / 70 warnings).
- Test-development note, honestly recorded: 3 initial test
  EXPECTATIONS were wrong against the SPEC-correct implementation
  (zField semantics, empty-batch calibration totality, a
  reference-equality fixture bug) and were corrected in the tests —
  zero implementation changes were needed for them; the
  implementation never changed to make a test pass.

## NEXT DEPENDENCIES

1. w5b (renderer adapters + two materially different realities): the
   pipeline result (`PipelineResult` carries facts, tracks,
   calibrated tracks, events + the SWM record) is the natural input
   for `SwmRenderModel` adapters — renderers consume the SNAPSHOT
   through adapters per the invariant, but per-event detail records
   (zone ids, possession from/to, source observation ids) are richer
   in `ReconstructedEvent` than in the seam's eventRefs; the adapter
   boundary decides which plane it reads (typed as a w5b concern).
2. Event-instance scoping remains the Wave 1 typed dependency
   (swmId is `swm:<domain>` per fixture-grade single-snapshot-per-
   domain semantics); a multi-match pipeline (two acquisitions of
   one domain landing distinct event instances) needs that additive
   seam input first.
3. TL note (optional, no action needed by this lane): the
   acquisition gate requires the provenance seed to DECLARE a
   confidence (fail-closed reading of the SPEC's seed-confidence
   law); if the TL prefers optional-seed-confidence with ceiling
   default 1.0, it is a one-line change in acquisition.ts +
   SPEC — flagged for ratification.
4. The composition takes ONE manifest per run (normalization's
   signature); multi-manifest batches (acquireSources already
   accepts them) compose by sequential runs today — a multi-
   acquisition composition input is additive if a use case appears.

DELIVERY: branch wave5/worker-a @ 62341cccd2db729172b49c674d6e97b583ad591f (code-complete; SPEC commit 317d90b precedes it; this report commit sits on top — the documentation-commit pattern)

## Gate table (measured at the delivered head 62341cc)

| Gate                                             | Base e919f81        | wave5/worker-a                          |
| ------------------------------------------------ | ------------------- | --------------------------------------- |
| pnpm architecture:check                          | 0 violations        | 0 violations / baseline 0 / new 0      |
| sporta-surface-check                             | OK                  | OK (world 3 frozen +71 additive)       |
| tsc -b packages/sporta-world                     | clean               | clean (exit 0, fresh build)            |
| tsx --test packages/sporta-world                 | 9 pass / 0 fail     | 43 pass / 0 fail (9 + 34 new)          |
| tsx --test packages/sporta-* (full battery)      | 318 pass / 0 fail   | 352 pass / 0 fail (318 + 34 new)       |
| pnpm lint                                        | 0 errors / 70 warn  | 0 errors / 70 warnings (identical)     |
