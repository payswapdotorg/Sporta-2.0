# sporta-lab — SPEC (Wave 1)

Spec-before-code record for **A4 seed**: population search + replay.
Spec-before-code per AGENTS.md; the repository is authoritative.

## Scope

`LabService` implements `LabPort`:

- `searchPopulation(input)` — derives organization candidates from the
  organizations registry catalog by population kind;
- `replay(input)` — replays a historical WorkGraph under a candidate
  organization and produces a `LabReplayReport`.

**Replay is SIMULATION.** Every report is replay/fixture evidence, never
production truth (architecture-lock invariant 6). No real agent execution
happens here.

## Single state owner

The Lab owns no durable state. It reads:

- organizations: `OrganizationCatalogPort` (from `@sporta/organizations`),
- work: `WorkGraphPort & WorkGraphLedgerPort` (from `@sporta/work`).

and injects a clock (`now: () => string`). It writes nothing.

## searchPopulation

1. Input `populations` is validated against the closed `LabPopulationKind`
   union; an unknown kind → `LabPopulationKindError` (typed, honest).
2. Candidates are the catalog entries; a candidate matches a population
   kind through these **declared Wave 1 heuristics** over record fields
   (deterministic, documented, fixture-grade):

| population kind        | matches when                                    |
| ---------------------- | ----------------------------------------------- |
| baseline-generalist    | intentProfile contains token `generalist`       |
| specialist             | intentProfile contains token `specialist`       |
| historical-winner      | entry is promoted AND record.evidence non-empty |
| personalized           | record.learnedPreferences non-empty             |
| hand-authored          | intentProfile contains token `authored`         |
| arena-improved         | any evidence id starts with `arena`             |
| experimentally-evolved | intentProfile contains token `evolved`          |

3. A candidate matching several requested kinds appears ONCE; its
   `rationale` lists all matched kinds (declaration order). Output sorted
   by (organizationId asc, version asc) — deterministic.
4. `input.environmentProfile` / `constraints` / `userRef` / `sourceRef` do
   NOT filter the population: environment/constraint fit is the
   resolver's job (separation of concerns), and personalization never
   applies inside the Lab (A5 boundary — the Lab applies no user's
   preference to anyone). This is documented behavior, not an omission.
5. No matches → `[]` (an empty population is honest, not an error).

## replay

1. `readWorkGraph(workGraphId)` → missing → `LabWorkGraphNotFoundError`.
2. `readAppends(workGraphId)` — the append ledger provides actor
   provenance (the frozen node records carry no actor field).
3. The report is a **deterministic simulation** over (graph, ledger,
   organization):
   - `outcome`:
     - `failure` iff status is `escalated` OR the graph has no nodes;
     - `success` iff status is `closed` AND an `outcome` node exists;
     - `partial` otherwise.
   - `interventionCost` = `max(0, userAppends − min(userAppends,
organization.learnedPreferences.length))` where `userAppends` counts
     ledger entries with `actor.actorKind === "user"`. Declared fixture
     simulation: each learned preference absorbs at most one historical
     manual intervention. This measures a PLAUSIBLE reduction signal, not
     a real one.
   - `evidence` = node ids of `evidence`-kind nodes in the source graph
     (real ids from replayed data; nothing is fabricated).
   - `replayedAt` = injected clock.

## Failure semantics

Typed errors in `src/domain/errors.ts`: `LabPopulationKindError`,
`LabWorkGraphNotFoundError`. No fabricated evidence, no silent fallback:
a missing graph is an error, an unknown population kind is an error, an
empty match set is an honest empty array.

## Event order

search: validate kinds → read catalog → derive+dedup → sort. replay: read
graph (fail fast) → read ledger → simulate → return.

## Honest-evidence note

Population heuristics and the intervention-cost formula are declared
fixture-grade simulations. `LabReplayReport` values are replay evidence
only — they must never be promoted into production organization state
without the full evaluation + promotion gates.

## Wave 3 — OrganizationCandidateReadPort (candidate/promotion read seam)

Spec-before-code record for the Wave 3 read-seams lane (ADR:
`docs/architecture/adr-wave3-read-seams.md`). `OrganizationCandidateReadService`
(src/app/organizationCandidateReadService.ts) implements the contracts'
`OrganizationCandidateReadPort` EXACTLY (re-exported additively from this
package's contract.ts). Read-only: no mutation surface.

### Package choice

The port lives in **sporta-lab** (not sporta-evaluation): the Lab is the
package whose population actually holds organization candidates — the
registry catalog (`OrganizationCatalogPort.listVersions()`), already the
Lab's declared dependency. sporta-evaluation is a stateless pure
computation over caller-provided candidates and holds no population to
read. The registry's immutable promotion history is exposed through the
new read-only `OrganizationPromotionHistoryPort` (sporta-organizations,
additive).

### listOrganizationCandidates(query)

- Population: every registry catalog entry, in store order
  ((organizationId asc, version asc) — deterministic).
- Summaries are field-for-field the contracts' five
  `OrganizationCandidateSummary` fields (no extras, no missing):
  `candidateId` (canonical `<orgId>:<version>` via `candidateIdFor`),
  `organizationId`, `version`, `status`, `basis`.
- **Honest status mapping** (Wave 4: all four states are PRODUCIBLE — the
  registry's decision path landed; before Wave 4 rejected/rolled-back
  were honestly unproducible and returned `[]`):
  | registry entry (latest decision record) | summary status | basis |
  | --------------------------------------- | -------------- | ---------------------------------- |
  | no decision record | `candidate` | `unpromoted registry draft` |
  | decision `promoted` | `promoted` | `promotion record <promotionId>` |
  | decision `rejected` | `rejected` | `decision record rejection:<id>` |
  | decision `rolled-back` | `rolled-back` | `decision record rollback:<id>` |
  The LATEST decision record per candidate is the current state (the
  registry returns records in grant order — promotion before its
  rollback — so the last record for a candidateId is the current one); a
  rolled-back candidate therefore surfaces `rolled-back`, not `promoted`.
  A promoted entry whose promotion record is missing is a typed
  `LabCandidateQueryError` (registry invariant violation), never a silent
  downgrade.
- Filters: `organizationId`, `candidateId`, `status` (all optional, ANDed).

### listPromotions(query)

- Population: the registry's immutable decision records (promotions,
  rejections, rollbacks — the full per-candidate decision ledger), store
  order (grant order per candidate: promotion before its rollback).
- Summaries mirror the PromotionRecord identity fields field-for-field:
  `promotionId`, `candidateId`, `decision`, `decidedAt`.
- Status filter mapping: `promoted`/`rejected`/`rolled-back` filter by
  decision; `candidate` matches nothing (a never-decided version has no
  decision record). `organizationId` filters via the inverse of the
  candidateId convention (`candidateId.slice(0, lastIndexOf(":"))`).
- All three decisions are producible since Wave 4; the earlier promotion
  of a rolled-back candidate stays listed as immutable history.

### Bounded-query law

Filters apply first, the limit last: `filter → slice(0, limit)`.
Default limit 50; hard cap 50 (a larger request is capped — ADR
"limit required default capped by implementers"). A non-positive or
non-integer limit is a typed `LabCandidateQueryError` — malformed input
is refused, never silently coerced.

### Failure semantics

`LabCandidateQueryError` (invalid limit; promoted-without-record invariant
violation). Empty results are honest `[]`, not errors. No IO, no clock:
both queries are pure reads over the injected catalog ports.
