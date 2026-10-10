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

---

# Wave 3 — Worker B: editor session history read seam + rights-gated reads

Status: WAVE 3 W3B-1 + W3B-2 IMPLEMENTED (branch wave3/worker-b, base
14836c6). The wave-1 report above is preserved unchanged; wave-2 history
lives in docs/implementation/integration-log.md (merge bec4d47).

## WORK ITEMS

- W3B-1 `EditorSessionHistoryReadPort` — DONE (real, tested):
  `EditorSessionHistoryService` (app layer) implements the frozen
  contracts port EXACTLY (`listEditorSessions` bounded query ->
  `readonly EditorSessionSummary[]`), re-exported additively from
  `@sporta/editors/contract` together with the contracts shapes
  (`EditorSessionSummary`, `EditorSessionHistoryQuery`,
  `EditorSessionHistoryReadPort`). Summaries mirror
  `EditorSessionRecord` field-for-field (editorSessionId, editorId,
  revisionId, mode, integrationLevel, openedAt, closedAt?) and carry
  NOTHING else — the session's PolicySet never leaks through the seam.
  Filters: revisionId / editorSessionId / openOnly, newest-first order
  (descending openedAt, deterministic descending-id tie-break). Bounded:
  default limit 50, hard cap 500, malformed limits are a typed
  `EditorSessionHistoryQueryError`.
