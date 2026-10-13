# sporta-marketplace — SPEC (P9 Wave 9, Worker B)

Spec-before-code record for **W9B-1..W9B-4**: candidate submission with
frozen digests, the automated check lane, human review, approved
immutable listings with version history, suspension/withdrawal/
supersession, free/paid offers behind a provider-neutral settlement
port, entitlements with idempotent chargeable-run authorization, and
fail-closed feed-launch admission with a typed launch disclosure.
Authority order:
`docs/work-orders/transform-marketplace-work-orders.md` ->
`docs/architecture/adr-transform-studio-marketplace-and-application-environments.md` ->
`docs/contracts/transform-marketplace.md` ->
`docs/testing/transform-marketplace-acceptance.md` (P9-07..P9-17).

The repository is the source of truth; this file states behavior,
ownership, invariants and failure semantics BEFORE implementation.
Scope law: only `packages/sporta-marketplace/**`. The TL-frozen
contract names in `src/contract.ts` stay untouched; everything below
appends public names additively behind them.

## Scope

- W9B-1 `src/domain/lifecycle.ts`, `src/domain/checks.ts`,
  `src/domain/review.ts` + `src/app/publicationService.ts` — draft
  privacy, submission digest freeze (P9-07), declared automated checks
  with typed pass/fail/warn outcomes and evidence kinds (P9-08,
  P9-13), human product/rights/security review records and the durable
  `TransformReviewDecision` (P9-08).
- W9B-2 `src/domain/materiality.ts` + `src/app/listingService.ts` —
  approved immutable releases, version accumulation with v1 pinned and
  reproducible (P9-09), suspension/withdrawal/supersession blocking
  new selection while preserving history (P9-10).
- W9B-3 `src/domain/paymentPort.ts` + `src/app/entitlementService.ts`
  — free/paid offers behind a provider-neutral `SettlementPort` with
  idempotency keys, a clearly-labeled FIXTURE settlement adapter, and
  the entitlement lifecycle active/revoked/expired with honest
  `usedRuns` counters and expiry checked at admission (P9-11).
- W9B-4 `src/domain/selection.ts`, `src/domain/disclosure.ts` +
  `src/app/listingSelectionService.ts` — fail-closed admission
  returning the frozen `TransformListingSelectionResult` (P9-14) and
  the typed `TransformLaunchDisclosure` for the launch UI (P9-12,
  P9-17). Similarity is a review trigger only (P9-16).

Layer law (the w9a precedent): `domain` is pure (no `node:` imports,
no IO, no timers); `app` composes domain logic plus cross-module
public contracts only; `adapters` own all real IO (`node:crypto`) and
every FIXTURE implementation. Wiring happens at the composition root
(tests/product), never inside the layers. Cross-module imports stay
on public entrypoints of the four declared dependencies
(`sporta-contracts`, `sporta-transforms`, `sporta-artifacts`,
`sporta-policy`); no other module is imported. In-memory record
ledgers inside app services are fixture-grade persistence, honestly
labeled; a real store plugs in behind the same service constructors.

## W9B-1 — Submission lifecycle law (P9-07)

Candidate states are the frozen `TransformCandidateLifecycleState`.
The transition table is explicit, total and STRICT (no reverse edges):

| from             | to                    | trigger                                   |
| ---------------- | --------------------- | ----------------------------------------- |
| DRAFT            | SUBMITTED             | `submitDraft` freezes the candidate digest |
| SUBMITTED        | AUTOMATED_CHECKS      | `runAutomatedChecks` records the report    |
| AUTOMATED_CHECKS | HUMAN_REVIEW          | clean report (zero `fail` outcomes)        |
| AUTOMATED_CHECKS | CHANGES_REQUESTED     | human decision `changes-requested`         |
| SUBMITTED        | CHANGES_REQUESTED     | human decision `changes-requested`         |
| HUMAN_REVIEW     | APPROVED              | human decision `approved` (gated, below)   |
| HUMAN_REVIEW     | CHANGES_REQUESTED     | human decision `changes-requested`         |
| HUMAN_REVIEW     | REJECTED              | human decision `rejected`                  |
| APPROVED         | PUBLISHED             | `publishReviewedRelease` (listing service) |

CHANGES_REQUESTED, REJECTED and PUBLISHED are terminal for the
candidate record. Every other transition is a typed
`MarketplaceSubmissionError` (`state-transition-illegal`), never a
silent overwrite.

