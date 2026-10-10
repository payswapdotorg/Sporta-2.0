# sporta-organizations — SPEC (Wave 1)

Spec-before-code record for **A2 + A3** (organization registry + resolver),
with the **A5** personalization boundary seed and the **A6** minimal
immutable-promotion path. Spec-before-code per AGENTS.md; the repository is
authoritative.

## Scope

Draft registration (append-only, monotonic versions), promotion (immutable
afterwards), deterministic explainable resolution, per-user preference
records. In-memory fixture-grade; domain is pure (no IO, no timers).

## Single state owner

`OrganizationRegistryService` (app) is the only writer of organization
version state, through the module-internal `OrganizationStorePort`
(per-version read/list/write; `adapters/inMemoryOrganizationStore.ts`
implements it, fixture-grade). `UserPreferenceService` (app) is the only
writer of preference records through `UserPreferenceStorePort`
(`adapters/inMemoryUserPreferenceStore.ts`). A model/provider is never an
organization; the registry stores `OrganizationVersionRecord`s only.

## Registry semantics (A2)

- `registerDraft(record)`:
  - unknown `(organizationId, version)` + deep-equal retry of an existing
    record → the same record, no duplicate (idempotent);
  - existing draft + different content → `OrganizationDraftConflictError`
    (append-only registry: change content by registering a NEW version);
  - existing **promoted** version + different content →
    `OrganizationImmutableError` (the typed immutability invariant);
  - new version: must be exactly `1` for the first registration and exactly
    `max + 1` afterwards (contiguous monotonic sequence per
    organizationId) → otherwise `OrganizationVersionMonotonicError`.
- `readVersion(id, version)` → record or `null`.
- `listVersions()` → catalog entries `{ record, promoted }` sorted by
  (organizationId asc, version asc) — deterministic.

## Promotion (A6, minimal immutable path)

`promote({ organizationId, version, evidence? })`:

- unknown version → `OrganizationVersionNotFoundError`;
- already promoted + same effective evidence (input ∪ record evidence,
  deduped, input first) → the same `PromotionRecord` (idempotent);
- already promoted + different effective evidence →
  `OrganizationImmutableError` (promotion records are immutable);
- gates (all must pass, else `OrganizationPromotionError` carrying the
  failed gate names):
  1. `version-registered` — the version exists;
  2. `evidence-present` — effective evidence non-empty;
  3. `policy-defined` — `policy.rights.holders` and `policy.rights.usages`
     non-empty.
- on success: a `PromotionRecord` (decision `promoted`, deterministic
  `promotionId` = `promotion:<orgId>:<version>`, `candidateId` =
  `<orgId>:<version>`, `decidedAt` = injected clock) and the version is
  marked promoted — from then on ANY content mutation attempt is
  `OrganizationImmutableError`.

Rollback is intentionally out of Wave 1 scope (minimal path; see the worker
report NEXT DEPENDENCIES).

## Resolver (A3) — deterministic + explainable

`OrganizationResolverService` implements `OrganizationResolverPort`:

1. reads the catalog; only **promoted** versions are resolution candidates
   (drafts are Lab material, never production selections);
2. deterministic order: candidates sorted by (organizationId asc, version
   desc);
3. score = weighted factors (fixed weights):

| factor             | weight | score (0..1)                                                                                                                      |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| environment-match  | 0.30   | 1 iff candidate.environmentProfile === context.environmentProfile                                                                 |
| intent-profile-fit | 0.25   | token overlap of candidate.intentProfile with context intent tokens (goal + artifactRequirements), lowercased, non-alphanum split |
| evidence-backing   | 0.15   | min(1, evidence.length / 3)                                                                                                       |
| budget-fit         | 0.15   | 1 if a declared cost budget fits the intent budget, 0 if it exceeds, 0.5 if either side is undeclared                             |
| preference-fit     | 0.15   | 1 for the preferred organization, 0.5 for the preferred environment, 0 otherwise — present ONLY when personalization is active    |

4. total = Σ weight × score; ranking: total desc, then organizationId asc,
   then version desc (total order → byte-identical output for equal
   inputs);
5. result `OrganizationSelection`: `selected` = rank 1, `candidates` = all
   ranked (rationale `total score X.XX, rank i of n`), `explanation` = the
   selected candidate's `SelectionFactor[]` (factor/weight/detail).

Failure: no promoted candidates → `OrganizationResolutionError`.

## Personalization boundary (A5)

- Preferences live in a per-user store keyed by `userRef`
  (`UserPreferencePort.getPreference/setPreference`), never in the
  organization records used for shared scoring.
- The resolver fetches ONLY `getPreference(context.userRef)`. A user's
  preference can therefore never enter another user's resolution —
  isolation is structural, not incidental. Proven by test.
- `preference-fit` is applied only when a preference record for that exact
  userRef exists AND it carries at least one signal
  (preferredOrganizationId / preferredEnvironmentProfile). Otherwise the
  factor is absent and the selection equals the un-personalized baseline.
