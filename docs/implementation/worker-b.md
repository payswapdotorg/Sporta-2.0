# Worker B Implementation Report

Status: WAVE 1 IMPLEMENTED (branch wave1/worker-b, code-complete commit 3cda230; the documentation commit on top adds this report)

## Ownership

Artifact Fabric, Editor Broker/adapters, Sports World Model seams and Compute Broker/provider adapters.

## WORK ITEMS

- B1 Artifact graph/revisions/manifests — DONE (fixture-grade, tested):
  `ArtifactGraphService` (recordArtifact idempotent per artifactId,
  commitRevision idempotent per revisionId with first-write-wins retries,
  readRevision, lineage in chain order, injectable clock ledger), pure
  domain lineage semantics (single ordered chain: absent parent only for
  the first revision, parent must exist / belong to the same artifact /
  have no child yet), typed errors, in-memory content-addressed blob
  store with read-time integrity verification.
- B2 Round-trip import/export/EditDelta — DONE (fixture-grade, tested):
  reconcile of a KNOWN (adapter-declared, level >= 2) project format
  commits a NEW revision whose parent is the session's current revision,
  emits an `EditDelta` of typed `EditOperation`s (canonical serialization
  + lossless parse), keeps every prior revision readable, and grows the
  chain across multiple saves (r1 -> r2 -> r3); UNKNOWN formats import as
  NEW opaque artifacts (`editability: "opaque"`, own first revision,
  empty operations) and never touch the source lineage.
- B3 Editor Broker — DONE (fixture-grade, tested): deterministic and
  explainable `resolveEditor` (integration-level gating, fail-closed
  license classification, eligible user preference first, highest-level +
  ascending-id tie-break, typed refusal when nothing is eligible);
  `openSession` with rights verification ("edit" usage required), revision
  existence via the injected ArtifactGraphPort, adapter registration
  check, checkpointed session record, idempotency per editorSessionId;
  `reconcileSession` idempotent per (session, changedProjectHash) with
  sha-256-derived deterministic ids as defense in depth.
- B4 editor adapters — DONE (fixture-grade): `KdenliveFixtureAdapter`
  (known "kdenlive" project format, integration level 2) and
  `MysteryAppFixtureAdapter` (export-only level 1, no known formats)
  proving both reconcile paths; `InMemoryEditorSessionStore`.
- B5 Sports World seams — DONE (fixture-grade, tested):
  `WorldModelService.ingestObservations` all-or-nothing batch validation,
  provenance gate (only "authorized-source"/"observation" enter
  production truth), idempotency per observationId (deterministic derived
  ids), snapshot hash over sorted payload hashes (pure domain function),
  uncertainty carried per observation, per-observation provenance ledger,
  established-policy conflict refusal, `readSnapshot` null for unknown
  ids.
- B6 provider-neutral compute/fallback — DONE (fixture-grade, tested):
  pure job state machine (queued -> running -> succeeded|failed|refused|
  cancelled, illegal transitions typed), `ComputeBrokerService.quote`
  from EVERY provider with refusals visible, `submit` idempotent per
  jobId with policy checked BEFORE submission (usage class
  `compute:<kind>`; denied jobs are born refused and never reach a
  provider), `poll` with typed unknown-job error, per-job state-history
  evidence; `LocalEchoComputeProvider` (deterministic echo execution) and
  `RefusingComputeProvider` (always provider-unavailable) as peer
  providers — refusals are never converted to failures or successes.

## CHANGED FILES

All inside the owned boundary `packages/sporta-{artifacts,editors,world,compute}`
plus `docs/implementation/worker-b.md` (this report). No file outside
ownership was touched. Per package (same layout in all four):

- `SPEC.md` (new — spec-before-code, committed before implementation)
- `src/domain/{errors,ports,lineage|operations|resolution|reconcile|snapshot|stateMachine|policy}.ts`
- `src/app/{ArtifactGraphService|EditorBrokerService|WorldModelService|ComputeBrokerService}.ts`
- `src/adapters/*` (in-memory stores, blob store, fixture editors/providers, sha-256 helpers, Fixed/System clocks)
- `src/contract.ts` (single public entrypoint; frozen v1 export names preserved, declarations moved to domain and re-exported — entrypoint-only convention already established by sporta-contracts in Wave 0)
- `src/contract.example.ts` (extended, compile-checked)
- `CONTRACT.md` (Wave 1 implementation notes appended)
- `tsconfig.json` (added `"types": ["node"]` for adapters that use node:crypto; editors additionally declares the artifacts project reference it already depended on)
- `test/*.test.ts` (new; node:test + node:assert/strict)