**Draft privacy (P9-07):** a DRAFT is private — it produces no
listing, appears in no public query, and is never selectable. Only
`readDraft` (by draft id) observes it.

**Digest freeze (P9-07):** `submitDraft` builds the immutable
`TransformReleaseCandidate` and freezes
`candidateDigest = sha256(stableStringify(candidate))` — every field
including `candidateId`, `submittedAt` and `submittedBy`. The frozen
submission record is stored once; there is NO update path. A later
edit means a NEW draft with a NEW `candidateId` and a different
digest (P9-09). Re-submitting an already-submitted draft is a typed
error. The `digest-integrity` automated check re-computes the digest
over the STORED record and fails closed on any drift.

## W9B-1 — Automated check lane (P9-08, P9-13)

`TransformCheckRunnerPort.runChecks(candidate, manifest)` produces
typed outcomes `{ checkId, outcome: pass|fail|warn, evidenceKind:
measured|fixture, detail }`. The declared checks, in deterministic
order:

| checkId                | semantics (fail-closed)                                                                 | evidenceKind |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------ |
| `graph-validation`     | `validateTransformPipelineManifest` (the sporta-transforms public seam) PLUS the sandbox law: any node with `hostSecretAccess !== false` fails; manifest unresolvable fails | measured |
| `digest-integrity`     | every `contentHashes` entry and `manifestDigest` is `sha256:<64 hex>`; recomputed digest of the stored candidate equals the frozen `candidateDigest` | measured |
| `license-presence`     | manifest `licensing.license` non-empty AND every `pinnedDependencies[].license` non-empty; manifest unresolvable fails | measured |
| `sbom-presence`        | candidate `attestations` carry at least one entry with kind `sbom`                        | measured     |
| `unsafe-dependency-signal` | every manifest `pinnedDependencies` entry is queried at the injected dependency-signal source; any flagged dependency fails | fixture |
| `similarity-signal`    | the injected similarity source scores the candidate; score >= 0.85 is `warn` (a review trigger), below is `pass` — NEVER an approval | fixture |

Declared-check law: a check never APPROVES anything — approval is a
human decision only. Structural checks execute REAL logic over the
actual records (`measured`); signal-fed checks carry the signal
source's honesty grade (`fixture` until a real scanner/scorecer
plugs the same port). An unresolvable manifest makes every
manifest-dependent check FAIL (never silently skip). A failed check
report keeps the submission in AUTOMATED_CHECKS; only a clean report
advances to HUMAN_REVIEW.

## W9B-1 — Human review law (P9-08)

The required human roles are `product`, `rights`, `security` — each
signed exactly once with reviewer identity and timestamp (fixture
reviewers are fine in tests; the RECORD shape is what is real). The
durable `TransformReviewDecision` (frozen type) pins: the exact
`candidateDigest`, the automated check triples (checkId/outcome/
evidenceKind — detail stripped), the human signoffs, `policyVersion`,
`decidedAt` and rationale.

Decision derivation is fail-closed and typed:

- `approved` requires state HUMAN_REVIEW, ALL three roles present
  (no duplicates), and a non-empty `policyVersion`. Otherwise a typed
  `MarketplaceReviewError` — approval is impossible, not defaulted.
- `changes-requested` and `rejected` require at least one human
  signoff and are terminal for the candidate; both PREVENT
  publication (publishing one is a typed `MarketplaceListingError`).
- Review gates are a pure function of the candidate:
  `requiredReviewGates(candidate)` returns the automated check ids +
  human roles. The offer/price is NOT an input (offers attach to the
  listing AFTER approval) — free and paid releases share equal gates
  (lock 29, P9-11), asserted by tests.

## W9B-2 — Listings, immutable versions, updates (P9-09, P9-10)

`publishReviewedRelease(decision, listingInput)` is the ONLY path
from a decision to a listing. It verifies — against the publication
service's durable records — that a submission exists whose frozen
digest equals `decision.candidateDigest`, carries an approved
decision with the same `decisionId`, and is in state APPROVED. A
fabricated or stale decision is a typed error; the release digest
byte-equality chain decision -> candidate -> listing -> entitlement
-> admission is asserted in tests.

- First publication creates the listing with `currentRelease`
  pinned to the exact approved digest (`reviewedAt` = decision time)
  and `versionHistory: [v1]`.