- W3B-1 RIGHTS-GATED reads (invariant 22, the C6 read half) — DONE
  (real, tested): the input this service accepts is the ADDITIVE
  `EditorSessionHistoryListInput` = contracts query + `usage?` (an
  options object with the caller's permitted usages). Law
  (`sessionVisibleToUsage`, pure domain): a session is listed iff at
  least one declared usage is affirmatively permitted by the session's
  PolicySet `rights.usages` AND no declared usage is in
  `rights.prohibitions` (a mixed context is judged as a whole).
  Fail-closed: missing/empty usage context lists nothing. REFUSAL IS
  HONEST: filtered-out sessions are simply not returned — the seam is a
  read seam, not an authorization oracle: it never errors on a rights
  refusal, never explains an absence, never reveals whether a session
  exists behind a prohibition. Documented in SPEC.md (Wave 3 section).
- W3B-1 durable-capable session-history store — DONE (real, measured):
  new `EditorSessionHistoryStorePort` (domain) with `append` (idempotent
  per session id, first write wins), `close` (first close wins; unknown
  id -> typed `UnknownEditorSessionError`), `list` (bounded structural
  listing). Implementations: `InMemoryEditorSessionHistoryStore`
  (fixture-grade, tests) and `FsEditorSessionHistoryStore` — a REAL
  filesystem JSON ledger following the W2 FsArtifactBlobStore pattern:
  one pretty-printed record per session at
  `rootDir/<sha256(id)[0:2]>/<sha256(id)>.json`, atomic writes (stage
  under `.tmp`, rename into place), read-time integrity verification
  (parses, required fields present, and the record's editorSessionId
  hashes back to the file's own address) with typed
  `EditorSessionHistoryIntegrityError`, and real durability (a fresh
  instance over the same directory reads everything earlier instances
  wrote).
- W3B-1 broker projection wiring — DONE: `EditorBrokerDeps` gains an
  OPTIONAL additive `sessionHistory?` seam. When present, every session
  the broker opens is appended to the durable history; an idempotent
  re-open re-appends the EXISTING record, which self-heals a projection
  that missed the original append. Absent => broker behavior is
  byte-identical to wave 2 (opt-in, no behavior change for existing
  wiring).
- W3B-2 rights propagation enforcement on reads — DONE (real, tested
  end-to-end on the REAL kdenlive lane): see TESTS.

## CHANGED FILES

All inside the owned boundary (sporta-editors + this report file); no
file outside ownership touched; pnpm-lock.yaml and root manifests
untouched (verified via git status/diff); zero new dependencies.

New (7):
- `packages/sporta-editors/src/domain/history.ts` (165 lines — types,
  limit law, the pure invariant-22 gate, filter/order helpers)
- `packages/sporta-editors/src/app/EditorSessionHistoryService.ts` (53)
- `packages/sporta-editors/src/adapters/InMemoryEditorSessionHistoryStore.ts` (44)
- `packages/sporta-editors/src/adapters/FsEditorSessionHistoryStore.ts` (199)
- `packages/sporta-editors/test/sessionHistory.test.ts` (414)
- `packages/sporta-editors/test/FsEditorSessionHistoryStore.test.ts` (304)
- `packages/sporta-editors/test/rightsReadGate.integration.test.ts` (330)

Modified (9, additive-only):
- `src/domain/errors.ts` (+`EditorSessionHistoryQueryError`,
  +`EditorSessionHistoryIntegrityError`)
- `src/domain/ports.ts` (+optional `sessionHistory?` on
  `EditorBrokerDeps`)
- `src/app/EditorBrokerService.ts` (append wiring on both open paths)
- `src/contract.ts` (additive re-exports: 3 contracts shapes + 5 new
  types + 7 pure functions + service + both stores + 2 errors)
- `src/contract.example.ts` (compile-checked read-seam examples)
- `src/module.ts` (provides += "editor-session-history-read-port")
- `SPEC.md` (Wave 3 section: the read-seam law, the honest-refusal
  doctrine, the gate law, the ledger layout, failure semantics)
- `CONTRACT.md` (Wave 3 implementation notes)
- `docs/implementation/worker-b.md` (this section)

File-size law: every src file is <= 214 lines. The 414-line
sessionHistory.test.ts is a test file — exempt per the repo's own
oxlint override (`max-lines: off` for `**/*.test.ts`) and base
precedent (sporta-arena/test/httpArenaTransport.test.ts is 507 lines at
base 14836c6); the architecture checker (max-file-lines 400) walks
src/ roots only and reports 0 violations.

## TESTS

Location: `packages/sporta-editors/test/`; runner: `pnpm exec tsx --test`
(node:test + node:assert/strict — no new test frameworks). 23 new tests:

- `sessionHistory.test.ts` (10) — W3B-1: frozen-port shape satisfied +
  bare-query fail-close; summaries field-for-field with records (exact
  key set, no policy leak); broker append + idempotent re-open without
  duplication; re-open self-heal of a history that missed the append;
  structural filters (revisionId/editorSessionId/openOnly) + closedAt
  surfaced; close first-close-wins + typed unknown-session refusal;
  rights gate differential (render/edit list, derive absent, mixed
  context hidden by prohibition, empty/missing usage lists nothing);
  pure gate law unit tests; bounded reads (default 50 of 55, explicit
  limit, cap 500, malformed limits typed); malformed limit typed from
  the service.
- `FsEditorSessionHistoryStore.test.ts` (9) — REAL durable storage
  evidence (W2 pattern): real JSON ledger file at the sharded id
  address (byte-compared, size measured); durability across fresh
  instances (twice); atomic writes (no .tmp leftovers, real file count
  measured); append idempotency (first write wins ON DISK); close
  unknown typed + first-close-wins on disk; structural filtering over
  real files; three corruption scenarios -> typed
  `EditorSessionHistoryIntegrityError` (not-json / id-address-mismatch
  / missing fields); the durable ledger backing the rights-gated seam
  end-to-end (incl. a restarted instance); real FS errors surfaced.
- `rightsReadGate.integration.test.ts` (4) — W3B-2 on the REAL kdenlive
  lane (W2 real code only): (1) real MLT XML round-trip ->
  FsArtifactBlobStore (real bytes on real disk) -> real revision ->
  broker (real KdenliveAdapter, level 2) -> FS history ledger; a render
  caller lists the session (summary asserted field-for-field; blob +
  ledger files stat'ed as real files); (2) a derive caller (prohibited)
  and a mixed render+derive caller CANNOT list it — absent, never an
  error; an edit caller still can; bare query lists nothing; (3) the
  PolicySet travels VERBATIM: session-store record, durable ledger file
  read back from real disk, and the gate's differential behavior all
  agree on exactly the policy fields that gated the read
  (usages=[render, edit], prohibitions=[derive]); (4) the gate survives
  a REAL reconcile (chain grows r1 -> r2, summary stays anchored at the
  checkpoint revision) and a ledger restart with identical results.

## REAL EVIDENCE

All commands run from /home/z/sporta-2.0 on branch wave3/worker-b at
the delivered head; numbers are as printed by the tools (the TL
re-measures at the integration station):

1. `pnpm architecture:check` -> `architecture: OK / violations: 0 /
   baseline: 0 / new: 0`.
2. `node scripts/architecture/sporta-surface-check.mjs` ->
   `ok: sporta-editors exports all 9 frozen names (+56 additive)` and
   `sporta-surface-check: OK — frozen surfaces intact, growth is
   additive-only`.
3. `pnpm exec tsc -b packages/sporta-artifacts packages/sporta-editors
   packages/sporta-world packages/sporta-compute` -> exit 0, no output
   (clean).
4. `pnpm exec tsx --test packages/sporta-artifacts/test/*.test.ts
   packages/sporta-editors/test/*.test.ts` -> `tests 77 / pass 77 /
   fail 0 / cancelled 0 / skipped 0`, duration_ms 1578 (base battery:
   54 pass). Full sporta suite
   `pnpm exec tsx --test packages/sporta-*/test/*.test.ts` ->
   `tests 222 / pass 222 / fail 0` (base: 199) — 199 base + 23 new.
5. `pnpm lint` -> `Found 70 warnings and 0 errors` — identical to the
   pre-existing baseline (the one transient warning my first draft
   added — a useless spread in a test — was fixed before commit).
6. FS ledger, measured on this machine via a one-off tsx measurement
   script (200 real appends into a real mkdtemp dir, real stat/readdir
   aggregation): 200 appends in 80.7 ms (0.404 ms avg per atomic
   append); listing a rights-gated page of 50 over the 200-file ledger
   22.1 ms; a fully-gated-out (empty) list 22.7 ms; 200 real ledger
   files totalling 105,692 bytes (528 bytes avg per pretty-printed
   record). The same facts (file existence, byte sizes, file counts)
   are asserted inside FsEditorSessionHistoryStore.test.ts and
   rightsReadGate.integration.test.ts via node:fs stat/readFile on real
   temp directories.

## FIXTURE EVIDENCE

- The gate, filter, order, limit and summary-projection logic is pure
  domain code exercised by real tests; the InMemory history store is
  fixture-grade by design (test double for the durable port).
- In the W3B-2 integration lane, every element is REAL W2 code: the
  KdenliveAdapter XML parse/export, the FsArtifactBlobStore, the
  ArtifactGraphService, the KdenliveAdapter registered with the broker,
  and the FsEditorSessionHistoryStore ledger. The ONLY fixture-grade
  seams remaining in that lane are the FixedClock (deterministic
  timestamps) and the InMemoryEditorSessionStore (the wave-2 session
  store — the history projection itself is the real FS ledger).
- The MLT document under test is a fixture DOCUMENT (mirrors the shape
  real Kdenlive writes; the same document the W2 adapter tests use) —
  labeled fixture evidence; the parse/export round-trip over it is real
  code path execution.
- No real kdenlive process is launched (the adapter operates on the MLT
  XML document shape; that is the declared W2 integration level).

## CONTRACT CHANGES

Additive-only inside sporta-editors; the contracts package is FROZEN
and untouched (no fork of any type — the frozen
`EditorSessionHistoryReadPort`/`EditorSessionHistoryQuery`/
`EditorSessionSummary` shapes are implemented exactly and re-exported):

- `src/contract.ts` adds: type re-exports `EditorSessionSummary`,
  `EditorSessionHistoryQuery`, `EditorSessionHistoryReadPort` (from
  @sporta/contracts/contract); new types
  `EditorSessionHistoryUsageContext`, `EditorSessionHistoryListInput`
  (extends the frozen query additively), `EditorSessionHistoryFilter`,
  `EditorSessionHistoryStorePort`, `EditorSessionHistoryDeps`; pure
  exports `EDITOR_SESSION_HISTORY_DEFAULT_LIMIT` (50),
  `EDITOR_SESSION_HISTORY_MAX_LIMIT` (500),
  `resolveEditorSessionHistoryLimit`, `sessionVisibleToUsage`,
  `toEditorSessionSummary`, `matchesEditorSessionHistoryFilter`,
  `compareEditorSessionsNewestFirst`; classes
  `EditorSessionHistoryService`, `InMemoryEditorSessionHistoryStore`,
  `FsEditorSessionHistoryStore`; errors
  `EditorSessionHistoryQueryError`, `EditorSessionHistoryIntegrityError`.
- `EditorBrokerDeps` gains the OPTIONAL `sessionHistory?` field
  (additive; existing wiring compiles and behaves identically).
- Frozen v1 surface preserved (surface check green: 9 frozen names, 56
  additive); `module.ts` provides grows additively.

## RIGHTS-PROVENANCE

- The read gate is invariant 22's C6 read half: rights PROPAGATE to the
  read boundary. A session is listed only for callers whose declared
  usage context is affirmatively permitted and not prohibited by the
  session's PolicySet (the same PolicySet the broker verified at open
  time and stamped onto the durable record).
- The PolicySet travels VERBATIM: broker record == durable ledger file
  == the fields that gated the read (deep-equality asserted in test 3
  of rightsReadGate.integration.test.ts, including a read-back of the
  real JSON file from real disk).
- Fail-closed defaults: no usage context => nothing listed; any
  prohibited usage in the context => the session is hidden; malformed
  limit => typed error; corrupted ledger => typed integrity error.
- The summary shape carries NO policy fields — rights data never leaks
  through the read seam (asserted key-by-key).
- Holders are not evaluated at this seam (usage-class gating only) —
  holder-bound authorization remains a policy-domain concern (documented
  in SPEC.md).

## PERFORMANCE

Measured, not guessed (see REAL EVIDENCE #6 for method): 0.404 ms avg
per durable append (atomic tmp+rename, 528-byte records); a bounded
page-of-50 gated read over a 200-record ledger is 22.1 ms (the FS store
scans and integrity-verifies every ledger file — O(ledger); bounded
queries bound the RESULT, the scan is the documented cost); the pure
in-memory path is sub-millisecond. The full 77-test battery runs in
~1.6 s wall; the whole 222-test sporta suite in ~5.6 s.

## SECURITY

- No credentials, tokens or real user data appear in code, tests or
  this report (nothing needed fragment-assembly — no fake secrets
  exist in this lane).
- No network. Filesystem IO lives ONLY in the adapters layer (the
  architecture checker's domain-io rule: 0 violations); the domain
  layer stays pure.
- Fail-closed everywhere: unknown/corrupt state is a typed error or an
  honest absence, never a silent pass; the gate cannot be bypassed by
  omitting the usage context (that lists nothing).
- IDs remain opaque; ledger addresses are sha-256 of the session id
  (no user-controlled path components reach the filesystem — shard
  names are `[0-9a-f]{2}` only, enforced on both write and walk).

## RISKS

- The FS ledger `list` is O(ledger-files) per query (scan + parse +
  verify). Correct and honest, but a production-scale deployment wants
  an indexed store; the `EditorSessionHistoryStorePort` is the seam for
  that swap (same shape as the W2 storage doctrine).
- The rights gate applies AFTER the bounded store page read: when
  prohibited sessions occupy early page slots the returned page can be
  shorter than the limit (documented in SPEC.md; callers narrow filters
  or raise the limit up to the 500 cap). A gate-aware pagination cursor
  is future polish, not wave-3 scope.
- Session closure is recorded via the store's `close()`; a broker-level
  close-session flow (lifecycle events, retention enforcement) is
  future work — the read seam honors whatever closedAt the durable
  record carries.
- The usage-context vocabulary is caller-declared (not
  cryptographically authenticated); the seam enforces PROPAGATION of
  the PolicySet gate, not caller identity (holders unevaluated).

## BLOCKERS

None. The frozen contracts shapes fit the implementation exactly; no
type fork was needed.

## DEVIATIONS

- The additive usage-context option is named `usage` on
  `EditorSessionHistoryListInput` (the packet said "an additive options
  object with the caller's permitted usages" without fixing a name).
- `sessionHistory?` on `EditorBrokerDeps` is optional-and-opt-in rather
  than required: existing wave-2 wiring (tests, product code) must keep
  compiling and behaving identically (additive-only law). The W3B-2
  integration lane wires it for real.
- oxfmt: base 14836c6 is NOT format-clean (45 of 67 files in
  sporta-editors already fail `oxfmt --check` at base, pre-existing
  from the wave-2 merge). I formatted ONLY my 7 new files (all pass
  `oxfmt --check`) and left the pre-existing files untouched to keep
  the diff reviewable; a repo-wide format pass is a TL decision, not a
  worker-lane change.
- Test-file line counts exceed 400 in one new test file (414) — within
  the repo's explicit test exemption and base precedent (507-line test
  file at base); all PRODUCTION files are <= 214 lines.

## NEXT DEPENDENCIES

1. TL note (wave-3 lane C): `ProductLoopProjectionDeps` can now wire
   `EditorSessionHistoryReadPort` = `EditorSessionHistoryService` (from
   `@sporta/editors/contract`) with the caller's usage context — the
   takeover/editor stages can un-pend. The bare contracts port shape
   also works (fail-closed: no usage => no sessions).
2. TL note: a durable `EditorSessionStorePort` (the session-state
   store itself is still in-memory in wiring) would make broker state
   restartable; the FsEditorSessionHistoryStore pattern transfers
   directly.
3. TL note (policy domain): a caller-usage derivation source (who
   vouches for the usages in `EditorSessionHistoryUsageContext`) and
   holder-bound authorization sit ABOVE this seam by design.
4. TL note: retention enforcement (PolicySet.retention dispositions
   against history records) is a natural wave-4+ concern at the store
   seam; nothing in this lane enforces retention beyond carrying the
   policy verbatim.

DELIVERY: branch wave3/worker-b @ ea27d703f500c1a41a4eeffc3fbb7b80ca0aca4e (code-complete; this report commit sits on top — the wave-1 documentation-commit pattern)

## Gate table (measured at the delivered head)

| Gate                                             | Base 14836c6        | wave3/worker-b                       |
| ------------------------------------------------ | ------------------- | ------------------------------------ |
| pnpm architecture:check                          | 0 violations        | 0 violations / baseline 0 / new 0   |
| sporta-surface-check                             | OK                  | OK (editors 9 frozen + 56 additive) |
| tsc -b (artifacts/editors/world/compute)         | clean               | clean (exit 0)                       |
| tsx --test artifacts+editors                     | 54 pass / 0 fail    | 77 pass / 0 fail (54 + 23 new)       |
| tsx --test packages/sporta-* (full suite)        | 199 pass / 0 fail   | 222 pass / 0 fail (199 + 23 new)     |
| pnpm lint                                        | 0 errors / 70 warn  | 0 errors / 70 warnings (identical)   |

---

# Wave 4 — Worker B: C6 rights propagation — the artifact plane (invariant 22)

Status: WAVE 4 W4B-1 + W4B-2 IMPLEMENTED (branch wave4/worker-b, base
e40efb0; code commit 795a7a3, this report commit on top — the W3-B
documentation-commit pattern). The wave-1/wave-3 reports above are
preserved unchanged; wave-2 history lives in the integration log
(merge bec4d47).

## WORK ITEMS

- W4B-1 PURE RIGHTS GATE (artifact reads) — DONE (real, tested):
  `packages/sporta-artifacts/src/domain/reads.ts` mirrors the ratified
  W3-B `sessionVisibleToUsage` pattern: `ArtifactReadUsageContext`
  (per-package duplication — the ratified wave-4 law, no new shared
  contracts type), the fail-closed `artifactVisibleToUsage` gate (at
  least one declared usage permitted AND none prohibited; bare/empty
  context never visible), the bounded-lineage limit law (default 50,
  cap 500, malformed limits a typed `ArtifactReadQueryError`), and the
  input/port/deps shapes of the gated read seam.
- W4B-1 RETENTION PROPAGATION — DONE (typed exactly by the
  `@sporta/policy` vocabulary, never extended):
  `artifactRetentionExpired(retention, now)` — retain/archive never
  read-expire (the vocabulary types no read refusal for them); `purge`
  becomes effective strictly AFTER `retainUntil`; FAIL-CLOSED on a
  purge with no/unparseable deferral date (the seam must not resurrect
  purged content on a technicality); `retainRuns` is carried verbatim
  but NOT evaluated (this plane owns no run ledger — typed under NEXT
  DEPENDENCIES).
- W4B-1 GATED READ SEAM — DONE (real, tested): `ArtifactGatedReadService`
  (app layer) over `{ graph, blobs?, clock }`:
  - `readRevision` / `readArtifact` (the manifest read) /
    `readRevisionContent` (the blob read) are DIRECT reads — typed
    refusals (`ArtifactRightsRefusalError`,
    `ArtifactRetentionExpiredError`) for prohibited/expired reads;
    honest `null` reserved for genuinely unknown ids; the gate runs
    BEFORE any storage touch (a prohibited content read never reaches
    the blob store).
  - `lineage` is the LISTING surface — honest absence (prohibited/
    expired revisions simply not returned, never an error), bounded
    head-anchored window (the W3-B page-vs-scan tradeoff mirrored: a
    result may be shorter than the limit; the chain may show GAPS — a
    returned `parentRevisionId` may reference an excluded revision).
  - Gate order: rights first, then retention.
  - The blob-read boundary law (documented in SPEC): content-addressed
    blobs carry no PolicySet — the rights boundary for content is the
    REVISION record referencing the content hash; raw store reads
    remain internal storage plumbing. The frozen v1 port surfaces are
    UNCHANGED (the additive law, proven by the identical baselines);
    enforcement lands at the wave-4 read seam.
  - Optional capabilities degrade gracefully with typed
    `ArtifactReadUnavailableError`: no blob store ⇒ no content reads;
    no manifest-read capability ⇒ no manifest reads — never a silent
    pass.
- W4B-2 EDITOR WRITE-PLANE GAP AUDIT — DONE (typed; small gaps CLOSED
  with tests, structural gaps typed):
  1. OPEN (closed): `openSession` previously verified only the
     CALLER-SUPPLIED session policy ("edit" usage); the CHECKPOINT
     REVISION's own PolicySet was never consulted — a session policy
     could grant rights the artifact's revision does not carry.
     CLOSED additively: the revision's rights must also permit "edit"
     (typed `EditorRightsRefusalError` carrying the revision id and
     its usages/prohibitions).
  2. OPEN (closed): retention was ignored — a purge-expired revision
     could still be edited. CLOSED additively: an effective purge
     refuses the open (typed `EditorRetentionRefusalError`); a purge
     NOT yet past its date still opens (the deferral is honored). The
     retention law is CONSUMED from `@sporta/artifacts/contract`
     (`artifactRetentionExpired` — declared dependency, public
     entrypoint) so the artifact and editor planes share one
     semantics.
  3. APPEND (verified, no gap): understood reconciles propagate the
     session policy VERBATIM to the new revision (asserted deep-equal;
     previously implied by construction, now pinned by test).
  4. COMMIT (verified, no gap): opaque imports carry the session
     policy VERBATIM on BOTH the new artifact record and its first
     revision (asserted deep-equal; newly pinned by test).
  5. STRUCTURAL (typed, not implemented): `EditDeltaRecord` carries no
     `policy` field (TL-owned contracts; evidence:
     packages/sporta-contracts/src/records/artifacts.ts:27-36) — see
     NEXT DEPENDENCIES. Policy COMPOSITION semantics (e.g. whether a
     child revision's policy should intersect the parent's) do not
     exist in `@sporta/policy`; the broker propagates verbatim and
     never invents algebra.
  6. `resolveEditor` licensing classification is availability-driven,
     not PolicySet-driven — not an invariant-22 propagation gap (the
     PolicySet gates at open/reconcile; documented in SPEC).
  - sporta-arena untouched (worker-c's plane — the w4c escalation/
    result read gate lane).

## CHANGED FILES

All inside the owned boundary (`packages/sporta-{artifacts,editors}` +
this report file). No file outside ownership touched;
pnpm-lock.yaml, root manifests, contracts and policy FROZEN
(verified via `git status`/diff — zero new dependencies).

New (5):
- `packages/sporta-artifacts/src/domain/reads.ts` (202 — the pure
  gate/retention/limit laws, the seam types: usage context, four read
  inputs, `ArtifactGatedReadPort`, `ArtifactGatedReadDeps`)
- `packages/sporta-artifacts/src/app/ArtifactGatedReadService.ts` (131)
- `packages/sporta-artifacts/test/rightsGate.test.ts` (511 — test file)
- `packages/sporta-artifacts/test/rightsReadGateFs.integration.test.ts`
  (370 — the REAL FS lane + in-memory parity)
- `packages/sporta-editors/test/writePlaneRights.test.ts` (273 — the
  W4B-2 audit proofs)

Modified (12, additive-only):
- sporta-artifacts: `src/domain/errors.ts` (+4 error classes, +2 type
  aliases), `src/domain/ports.ts` (+OPTIONAL `readArtifact?` on
  `ArtifactGraphPort` — optional so worker-c's test fakes keep
  compiling), `src/contract.ts` (+34 additive names re-exported),
  `src/contract.example.ts` (compile-checked gated-read examples),
  `src/module.ts` (provides += "artifact-gated-read-port"),
  `SPEC.md` (Wave 4 section), `CONTRACT.md` (Wave 4 notes)
- sporta-editors: `src/app/EditorBrokerService.ts` (+2 additive checks
  in openSession after the checkpoint lookup, ~28 lines),
  `src/domain/errors.ts` (+`EditorRetentionRefusalError`),
  `src/contract.ts` (+1 export), `SPEC.md` (Wave 4 section),
  `CONTRACT.md` (Wave 4 notes)
- `docs/implementation/worker-b.md` (this section, appended)

File-size law: every src file <= 242 lines. The 511-line
rightsGate.test.ts is a test file — the repo's own oxlint override
(`max-lines: off` for `**/*.test.ts`) and base precedent (the 507-line
transport test at W2, the 414-line sessionHistory test at W3-B); the
architecture checker (max-file-lines 400, walks src/ roots) reports 0
violations.

## TESTS

Location: `packages/<pkg>/test/`; runner: `pnpm exec tsx --test`
(node:test + node:assert/strict — no new test frameworks). 22 new
tests:

- `rightsGate.test.ts` (11) — the pure gate laws unit-tested
  (`artifactVisibleToUsage` fail-closed/prohibition/mixed/empty-scope;
  `artifactRetentionExpired` over the full vocabulary: retain/archive
  never expire, purge past/future/boundary instants, fail-closed
  no-date/unparseable, `retainRuns` pinned inert;
  `resolveArtifactLineageLimit` defaults/cap/malformed) + the gated
  surfaces over the in-memory graph (fixture state, real logic):
  direct-read typed refusals with detail/target assertions; honest
  null for unknown ids; manifest gating on the artifact record's own
  policy; typed unavailability for unwired capabilities; lineage
  honest absence with the chain-gap tradeoff pinned (a returned
  parentRevisionId references an excluded revision); bounded lineage
  (default 50 of 55, head-anchored window, window-then-gate
  shortening); content-read gating; and the additive-law proof that
  the frozen v1 port surfaces + blob store + sync manifest accessor
  behave identically without any usage context.
- `rightsReadGateFs.integration.test.ts` (6) — the REAL FS lane
  (EVIDENCE CLASS REAL for the blob plane: real mkdtemp dirs, blob
  files stat'ed and byte-compared against direct node:fs reads of the
  sharded content addresses; EVIDENCE CLASS FIXTURE for the graph
  state and FixedClock, labeled in the file header): (1) a permitted
  caller reads content byte-identical from the durable store;
  (2) a prohibited caller is refused TYPED while the blob provably
  EXISTS on disk and the ungated plumbing CAN read it (the gate
  precedes the storage touch — the refusal is the gate's, not the
  store's); mixed context and bare context refuse; (3)
  retention-expired content refuses typed for a permitted caller,
  metadata included; (4) lineage honest absence on the real lane +
  the PolicySet travels VERBATIM (the record's policy deep-equal to
  the fields that gated the read; the purge decision fields verbatim);
  (5) IN-MEMORY PARITY: the identical law over
  `InMemoryArtifactBlobStore` (same errors, same details, same
  bytes); (6) unknown ids honest null + restart-fresh FS store serves
  the same gated results (the W2 restart law).
- `writePlaneRights.test.ts` (5) — the W4B-2 audit proofs: OPEN
  refuses typed when the revision policy lacks/prohibits edit while
  the session policy grants it (the closed gap #1, detail asserted
  exactly); OPEN refuses typed on a purge-expired checkpoint and
  still opens before the date (closed gap #2); OPEN regression
  (fully-permitted revision opens, session policy verbatim); APPEND
  propagates the session policy verbatim to the child revision;
  COMMIT propagates it verbatim to the opaque artifact + revision.

## REAL EVIDENCE

All commands run from /home/z/sporta-2.0 on branch wave4/worker-b at
the delivered head 795a7a3 (numbers as printed by the tools — the TL
re-measures at the integration station; baseline first, then the
lane):

Baseline (measured at base e40efb0 before any change):
1. `pnpm architecture:check` → `architecture: OK / violations: 0 /
   baseline: 0 / new: 0`.
2. `node scripts/architecture/sporta-surface-check.mjs` → OK (frozen
   surfaces intact: artifacts 6 frozen + 15 additive, editors 9 + 56).
3. `pnpm exec tsc -b packages/sporta-artifacts
   packages/sporta-editors packages/sporta-world
   packages/sporta-compute` → exit 0 clean.
4. `pnpm exec tsx --test packages/sporta-*/test/*.test.ts` →
   `tests 269 / pass 269 / fail 0 / cancelled 0 / skipped 0`
   (duration_ms 7075.6).
5. `pnpm lint` → `Found 70 warnings and 0 errors`.

Lane (measured at the delivered head 795a7a3):
1. `pnpm architecture:check` → `architecture: OK / violations: 0 /
   baseline: 0 / new: 0` (measured fresh after the full battery).
2. `node scripts/architecture/sporta-surface-check.mjs` → OK —
   additive-only growth (artifacts 6 frozen + 34 additive; editors
   9 frozen + 57 additive; every other module unchanged).
3. `pnpm exec tsc -b packages/sporta-artifacts
   packages/sporta-editors packages/sporta-world
   packages/sporta-compute` (fresh after dist + tsbuildinfo removal)
   → exit 0, no output (clean).
4. Scoped `pnpm exec tsx --test
   packages/sporta-artifacts/test/*.test.ts
   packages/sporta-editors/test/*.test.ts` → `tests 99 / pass 99 /
   fail 0` (77 base + 22 new, duration_ms 2180.3).
5. FULL battery `pnpm exec tsx --test packages/sporta-*/test/*.test.ts`
   → `tests 291 / pass 291 / fail 0 / cancelled 0 / skipped 0`
   (duration_ms 7289.7) — the count math holds exactly: 269 base
   + 11 rightsGate + 6 FS integration + 5 writePlane. The documented
   W2 a17-real-execution flake did not fire on this run (single clean
   run recorded honestly; the flake stays typed in PROJECT-STATE).
6. `pnpm lint` → `Found 70 warnings and 0 errors` — the exact
   baseline (one transient warning — an unused import in my first
   draft of the FS integration test — was found by the battery and
   fixed before the code commit).
7. Performance, measured via a one-off tsx script (not committed;
   200 revisions with real content on a real mkdtemp FS store, then
   200 gated reads): REAL FS lane — 200 puts+commits 96 ms; 200
   permitted gated content reads 15 ms (0.075 ms avg, 7292 bytes
   served); 200 typed rights refusals 2 ms (0.010 ms avg — the gate
   fires before any storage touch); gated lineage (50 of 200, default
   limit) < 1 ms. In-memory parity — 200 permitted reads 1 ms
   (0.005 ms avg); refusals 1 ms. The same facts the tests assert
   (real file existence, byte equality, typed refusal details) are
   pinned in rightsReadGateFs.integration.test.ts via node:fs
   stat/readFile on real temp directories.

## FIXTURE EVIDENCE

- The gate, retention, limit and listing logic is pure domain code
  exercised by real tests (real assertions in a real process).
- The artifact GRAPH state is fixture-grade by the W2 record
  (in-memory single state owner); the BLOB plane is REAL (W2
  FsArtifactBlobStore — real files on real disk). The FS integration
  lane labels its evidence classes per file (REAL blob lane, FIXTURE
  graph state + FixedClock).
- FixedClock instances supply deterministic "now" values for
  retention-boundary tests (past/future/at-the-instant) — the
  retention LAW itself is date-arithmetic over the policy vocabulary,
  which is real logic.
- No real kdenlive process, network, or user data is involved in this
  lane; the W3-B real kdenlive lane (rightsReadGate.integration) is
  untouched and still passing in the full battery.
- No fixture result is claimed as production capability anywhere
  above.

## CONTRACT CHANGES

Additive-only, inside my two owned packages; sporta-contracts and
sporta-policy FROZEN and untouched (the PolicySet vocabulary is
consumed, never extended):

- sporta-artifacts adds (34 additive names through the entrypoint):
  types `ArtifactReadUsageContext`, `ReadRevisionInput`,
  `ReadArtifactInput`, `ReadLineageInput`, `ReadRevisionContentInput`,
  `ArtifactGatedReadPort`, `ArtifactGatedReadDeps`,
  `ArtifactReadTarget`, `ArtifactReadCapability`; constants
  `ARTIFACT_LINEAGE_DEFAULT_LIMIT` (50), `ARTIFACT_LINEAGE_MAX_LIMIT`
  (500); pure functions `resolveArtifactLineageLimit`,
  `artifactVisibleToUsage`, `artifactRetentionExpired`; errors
  `ArtifactRightsRefusalError`, `ArtifactRetentionExpiredError`,
  `ArtifactReadQueryError`, `ArtifactReadUnavailableError`; class
  `ArtifactGatedReadService`.
- `ArtifactGraphPort` gains the OPTIONAL method `readArtifact?` —
  optional so every existing implementer keeps compiling
  (worker-c's test fakes implement the port; verified by the
  unchanged 291-test battery and the 12-package surface check).
  The union return grade (`Promise<...> | ...`) lets the single
  owner's v1 SYNC accessor satisfy it structurally — zero signature
  changes anywhere.
- sporta-editors adds: error `EditorRetentionRefusalError`; two
  additive checks inside `openSession` (after the checkpoint
  lookup — no signature or behavior change for permitted opens,
  proven by the unchanged baselines).
- `module.ts` provides grows additively (+artifact-gated-read-port).
- Frozen v1 surfaces preserved (surface check green: artifacts
  6 frozen + 34 additive; editors 9 frozen + 57 additive).

## RIGHTS-PROVENANCE

- The read gate is invariant 22's artifact-plane half: rights
  PROPAGATE to every read boundary. Direct reads refuse typed on a
  bare/empty/non-permitted/prohibited usage context; listings exclude
  with honest absence; the gate precedes any storage touch.
- Retention propagates exactly as `@sporta/policy` defines: a purge
  past its date refuses direct reads and is excluded from listings;
  retain/archive never read-refuse; fail-closed when the deferral
  date cannot be affirmed; `retainRuns` carried, not invented.
- The write-plane half (editors): the checkpoint revision's own
  PolicySet now gates session opens (a caller-supplied session policy
  cannot grant rights the revision does not carry) and effective
  purge refusals block editing; APPEND/COMMIT propagation is pinned
  verbatim by tests.
- The retention law is a SINGLE pure function shared across the two
  planes (editors consumes `artifactRetentionExpired` from the
  artifacts entrypoint — a declared dependency) — no per-plane drift.
- Policy data never leaks through decisions it did not authorize: a
  rights refusal never reveals retention state (rights gate runs
  first); an absence never explains itself.
- Holders/privacy-visibility remain policy-domain concerns above
  these seams (documented in both SPECs).

## PERFORMANCE

Measured, not guessed (method in REAL EVIDENCE #7): the gated content
read adds 0.075 ms avg over the REAL FS store's own read cost on this
machine (the pure in-memory gate path is 0.005 ms); typed refusals
cost 0.010 ms avg (gate-before-storage). The full 291-test battery
runs in ~7.3 s wall (269-test base was ~7.1 s). The lineage window is
O(chain) in memory (the graph is the in-memory single owner; an
indexed/graph-persistent store is the same seam swap as W2 documented
for the blob plane).

## SECURITY

- No credentials, tokens or real user data appear in code, tests or
  this report (nothing needed fragment-assembly — no fake secrets
  exist in this lane; the git push URL token is never echoed in any
  committed file).
- No network. Filesystem IO lives ONLY in the adapters layer (the
  architecture checker's domain-io rule: 0 violations); the domain
  layers stay pure.
- Fail-closed everywhere: bare usage refuses direct reads and empties
  listings; prohibitions win over permissions in mixed contexts;
  purge-without-affirmable-date is expired; unwired capabilities are
  typed refusals; blob corruption stays the store's typed error.
- The gate runs before storage: prohibited callers never touch blob
  bytes (proven by the FS-lane test that stats the real blob file
  while the gated seam refuses).
- IDs remain opaque; FS paths derive from content hashes only (no
  caller-controlled path components).

## RISKS

- The usage-context vocabulary is caller-declared (not
  cryptographically authenticated); the seam enforces PROPAGATION of
  the PolicySet gate, not caller identity (holders unevaluated — the
  W3-B doctrine, unchanged).
- `purge` with no `retainUntil` is treated as already-effective
  (fail-closed). If the TL's policy intent is "no date ⇒ never
  purge", that is a one-line semantic flip in the pure function —
  flagged for ratification in NEXT DEPENDENCIES.
- The lineage chain-gap law means a caller cannot distinguish "a
  revision does not exist" from "a revision is hidden" mid-chain —
  honest by design (absence is the only signal), but downstream
  reconciliation logic must not assume returned chains are gapless.
- The in-memory artifact graph remains fixture-grade (the W2 record);
  durable graph persistence is a future seam behind the same ports
  (the gated read service composes the port, so the swap is local).

## BLOCKERS

None. The frozen contracts shapes fit the implementation exactly; the
wave-4 ADR's per-package duplication law meant no contracts change
was needed at all.

## DEVIATIONS

- The gated read seam is a NEW service (`ArtifactGatedReadService`)
  rather than signature changes on the frozen `ArtifactGraphPort`
  methods: the fail-closed law cannot apply to the frozen port
  without changing every existing caller's behavior (the packet's
  own additive law requires identical behavior for callers that pass
  no usage context — proven by the identical 291/291, 0/70, 0/0
  baselines). The wave-4 ADR's "read seam gains an optional usage-
  context input" is implemented as the new seam's input objects,
  exactly as W3-B's new service carried its additive input.
- `ArtifactGraphPort` gained an OPTIONAL method (`readArtifact?`)
  with a union return grade so the existing SYNC accessor on
  `ArtifactGraphService` satisfies it structurally — zero signature
  changes; optional so external implementers (worker-c's test fakes)
  keep compiling.
- The manifest read surfaces as `readArtifact` on the gated seam (the
  artifact-record read). The export-manifest surface from
  docs/contracts/artifact-edit-roundtrip.md ("every export has a
  manifest") does not exist in the package yet — when it lands, it
  gates at this same seam law (documented in SPEC).
- Test-file line counts exceed 400 in one new test file (511) —
  within the repo's explicit test exemption and base precedent; all
  PRODUCTION files are <= 242 lines.
- oxfmt applied to the new files + the files I modified (all pass
  `oxfmt --check`); pre-existing format failures elsewhere are left
  untouched (a repo-wide pass is a TL decision — the W3-B precedent).

## NEXT DEPENDENCIES

1. TL note (policy semantics, purge-without-date): the fail-closed
   reading of `purge` with no `retainUntil` (treated as already
   effective) needs TL ratification — `@sporta/policy` defines the
   field as "date after which the disposition applies" but not the
   absent-date case. One-line flip in `artifactRetentionExpired` if
   the intent differs. (Same for unparseable dates.)
2. TL note (contracts, EditDeltaRecord policy field): the editor
   write-plane audit found `EditDeltaRecord` carries no `policy`
   field (packages/sporta-contracts/src/records/artifacts.ts:27-36) —
   the delta's policy context is the session/revision it belongs to.
   An additive optional `policy?: PolicySet` would let deltas carry
   it explicitly; frozen contracts are TL-owned, so typed, not
   implemented.
3. TL note (policy semantics, retainRuns): run-count retention needs
   a run ledger this plane does not own (the work plane counts runs).
   If `@sporta/policy` defines the run-count source, the read gate
   can consume it at the same seam.
4. TL note (policy composition): no merge/intersection semantics
   exist for derived revisions (session policy vs parent revision
   policy). The broker propagates the session policy verbatim; if
   policy composition is wanted, it belongs in `@sporta/policy`.
5. TL note (product projection wiring): the artifact read seam is
   ready to wire — `ArtifactGatedReadService` from
   `@sporta/artifacts/contract` with the caller's usage context
   (artifact-revision refs on work-graph nodes can now be read with
   rights enforcement). The bare input fails closed by design.
6. Future seam: a durable artifact GRAPH store (the blob plane is
   real since W2; the graph is the in-memory single owner) — the
   gated read service composes the frozen port, so the swap is local.

DELIVERY: branch wave4/worker-b @ 795a7a32c69d6be765ffb6c95193a1d87c496944 (code-complete; this report commit sits on top — the W3-B documentation-commit pattern)

## Gate table (measured at the delivered head)

| Gate                                             | Base e40efb0        | wave4/worker-b                        |
| ------------------------------------------------ | ------------------- | ------------------------------------- |
| pnpm architecture:check                          | 0 violations        | 0 violations / baseline 0 / new 0    |
| sporta-surface-check                             | OK                  | OK (artifacts 6+34, editors 9+57)    |
| tsc -b (artifacts/editors/world/compute)         | clean               | clean (exit 0, fresh build)          |
| tsx --test artifacts+editors                     | 77 pass / 0 fail    | 99 pass / 0 fail (77 + 22 new)       |
| tsx --test packages/sporta-* (full suite)        | 269 pass / 0 fail   | 291 pass / 0 fail (269 + 22 new)     |
| pnpm lint                                        | 0 errors / 70 warn  | 0 errors / 70 warnings (identical)   |
