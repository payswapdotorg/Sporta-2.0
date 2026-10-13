# sporta-marketplace

Submission, review, listing, entitlement and suspension state for approved
transform releases (P9).

Invariants that types cannot express (source: ADR + transform-marketplace
contract; lock invariants 26-29, 35):

- Only APPROVED/PUBLISHED releases are publicly discoverable/selectable;
  drafts are private and submission freezes the candidate digest (P9-07).
- Every first publication AND every material update (code/model/weights/
  dependency/permission/license/source/runtime/default behavior) creates a
  new immutable candidate and repeats review; v1 stays pinned and
  reproducible (P9-09).
- Automated checks plus human product/rights/security review are required;
  fixture evidence is labeled and never replaces human review (P9-08).
- Sporta owns approval state. GitHub/Hugging Face/blob providers store
  assets; they never decide what is approved (lock 28).
- Free and paid offerings pass equal gates; entitlement/charge retries are
  idempotent; the payment provider is never the entitlement authority
  (lock 29, P9-11).
- Suspension/withdrawal/revocation block new selection while preserving
  historical run records — history is never falsified (P9-10).
- A new repository commit or model reference never auto-publishes.
- Listing approval does not authorize every input source or output use;
  each invocation re-checks input rights, output use, tenant policy and
  component rights (P9-14/15).
- Similarity/appearance is only a quality signal or review trigger; it can
  never alone grant legal clearance (P9-16, lock 34).

## Wave 9 (Worker B) implementation notes

Additive-only behind the frozen surface (see SPEC.md for the
spec-before-code record). Public names appended through `contract.ts`
(287 lines, under the 300-line law); no frozen name was touched, moved
or renamed.

- Candidate lifecycle is an explicit typed transition table
  (`domain/lifecycle.ts`); DRAFT is private and digest-free, SUBMISSION
  freezes a REAL sha256 candidate digest once, and any behavioral
  change is a new candidate at a new version
  (`classifyCandidateMaterialChange` names the changed family).
- The automated check lane (`domain/checks.ts`) is an explicit registry:
  graph-validation and digest-integrity are `measured` (real validator
  run, real re-hash); license/SBOM/dependency/similarity evidence is
  `fixture`-labeled. Gate failures block advancement; similarity can
  only WARN (P9-16); the lane has no approval concept at all.
- Human review (`app/reviewService.ts`) requires all three roles
  (product/rights/security) for approval and refuses approval over a
  failed gate. Durable decisions are idempotent per
  (candidate digest, outcome). Post-publication outcomes route to the
  listing service (single owner of listing state).
- Listings (`app/listingService.ts`) pin `currentRelease.releaseDigest`
  to the approving decision's candidate digest (byte-equality asserted
  in the service); `versionHistory` is append-only (v1 stays
  byte-identical when v2 publishes); suspension writes the frozen
  `TransformSuspensionRecord`; withdrawal/supersession record additive
  state events (no silent state loss). Listing `policy` and
  `expectations` project from the reviewed manifest (PolicySet
  propagation).
- Entitlements (`app/entitlementService.ts`) share one gate path for
  free and paid offers (lock 29); paid grants authorize through the
  provider-neutral `SettlementPort` with a DERIVED idempotency key
  (never double-charged); refused settlement issues no entitlement;
  expiry is checked at admission; `usedRuns` counts admissions only.
- Admission (`app/feedLaunchAdmissionService.ts`) returns the frozen
  `TransformListingSelectionResult` with the deterministic refusal
  order listing-state -> suspension -> entitlement -> revocation ->
  expiry -> usage -> rights; a missing/malformed rights snapshot is the
  typed `rights-prerequisites-unsatisfied` refusal. The typed
  `TransformLaunchDisclosure` (P9-12) carries publisher, version,
  terms/price, rights prerequisites, dependencies (fail-closed on
  unresolvable manifests), outputs, limitations, cost/latency with
  evidence grade, review date, and the fixed legal notice.
- Adapters: REAL `Sha256MarketplaceHash` (node:crypto); clearly-labeled
  FIXTURE `FixtureSettlementAdapter` (idempotent per key, one charge,
  attempts counted), `FixtureManifestSource`, and the in-memory stores.
  A real payment provider and the product manifest store plug the same
  ports later without contract changes.