- A later approved candidate publishes v2: `currentRelease` moves to
  v2; `versionHistory` APPENDS; v1 stays listed for provenance with
  its digest unchanged and reproducible. Publishing never mutates a
  historical entry.
- Version immutability: publishing the same `(version, digest)` pair
  twice is a typed `duplicate-release` error; publishing a DIFFERENT
  digest under an already-published version is a typed
  `version-conflict` error. Candidate state advances APPROVED ->
  PUBLISHED exactly once.
- An unreviewed update is NOT selectable: without an approved
  decision for the new digest, `publishReviewedRelease` refuses
  (typed error), no listing resolves to it, no entitlement can be
  granted for it (entitlements are granted against PUBLISHED
  listings only), and an entitlement pinning any other digest than
  `currentRelease` admits as `no-entitlement`.
- Material change detection (P9-09): at submission, when an approved
  candidate already exists for the pipeline, `detectMaterialChange`
  records a typed report over manifest digest, per-kind content
  hashes, attestations and (when resolvable) pinned dependency
  licenses, permissions and node digests. Material or not, EVERY new
  candidate repeats the full review — the report is evidence, never
  a gate bypass.

Listing states are the frozen `TransformListingState`; transitions
are one-way (ADR): `PUBLISHED -> SUSPENDED | WITHDRAWN | SUPERSEDED`,
all terminal in this slice (no reinstate — declared limit).

- `suspendListing` creates the frozen `TransformSuspensionRecord`
  (`effect: "block-new-runs"`) plus an additive
  `TransformListingActionRecord`; new selection is refused with the
  typed reason `suspended`.
- `withdrawListing` / `supersedeListing` set the terminal status;
  new selection is refused with `listing-not-published`.
- History is never falsified: version history, suspension records,
  action records and prior entitlements stay readable after every
  state change; only NEW selection stops (P9-10).
- Publishing a new version requires listing status PUBLISHED
  (suspended/withdrawn/superseded listings do not resurrect).

## W9B-3 — Offers, settlement, entitlements (P9-11)

Offers are the frozen `TransformOfferTerms` attached at listing
creation — after review, so gates cannot depend on price. The
provider-neutral seam is `src/domain/paymentPort.ts`:

```text
SettlementPort.authorize({ idempotencyKey, principal, offerRef,
                           amount, requestedAt }) -> SettlementRecord
SettlementRecord = { settlementId, idempotencyKey, status:
settled|refused, amount, settledAt, duplicate, attempts, detail }
```

The settlement adapter is a provider, never the entitlement
authority. The first slice ships `FixtureSettlementAdapter`
(adapters layer, clearly labeled FIXTURE): deterministic, keyed by
idempotency key — a second identical `authorize` returns the SAME
settlement with `duplicate: true` and an incremented `attempts`
counter; the ledger holds ONE record; an optional fixture refusal
predicate drives the refusal lane.

Entitlement issuance (`grantEntitlement`):

1. The listing must exist and be PUBLISHED (typed error otherwise).
2. The idempotency key is derived from
   `{principal, pipelineId, version, releaseDigest, purchaseRef}` —
   identical grant inputs derive the identical key, so retries never
   double-charge (P9-11).
3. Free offers NEVER settle (`settlementRef: null`, adapter ledger
   untouched). Paid offers authorize first; a refused settlement is
   a typed `MarketplaceEntitlementError` and NO entitlement exists.
4. Issuance is idempotent: an existing ACTIVE entitlement for the
   same principal+release is returned (the retry re-authorizes under
   the same key and dedupes in the adapter).
5. Usage limits copy the offer (`maxRuns`, `expiresAt`) with honest
   `usedRuns` starting at 0.

Entitlement lifecycle: `active -> revoked` (typed revocation with
`revokedAt`), `active -> expired` (observed at admission when the
injected clock passes `expiresAt` — recorded, not ambient).
`recordUsage(entitlementId, runRef)` is idempotent per runRef —
retried admissions never double-count; `usedRuns >= maxRuns`
(maxRuns non-null) admits as `usage-limit-exhausted`.

## W9B-4 — Fail-closed feed-launch admission (P9-14..P9-17)

`selectForLaunch({listingId, principal, rightsSnapshot, runRef})`
returns EXACTLY the frozen `TransformListingSelectionResult`.
The check order is deterministic and SPEC'd:

