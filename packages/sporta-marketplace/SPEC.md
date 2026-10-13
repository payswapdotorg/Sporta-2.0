# sporta-marketplace — SPEC (P9 Wave 9, Worker B)

Spec-before-code record for **W9B-1..W9B-4**: candidate submission with
frozen digests, the automated-check lane, human review decisions, approved
immutable listings and version history, suspension/withdrawal/supersession,
free/paid offers with idempotent provider-neutral settlement, entitlement
lifecycle, and fail-closed feed-launch admission with typed launch
disclosure. Authority order:
`docs/work-orders/transform-marketplace-work-orders.md` ->
`docs/architecture/adr-transform-studio-marketplace-and-application-environments.md` ->
`docs/contracts/transform-marketplace.md` ->
`docs/testing/transform-marketplace-acceptance.md` (P9-07..P9-17).

The repository is the source of truth; this file states behavior, ownership,
invariants and failure semantics BEFORE implementation. Scope law: only
`packages/sporta-marketplace/**`. The TL-frozen contract names in
`src/contract.ts` stay untouched; everything below appends public names
additively behind them (surface check stays green).

## Layer law

`domain` is pure (no `node:` imports, no IO, no timers, no ambient time);
`app` composes domain types/ports plus cross-module public contracts
(`@sporta/contracts`, `@sporta/transforms`, `@sporta/artifacts`,
`@sporta/policy` — the architecture-policy declared requires) and imports NO
adapter module; `adapters` own all real IO (`node:crypto`, settlement
side-effects) and every in-memory fixture store. Wiring happens at the
composition root (tests/product), never inside the layers. Timestamps come
only from an injected clock; digests only from an injected hash port.

## W9B-1 — Submission, automated checks, human review (P9-07/08/13)

### Drafts and submission

- `TransformCandidateRecord` (additive) wraps the frozen
  `TransformReleaseCandidate` plus lifecycle state. DRAFT records are
  private: no listing can exist for them, no public query resolves them,
  and `publishApprovedRelease` refuses anything not APPROVED.
- `submitCandidate` freezes the candidate digest ONCE:
  `sha256:stable-stringify(candidate content)` computed through the
  injected hash port. DRAFT -> SUBMITTED. After submission the record is
  IMMUTABLE: any mutation attempt is the typed
  `TransformCandidateImmutableError`. A behavioral change creates a NEW
  candidate at a NEW version (P9-09).
- Resubmitting a byte-identical candidate for the same (pipeline, version)
  is idempotent (returns the same record, same digest). Resubmitting a
  DIFFERENT digest for an already-submitted version is the typed
  `TransformCandidateImmutableError` — the changed candidate must bump the
  version and repeat review.
- `classifyCandidateMaterialChange(prior, next)` is an explicit record
  comparison (the compute-fallback classification law: total, typed, never
  ambient): families `manifest | code | model | dependency | runtime |
  source | license | sbom`. Any digest/attestation difference is material;
  the classifier names which families changed for reviewer attention.
  Identical candidates classify as `[]`.

### Automated check lane

`CheckRunnerPort` executes DECLARED checks over the candidate. The check
registry is explicit and versioned (never ambient):

| checkId                   | role   | evidence basis | pass condition                                          |
| ------------------------- | ------ | -------------- | ------------------------------------------------------- |
| `graph-validation`        | gate   | measured       | manifest (via `TransformManifestReadPort`) passes the w9a `validateTransformPipelineManifest`; unresolvable manifest = fail |
| `digest-integrity`        | gate   | measured       | recomputed candidate digest (injected hash port) equals the frozen digest |
| `license-presence`        | gate   | fixture        | non-empty `licensing.license` on the manifest AND every pinned dependency declares a non-empty license |
| `sbom-presence`           | gate   | fixture        | candidate `attestations` contain a `kind: "sbom"` entry |
| `unsafe-dependency-signal`| gate   | fixture        | every pinned dependency resolves in the injected dependency-signal source: `unsafe` -> fail, `unknown` -> **warn** (absence of signal is not safety), `clean` -> pass |
| `similarity-signal`       | signal | fixture        | injected similarity signal present -> **warn** (review trigger only); absent -> pass |