- `setPreference` is idempotent per `userRef`: re-setting identical signals
  returns the stored record unchanged (original `updatedAt`); only changed
  signals write.

## Failure semantics

Typed errors in `src/domain/errors.ts`:
`OrganizationImmutableError`, `OrganizationDraftConflictError`,
`OrganizationVersionMonotonicError`, `OrganizationVersionNotFoundError`,
`OrganizationPromotionError`, `OrganizationResolutionError`. No silent
fallbacks; a failed gate is an error, never a downgrade.

## Event order

register → (optional promote) → resolve. Resolve reads the catalog once and
the preference store once (only when `context.userRef` is present); scoring
is a pure function of (records, context, preference).

## Honest-evidence note

All stores are in-memory fixtures; scoring weights and factor formulas are
declared Wave 1 heuristics over record fields, deterministic and
explainable but NOT learned values. Selection evidence is fixture-grade
until real organization outcome evidence is attached (later waves).

## Wave 3 — promotion history read port

Spec-before-code record for the Wave 3 read-seams lane (ADR:
`docs/architecture/adr-wave3-read-seams.md`). Additive method on
`OrganizationRegistryService`: `listPromotionRecords()` — read-only.

- Lists the immutable `PromotionRecord`s the registry has granted, in store
  order ((organizationId asc, version asc) — deterministic); unpromoted
  drafts contribute nothing.
- Module-internal catalog granularity (like `listVersions`): the bounded
  query (filters + capped limit) lives at the consuming read seam
  (`@sporta/lab`'s `OrganizationCandidateReadPort` implementation), not
  here — the registry does not know about query limits.
- Read-only: no mutation surface; store clones on read so callers never
  alias registry state.
- Also exported additively: `candidateIdFor(organizationId, version)` —
  the canonical `<orgId>:<version>` candidate id convention, so the Lab
  read seam and evaluation derive identical ids (no second convention).
- `OrganizationPromotionHistoryPort` declares the method; the service
  implements it alongside the registry/catalog/promotion ports.

## Wave 4 — rejection/rollback decision path

Spec-before-code record for the Wave 4 lane (ADR:
`docs/architecture/adr-wave4-c6-host.md`, decision 3). Additive methods
on `OrganizationRegistryService` (declared on the new
`OrganizationDecisionPort`): `rejectCandidate(input)` and
`rollbackPromotion(input)` — append-only typed decision records
(PromotionRecord with decision "rejected" / "rolled-back") mirroring the
promotion-gates pattern.

- `rejectCandidate({ organizationId, version, evidence? })`:
  - unknown version → `OrganizationVersionNotFoundError`;
  - already rejected + identical effective evidence (input ∪ record
    evidence, deduped, input first) → the same record (idempotent);
  - already rejected + different effective evidence →
    `OrganizationImmutableError`;
  - candidate carries any promotion decision (promoted, or promoted and
    rolled back) → `OrganizationImmutableError` (rollback is the
    retraction path, never rejection);
  - gates (all must pass, else `OrganizationDecisionError` carrying the
    failed gate names): `version-registered`, `evidence-present`,
    `policy-defined` — exactly the promotion gates;
  - on success: a `PromotionRecord` (decision `rejected`, deterministic
    `promotionId` = `rejection:<orgId>:<version>`, `candidateId` =
    `<orgId>:<version>`, `decidedAt` = injected clock) stored as the
    entry's `rejection` record — the candidate is terminal (promote
    after reject is a typed immutability refusal; register a new version
    to try again).
- `rollbackPromotion({ organizationId, version, evidence? })`:
  - unknown version → `OrganizationVersionNotFoundError`;
  - already rolled back + identical effective evidence → the same record
    (idempotent); different → `OrganizationImmutableError`;
  - gates (else `OrganizationDecisionError`): `version-registered`,
    `prior-promotion` (a granted, non-retracted promotion of the SAME
    candidate — drafts and rejected candidates fail this gate),
    `evidence-present`, `policy-defined`;
  - on success: a `PromotionRecord` (decision `rolled-back`,
    deterministic `promotionId` = `rollback:<orgId>:<version>`) stored as
    the entry's `rollback` record, and the entry's `promoted` flag is
    RETRACTED — the version leaves the resolver's candidate set (only
    promoted versions are resolution candidates). The granted promotion
    record is kept: append-only history, never rewritten.
- Per-candidate decision ledger law: at most one rejection on a
  never-promoted draft, or one promotion followed by at most one
  rollback; decision records are immutable once granted; promote after
  reject or after rollback is a typed refusal (the escape hatch is the
  append-only registry itself: register a new version).
- `listPromotionRecords()` (Wave 3, additive behavior evolution): lists
  ALL decision records the registry has granted — promotions, rejections
  and rollbacks — in store order ((organizationId asc, version asc),
  grant order within one entry: promotion before its rollback);
  undecided drafts contribute nothing. The read-only and
  deterministic-order laws are unchanged.
- Decided drafts keep the registerDraft draft-conflict semantics for
  content changes (change content by registering a NEW version); the
  decision records themselves are immutable.