| #   | condition                                            | typed refusal                        |
| --- | ---------------------------------------------------- | ------------------------------------ |
| 1   | listing unknown                                       | `listing-not-published`              |
| 2   | listing SUSPENDED (status or live suspension record)  | `suspended`                          |
| 3   | listing WITHDRAWN / SUPERSEDED                        | `listing-not-published`              |
| 4   | no entitlement pinning `currentRelease` digest+version | `no-entitlement`                     |
| 5   | entitlement status `revoked`                          | `entitlement-revoked`                |
| 6   | entitlement `expiresAt` passed                        | `entitlement-expired`                |
| 7   | `usedRuns >= maxRuns`                                 | `usage-limit-exhausted`              |
| 8   | rights snapshot missing or malformed                  | `rights-prerequisites-unsatisfied`   |
| 9   | any prerequisite not authorized / required usage not in `authorizedUsages` / prohibited usage required | `rights-prerequisites-unsatisfied` |

A MISSING or malformed rights snapshot is a typed refusal — never
"safe because it looks different" (P9-14). The rights snapshot
record is typed (`TransformRightsSnapshot`, additive public name):
per-prerequisite satisfaction evidence plus the usage classes the
source rights authorize. Prerequisites are tracked distinctly
(P9-15): input footage authorization, music/graphics, model/dataset
licenses and output use are separate listing prerequisites; no
boolean checkbox can bypass the typed record. Admission on success
records usage idempotently (per runRef) and returns the pinned
`releaseDigest` (byte-equal to the approved decision's candidate
digest).

**Similarity law (P9-16):** the `similarity-signal` check may WARN
(triggering human rights review); it can never approve, never clear,
never bypass. A warned candidate still requires all three human
roles.

**Disclosure (P9-12, P9-17):** `discloseForLaunch(listingId)`
builds the additive typed `TransformLaunchDisclosure`: publisher,
approvedVersion, releaseDigest, reviewedAt, offer terms/price,
rightsPrerequisites, dependencies (from the pinned manifest;
unresolvable manifests degrade honestly with an explicit limitation
entry), expectedOutputs, limitations, cost/latency expectations,
evidence grade (measured-vs-fixture labeled) and a provenance note
pointing to the source rights scope and pipeline release WITHOUT
guaranteeing legality for every downstream use.

## Failure semantics (event order)

| condition                            | outcome                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| unknown draft / double submission    | typed `MarketplaceSubmissionError`, nothing frozen twice       |
| illegal lifecycle transition         | typed `MarketplaceSubmissionError` (`state-transition-illegal`) |
| manifest unresolvable at checks      | manifest-dependent checks FAIL (fail-closed, never skipped)    |
| approval without full human roles    | typed `MarketplaceReviewError`, no decision recorded           |
| publish non-approved decision        | typed `MarketplaceListingError`, no listing/currentRelease     |
| publish duplicate/conflicting version| typed `MarketplaceListingError`, history untouched             |
| settlement refused                   | typed `MarketplaceEntitlementError`, NO entitlement            |
| settlement retried (same key)        | ONE settlement record, `duplicate: true`, attempts++           |
| missing rights snapshot at launch    | typed refusal `rights-prerequisites-unsatisfied`               |
| suspended listing at launch          | typed refusal `suspended`; history preserved                   |

## Honest evidence

- REAL (typed logic + test-asserted): lifecycle transitions, digest
  freeze and byte-equality chain, fail-closed check outcomes over
  records, review gating, version immutability, suspension/withdrawal
  semantics, idempotent settlement accounting, usage counters,
  admission refusal table, disclosure assembly.
- FIXTURE (labeled in code, records and tests): the settlement
  adapter, the dependency/similarity signal sources, reviewer
  identities in tests, in-memory ledgers. No fabricated provider
  numbers; fixture evidence grades are never reported as measured.

## Limits (first slice, declared)

- In-memory record ledgers (fixture-grade persistence); a real store
  plugs in behind the same service constructors.
- No reinstate from SUSPENDED/WITHDRAWN/SUPERSEDED (one-way ADR
  lifecycle); a successor listing is the recovery path.
- Re-purchase after revocation reuses the (principal, release,
  purchaseRef) key; distinct repurchase keys are a purchaseRef
  change, charged as a new settlement.
- Entitlements pin a release digest; when v2 publishes, v1
  entitlements no longer admit new runs (re-entitlement required) —
  honest pinning, never silent upgrade (P9-24).
- The transform manifest read port (`TransformManifestReadPort`) is
  declared here and fixture-wired in tests; the TL serializes the
  real seam to the transform store.