- Outcomes are the frozen `pass | fail | warn` with per-check
  `evidenceKind: measured | fixture` — computed evidence (hash recompute,
  real validator run) is `measured`; declared/attested/fixture-sourced
  evidence is `fixture`. Honest labels, always.
- Role law: `gate` checks block (a `fail` refuses advancement to
  HUMAN_REVIEW — typed `TransformCheckLaneError`
  `automated-gate-failed`); `signal` checks can only WARN. The similarity
  check structurally CANNOT approve anything: the automated lane has no
  approval concept at all — approval exists ONLY as a human
  `TransformReviewDecision` with outcome `approved` (P9-16).

### Human review

`recordReviewDecision` writes the durable frozen
`TransformReviewDecision`:

- Candidate must be SUBMITTED / AUTOMATED_CHECKS / HUMAN_REVIEW (never
  DRAFT, terminal or PUBLISHED).
- `approved` requires: (a) the automated check lane on record with zero
  failed gate checks, (b) ALL THREE human roles signed off — `product`,
  `rights`, `security` — with reviewer identity + timestamp (fixture
  reviewers in tests; the RECORD shape is what is real). Violations are
  typed refusals (`automated-checks-failed`, `missing-reviewer-role`).
- `rejected` / `changes-requested` require at least one human reviewer and
  move the candidate to the corresponding terminal state; publication is
  then refused (P9-10).
- Outcomes `suspended` / `withdrawn` route to the listing service (the
  single owner of post-publication state) — recorded as the typed
  `TransformReviewError` refusal `outcome-routes-to-listing-service`.
- Every decision carries the automated check evidence verbatim and the
  policy version; `decisionId` is derived deterministically
  (sha256 over candidate digest + outcome + reviewer fingerprints) so
  durable re-records are idempotent.

## W9B-2 — Listings, immutable versions, suspension (P9-09/10)

- `publishApprovedRelease` publishes an APPROVED candidate as the frozen
  `TransformListing`: `currentRelease.releaseDigest` is pinned to the
  EXACT approving decision's `candidateDigest` (byte-equality asserted
  inside the service — a mismatch is the typed
  `TransformReleaseDigestMismatchError`, never a silent re-pin).
- `versionHistory` is APPEND-ONLY: publishing v2 appends the v1 entry
  untouched and moves `currentRelease` to v2; the v1 entry stays
  byte-identical and its digest stays resolvable (v1 remains reproducible,
  P9-09). Publishing a version <= the current version is the typed
  `TransformVersionRegressionError`. Publishing without an APPROVED
  candidate is the typed `TransformListingError` (`candidate-not-approved`)
  — the unreviewed-update negative lane.
- Listing state machine (explicit, typed): `PUBLISHED -> SUSPENDED |
  WITHDRAWN | SUPERSEDED`, one-way in this slice (reactivation is a TL
  seam). `suspendListing` writes the frozen `TransformSuspensionRecord`
  (effect `block-new-runs`) and sets status `SUSPENDED`; `withdrawListing`
  and `supersedeListing` are peer transitions. History (versionHistory,
  prior suspension records, decisions) is never mutated or dropped.

## W9B-3 — Offers, entitlements, idempotent settlement (P9-11/12)

- Free and paid offers share the SAME gates: gates live at
  review/publication, never at the offer. `TransformOfferTerms` differs
  only in price/settlement fields; tests assert identical refusal behavior
  for unreviewed free and paid pipelines (lock 29).
- `SettlementPort` (`src/domain/paymentPort.ts`) is provider-neutral:
  `authorize(request)` keyed by an idempotency key. The first slice ships
  `FixtureSettlementAdapter` (adapters, clearly labeled FIXTURE,
  deterministic): it records every authorize attempt per key and settles
  at most ONCE per key — two identical authorize calls produce ONE
  settlement record with `attempts: 2` and one charge. The payment
  provider is NEVER the entitlement authority; entitlement state is
  marketplace-owned.
- `grantEntitlement`: requires a PUBLISHED listing (no new entitlements
  for suspended/withdrawn listings). Free offers skip settlement. Paid
  offers derive the idempotency key deterministically
  (sha256 over principal + pipeline + version + releaseDigest + offer
  fingerprint) so issuance retries reuse the SAME key and never
  double-charge. A refused settlement yields NO entitlement (typed
  `TransformSettlementRefusedError`). Idempotent re-grant returns the
  same entitlement record.
