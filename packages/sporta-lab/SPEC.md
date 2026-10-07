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