Commits on wave1/worker-b (base c9a90ac): 49bad60 (SPECs), 100fbfd
(artifacts), 5893ea6 (editors), 99daff8 + ff05a04 (world + lint fix),
86f8d89 (compute + lint fix), 3cda230 (oxfmt pass).

## TESTS

Location: `packages/<pkg>/test/*.test.ts`; runner: `pnpm exec tsx --test`
(zero new dependencies — the repo's existing tsx devDependency, per the
Wave 0 worker test law). node:test + node:assert/strict, no network,
deterministic (FixedClock, sha-256 hashes).

- `packages/sporta-artifacts/test/artifacts.test.ts` — 14 tests
- `packages/sporta-editors/test/broker.test.ts` — 14 tests
- `packages/sporta-editors/test/roundtrip.integration.test.ts` — 2 tests (real cross-package wiring against @sporta/artifacts)
- `packages/sporta-world/test/world.test.ts` — 9 tests
- `packages/sporta-compute/test/compute.test.ts` — 12 tests

Total: 51 tests, 51 pass, 0 fail (single combined run).

Required-coverage map: commitRevision idempotency (artifacts #3), bad
parent (artifacts #5–#8), lineage order over 3 revisions (artifacts #9),
blob integrity on corrupted read (artifacts #13, typed
ArtifactIntegrityError, no silent pass); resolveEditor level + licensing +
preference with rationale (editors #1–#6), openSession edit-rights
refusal (editors #7), known-format reconcile new revision with parent =
checkpoint + history preserved (editors #11 + both integration tests),
unknown-format opaque import understood:false + history preserved
(editors #13 + integration #2); world idempotency (#1), non-authorized
provenance refusal with no partial ingest (#2), uncertainty + provenance
carry (#4), readSnapshot null (#6); compute visible refusal at quote
(#1), submit idempotency (#3), policy-denied before submission (#5),
happy path queued->running->succeeded with history evidence (#2), illegal
transition rejection (#11).

## REAL EVIDENCE

All commands run from /home/z/sporta-2.0-b on branch wave1/worker-b:

1. `node scripts/architecture/architecture-check.mjs check` ->
   `architecture: OK / violations: 0 / baseline: 0 / new: 0`
2. `pnpm exec tsc -b packages/sporta-policy packages/sporta-contracts
   packages/sporta-artifacts packages/sporta-editors
   packages/sporta-world packages/sporta-compute` -> exit 0, clean (scoped
   protocol per PROJECT-STATE: full-repo typecheck is OOM-killed on this
   4 GB sandbox — an environment limitation, not a repo error).
3. `pnpm exec tsx --test packages/sporta-artifacts/test/*.test.ts
   packages/sporta-editors/test/*.test.ts
   packages/sporta-world/test/*.test.ts
   packages/sporta-compute/test/*.test.ts` ->
   `tests 51 / pass 51 / fail 0 / cancelled 0 / skipped 0`.
4. `pnpm lint` -> `Found 70 warnings and 0 errors` — identical to the
   pre-existing Wave 0 baseline (two transient warnings in my files were
   fixed before commit: an unused type import in world, an unused param
   in compute; the final state adds zero warnings).
5. `pnpm exec oxfmt packages/sporta-artifacts packages/sporta-editors
   packages/sporta-world packages/sporta-compute` -> clean, idempotent.

## FIXTURE EVIDENCE

Everything implemented is honestly fixture-grade:

- All state is IN-MEMORY (Maps inside the services/adapters). There is
  no persistence, no filesystem, no network, no real editor process and
  no real compute plane. Process restart loses state — by design for
  Wave 1.
- `InMemoryArtifactBlobStore.restore` is a fixture persistence seam
  (seeds externally-persisted bytes unverified so read-time integrity
  checking is observable); it is not a production restore path.
- `KdenliveFixtureAdapter` / `MysteryAppFixtureAdapter` are synthetic
  adapters (the kdenlive version string "24.08.0" is illustrative); no
  real kdenlive/blender/etc. integration exists yet.
- `LocalEchoComputeProvider` executes only the trivial "echo" kind
  deterministically; `RefusingComputeProvider` always refuses.
- Editor license classification, the `compute:<kind>` usage mapping, the
  derived `swm:<domain>` snapshot identity and the `art:<n>`/`job:<n>` id
  minting are documented fixture-grade policies, not production
  decisions.
- Determinism is real: FixedClock + sha-256 make every test repeatable;
  the test run is genuinely executed (real process, real assertions),
  only the DOMAIN under test is fixture-scoped.

No fixture result is claimed as production capability anywhere above.

## CONTRACT CHANGES

Additive only; no existing export was removed or renamed in any of my
four packages (frozen v1 preserved — verified by name-by-name comparison
of the exported surface before/after).

- sporta-artifacts: moved the frozen declarations
  (`RecordArtifactInput`, `CommitRevisionInput`, `ArtifactGraphPort`)
  from contract.ts into `src/domain/ports.ts` and re-exported them
  unchanged from contract.ts (entrypoint-only convention); added
  `ArtifactClock`, `ArtifactContentHashFn`, `ArtifactBlobStorePort`
  types and re-exports of the service, blob store, clocks, sha-256
  helpers and typed errors.
- sporta-editors: same declaration move + re-export for the frozen
  surface; additive optional fields `editorSessionId?` on
  `OpenEditorSessionInput` (idempotency key) and `projectFormat?` /
  `projectState?` on `ReconcileSessionInput` (format declaration + payload);
  new types `EditOperation`, `EditorAdapterPort`,
  `EditorSessionStorePort`, `EditorClock`, `EditorHashFn`,
  `EditorBrokerDeps`, re-exported `ArtifactRevisionRecord` and
  `ArtifactGraphPort` (from @sporta/artifacts/contract, a declared
  dependency); re-exported pure functions
  `serializeEditOperation`/`parseEditOperation`,
  `requiredIntegrationLevel`/`licensePermitsUsage`/`resolveEditorChoice`,
  the service, adapters and typed errors.
- sporta-world: same declaration move + re-export; additive optional
  fields on `ObservationInput` (`entityRefs?`, `eventRefs?`, `policy?`);
  new types `IngestedObservation`, `WorldClock`, `WorldHashFn`;
  re-exported pure snapshot functions, the service, hash adapter, clocks
  and typed errors.
- sporta-compute: same declaration move + re-export; additive optional
  `detail?` field on `ComputeJobStatus`; new types
  `ProviderExecutionResult`, `ComputeProviderPort`, `ComputeClock`,
  `ComputeBrokerDeps`; re-exported the state machine and policy pure
  functions, the service, fixture providers, clocks and typed errors.
- sporta-contracts / sporta-policy: NOT touched (TL-owned frozen). No
  work-order change to them was needed — all Wave 1 semantics fit inside
  my own additive contract surface.

## RIGHTS-PROVENANCE

- Every artifact, revision, session, delta, snapshot and job carries the
  caller-supplied `PolicySet`; no layer drops or invents rights.
- Editor `openSession` REFUSES to open when `policy.rights.usages` lacks
  "edit" or `prohibitions` includes it (typed
  `EditorRightsRefusalError`) — tested.
- Compute submission is policy-checked BEFORE submission: a job whose
  rights do not grant `compute:<kind>` is born refused and never reaches
  a provider — tested.
- SWM refuses to weaken an established snapshot policy via a later
  differing explicit policy (typed `WorldPolicyConflictError`) — tested.
- Provenance is preserved end-to-end: revisions carry the caller's
  provenance; editor reconciles stamp `editor-session` provenance with
  the session id and external tool versions; SWM keeps every
  observation's original provenance in the ledger and the freshest at
  record level; only `authorized-source`/`observation` provenance may
  become production truth — tested.
- Opaque imports carry the session policy and mark the artifact
  `editability: "opaque"` so downstream rights/processing treats them
  honestly.

## PERFORMANCE

Not a Wave 1 acceptance axis; observed honestly: the full 51-test suite
runs in ~1.1 s wall time (dominated by process startup); individual
service calls are sub-millisecond in-memory operations.
`buildLineageIndex` is O(n) per commit over all revisions
(fixture-acceptable; a per-artifact index is a Wave 2 optimization).
No timeouts are used to mask anything; all logic is synchronous
in-memory.

## SECURITY

- No credentials, tokens or real user data appear in code, tests or this
  report; no network or filesystem IO exists in any of the four packages.
- `node:crypto` is used ONLY in adapters (sha-256 helpers); the domain
  layers stay pure (enforced by the architecture checker — domain-io rule,
  0 violations).
- Fail-closed defaults everywhere: unknown licenses never permit usage,
  unknown project formats import opaquely, non-authorized provenance is
  refused, policy checks precede submission, blob corruption is a typed
  error never a silent pass.
- IDs are opaque (`art:`/`rev:`/`es:`/`obs:`/`swm:`/`job:` prefixed);
  no external provider identifier becomes a domain identifier.

## RISKS

- In-memory state means no durability yet: an execution crash loses
  canonical artifacts in the current fixtures. The durable
  content-addressed storage seam (over ZCode storage ports) is the
  declared Wave 2 dependency — the architecture keeps it behind
  `ArtifactBlobStorePort`/`ArtifactGraphPort` so the swap is localized.
- The single-chain lineage law (one child per parent) refuses concurrent
  reconciles against the same checkpoint instead of silently forking;
  real concurrent-session workflows may need an explicit merge strategy
  (a product decision, not silently improvised here).
- License classification is a token-based fixture classifier; real
  licensing/compliance vetting is a policy-domain concern for later
  waves.
- `swm:<domain>` single-snapshot-per-domain identity is fixture-grade;
  event-instance scoping needs an additive input (see NEXT DEPENDENCIES).
- Synchronous compute execution models only the fixture plane; real
  providers are async (the port shape already supports it).

## BLOCKERS

None. All five verification gates pass on branch wave1/worker-b. No
dependencies on Workers A/C were needed for Wave 1 scope (editors
depends only on the TL-frozen @sporta/contracts and my own
@sporta/artifacts).

## DEVIATIONS

- Frozen v1 declarations were MOVED from each contract.ts into
  `src/domain/*` and re-exported unchanged from contract.ts. Export names
  and shapes are identical (verified), but the declaration site moved.
  Reason: contract.ts must re-export the app service class for wiring
  (the only public entrypoint rule), and the architecture checker's
  cycle detection records type-only imports — a service importing port
  types from contract.ts while contract.ts re-exports the service would
  be flagged as a dependency cycle. The entrypoint-only convention
  (public names re-exported from src/ internal files) is the same
  pattern the TL established for sporta-contracts in Wave 0.
- `lineage(unknownArtifact)` returns `[]` (documented) rather than an
  error; `readRevision` returns null per the frozen port signature.
- Opaque imports create a NEW artifact instead of attaching an opaque
  revision to the source artifact's lineage — per
  docs/contracts/artifact-edit-roundtrip.md ("unknown projects become
  opaque imported artifacts") and the never-overwrite invariant; the
  source lineage stays byte-identical.
- The compute broker executes synchronously in Wave 1 (fixture plane);
  `poll` therefore always observes terminal states after submit. The
  state history (`history(jobId)`) provides the queued->running->
  terminal evidence. Documented in SPEC.md.

## NEXT DEPENDENCIES

Work-order notes to the TL (nothing here was implemented by crossing
boundaries; no other worker's package was imported):

1. sporta-contracts (TL-owned) — no change REQUIRED for Wave 1. For
   Wave 2 consider: (a) an optional timestamp/`updatedAt` field on
   `ArtifactRevisionRecord` (commit-time provenance is currently only in
   the service ledger); (b) widening
   `EditDeltaRecord.operations: readonly string[]` to a typed union
   (`readonly string[] | readonly EditOperation[]`) or a canonical
   operation record — today the typed view lives in
   sporta-editors' additive `EditOperation` + parse functions; (c) an
   event-instance scope field for SWM records (my fixture derives
   `swm:<domain>`).
2. ZCode durable storage seam — the Wave 0 PROJECT-STATE seam #2: I need
   a typed durable content-addressed storage port binding (ZCode
   `packages/services/src/storage`) to implement `ArtifactBlobStorePort`
   for persistence; my adapter interface is ready for it.
3. ZCode editor workspace binding (seam #3) — Wave 2 real editor
   adapters (kdenlive first per the roadmap) need local/remote workspace
   facilities for project export/import; the `EditorAdapterPort` shape
   (knownProjectFormats, deriveOperations) is designed to absorb them.
4. Worker A work-order note: when the WorkGraph records artifact
   production, the intended wiring is `WorkGraphNode(kind: "artifact")`
   referencing `revisionId`s committed through my `ArtifactGraphPort`
   (IDs are stable/opaque); please keep artifact references as revision
   ids, not content hashes. No shared code needed.
5. Worker C work-order note: Arena result application (if it produces
   revised artifacts) must go through `commitRevision` with
   provenance `sourceKind: "arena-session"` — the SWM gate refuses
   arena-session provenance for production truth, so Arena-derived
   world facts must arrive via validated observations, not direct SWM
   writes.
6. Compute provider registration policy (TL): when real providers land,
   the broker's provider set should be assembled from a TL-owned
   composition root, not hardcoded by consumers.