- Entitlement lifecycle: `active | revoked | expired`. `revokeEntitlement`
  sets `revokedAt`. Expiry is checked AT ADMISSION (clock-injected) and
  stored honestly (`status: "expired"`). `usedRuns` increments ONLY on
  admitted selections — refusals never consume runs; the counter never
  exceeds `maxRuns`.

## W9B-4 — Fail-closed feed-launch admission (P9-14..17)

`selectForLaunch` returns the frozen `TransformListingSelectionResult`.
Check order is deterministic and total:

1. listing missing, WITHDRAWN or SUPERSEDED -> `listing-not-published`
2. listing SUSPENDED -> `suspended`
3. no entitlement for (principal, an approved release digest of the
   listing) -> `no-entitlement` (an entitlement pinned to an unreviewed
   digest never matches: unreviewed updates are not selectable)
4. entitlement revoked -> `entitlement-revoked`
5. entitlement expired (clock) -> `entitlement-expired`
6. `usedRuns >= maxRuns` (when bounded) -> `usage-limit-exhausted`
7. rights snapshot missing, malformed, or not covering every
   `listing.rightsPrerequisites` -> `rights-prerequisites-unsatisfied`

Rights law (P9-14/15): a missing/invalid snapshot is a TYPED refusal with
reason `rights-prerequisites-unsatisfied` — never "safe because it looks
different". The caller supplies the `TransformRightsSnapshot`; admission
performs a total, explicit check of every prerequisite. A checkbox-shaped
claim cannot bypass the check: the snapshot must list every prerequisite
id as satisfied.

On the ONLY success path the admitted digest is the entitlement's pinned
approved digest — byte-identical from decision -> listing -> entitlement
-> admission (tests assert byte-equality end to end) — and `usedRuns`
increments once.

`TransformLaunchDisclosure` (additive) carries what the launch UI must
show (P9-12): publisher, approved version + release digest, terms/price,
rights prerequisites, dependencies (read through the manifest port —
fail-closed: an unresolvable manifest refuses disclosure rather than
hiding dependencies), outputs, limitations, cost/latency expectations with
their evidence grade, review date, and a fixed legal notice that visual
similarity NEVER implies clearance (lock 34). Disclosure never claims
copyright safety.

## Failure semantics (event order)

| condition                              | outcome                                                |
| -------------------------------------- | ------------------------------------------------------ |
| publish non-APPROVED candidate         | typed `TransformListingError` `candidate-not-approved`  |
| decision digest != frozen candidate digest | typed `TransformReleaseDigestMismatchError`        |
| gate check failed                      | typed `TransformCheckLaneError` `automated-gate-failed` |
| approve with missing role              | typed `TransformReviewError` `missing-reviewer-role`    |
| approve with failed gate               | typed `TransformReviewError` `automated-checks-failed`  |
| mutate a SUBMITTED+ candidate          | typed `TransformCandidateImmutableError`              |
| same-version different-digest submit   | typed `TransformCandidateImmutableError`              |
| refused settlement                     | typed `TransformSettlementRefusedError`, no entitlement |
| suspended/withdrawn/superseded listing | typed admission refusal (frozen reason), history kept |
| unresolvable manifest at disclosure    | typed `TransformManifestUnresolvedError`              |
| unknown entitlement at admission       | typed refusal `no-entitlement`                        |

## Honest evidence

- REAL: sha256 digest freezing/recomputation (node:crypto), the w9a graph
  validator invoked over real manifests, deterministic state machines,
  idempotency and byte-equality assertions in tests.
- FIXTURE (labeled): `FixtureSettlementAdapter` (records attempts, one
  charge per key), in-memory stores, the dependency-signal source, the
  similarity signal source, reviewers in tests, `FixedClock`.

## Limits (first slice, declared)

- One listing per pipeline (currentRelease + append-only versionHistory);
  per-version listing records are a TL seam if product needs them.
- Listing-state reactivation (unsuspend) is deferred; one-way transitions
  only.
- No real payment provider; the fixture adapter proves the port law
  (idempotency, single settlement per key), never real money.
- The manifest read port is a declared seam (the TL serializes the
  product-side manifest store); tests inject a fixture source.
