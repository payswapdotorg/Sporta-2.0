# W12 Work Orders — the composition-side seams

**Directive:** the W11C serialized NEXT DEPENDENCIES (the five composition-side
read/write seams) — the typed next arc per `8668962`.
**Architecture:** `docs/architecture/adr-w12-composition-seams.md`.
**Baseline:** main `8668962` + the TL Wave 0 freeze (enumeration reads + tests).
**Universal worker law:** `docs/work-orders/sporta-work-orders.md` (read first).

## TL-only Wave 0 — required before worker dispatch

1. Commit the ADR + these work orders + `docs/testing/w12-acceptance.md`.
2. Freeze the enumeration reads (additive-only, each with a named test):
   - `TransformRunService.listRuns()` (ledger order) in `packages/sporta-transforms`;
   - `ArtifactGraphService.listArtifacts()` (registry order) in `packages/sporta-artifacts`;
   - NEW `CreatorCandidateQueryService` over the candidate store in
     `packages/sporta-marketplace` (+ `listAll()` on the in-memory store
     implementation; the frozen `CandidateStorePort` untouched);
   - module `provides` registrations: `transform-run-ledger-reads`,
     `artifact-registry-reads`, `marketplace-creator-reads`.
3. Re-measure the station battery on the freeze commit; record numbers.
4. Stage the three worker packets (disjoint territories below); dispatch from
   inside the replay only.

## Worker A (w12a) — the runs + library REAL hosts

**Owns only:** `packages/web/src/sporta/runs/**`, `packages/web/src/sporta/library/**`,
new test file(s) `packages/web/test/sportaSeamsRuns*.test.ts` /
`sportaSeamsLibrary*.test.ts`, `docs/implementation/worker-w12a.md`.

- W12A-1 `createRunsRealHost(service: TransformRunService): RunsScreenPort` —
  `listRuns()` over the freeze enumeration read; `readRun()` over the existing
  point read; every `TransformRunManifest` field projects verbatim through the
  frozen `RunRecordShape` mirror; typed errors propagate; the ledger's
  fixture-grade honesty label carries to the screen surface.
- W12A-2 `createLibraryRealHost(graph: ArtifactGraphService): LibraryScreenPort` —
  `listArtifacts()`/`readArtifact()` over the freeze enumeration + point reads;
  immutable lineage root-first (the Library law); typed refusals verbatim.
- W12A-3 the artifact-content/export read seam — `exportRevisionContent()`
  through `ArtifactGatedReadService.readRevisionContent` (hash-verified bytes,
  gate refusals surfaced as typed `ScreenRefusal`s; never bypass the gate).
- Battery evidence: REAL services → REAL hosts → screen views, in node tests
  (deterministic runs, REAL child-process steps, REAL committed revisions).
- The fixture hosts stay (browser demo + their existing tests) — no deletion.

## Worker B (w12b) — the marketplace submission-states REAL host

**Owns only:** `packages/web/src/sporta/marketplace/**`, new test file(s)
`packages/web/test/sportaSeamsMarketplace*.test.ts`,
`docs/implementation/worker-w12b.md`.

- W12B-1 `createMyPipelinesRealHost(query: CreatorCandidateQueryService, …): MyPipelinesScreenPort` —
  creator records over REAL `TransformCandidateRecord`s (the freeze query
  service); `creatorState` is a pure projection of the REAL lifecycle
  (DRAFT→SUBMITTED→…); `origin: "record"` for every row; the
  `origin: "fixture-demo"` rows retire to typed-refusal-backed REAL states.
- W12B-2 creator version-status reads through the REAL review seam
  (`readCreatorVersionStatus`): real decisions or the honest typed refusal
  (the existing `no review decision recorded` law) — never faked.
- Public-listings reads are ALREADY REAL through the existing studio seam
  (`createMarketplaceScreenHost`) — do not create a second marketplace read
  authority; leave that host untouched unless additive wiring requires a prop.
- Battery evidence: REAL submission lifecycle (startDraft → submitCandidate →
  review) projected through the REAL host into the screen views.

## Worker C (w12c) — the connected-apps REAL host (audit + revoke write)

**Owns only:** `packages/web/src/sporta/apps/**`, new test file(s)
`packages/web/test/sportaSeamsApps*.test.ts`,
`docs/implementation/worker-w12c.md`.

- W12C-1 `createAppsRealHost(environment, actionAudit, …): ConnectedAppsScreenPort` —
  attachment + descriptor views over `listAttachmentsByScope` + descriptor
  reads (the existing W11C projection test is the seed); audit reads over REAL
  `ApplicationActionRecord`s (`readAudit(sessionId)` per the frozen audit
  service; sessions enumerated honestly — absent sessions = empty audit, not
  an error).
- W12C-2 the revoke write over `ApplicationEnvironmentService.revokeAttachment`:
  idempotent, safe-stop semantics surface verbatim; failure typing honest;
  the screen's exactly-one-write-path law preserved (no grant path from the
  screen — attaching stays with the consent flow).
- The existing "real-host adapter disables revoke with a reason" note retires
  once the write rides the REAL path; the fixture host stays for the browser
  demo and its existing tests.
- Battery evidence: REAL grant → audit → revoke path through the REAL host
  into the screen views (extend the W11C pattern to the HOST level, not just
  view functions).

## TL-owned integration (after all three lanes land)

- `packages/web/src/sporta/product/**` (app/composition wiring), the
  `productComposition.ts` headless REAL composition, `main.tsx`/route if
  needed, package manifests/lockfile, PROJECT-STATE + integration-log records.
- `app.tsx` accepts optional REAL screen ports (constructor injection); absent
  = the browser demo fixture hosts (honest labels unchanged); present = REAL
  backing badges + the retired missing-seam notes.
- Re-run the browser journeys (both viewports) + the six-gate battery on every
  serial merge; screenshots re-reviewed at the integration SHA.

## Non-negotiables

- No second state owner anywhere; adapters are pure projections.
- No frozen-contract changes (additive-only; surface check must stay green).
- Typed refusals preserved verbatim — never a silent no-op or stringly null.
- Honest backing labels at every grade; the quota/ledger honesty labels carry.
- Every worker report uses the standard sections: WORK ITEMS / CHANGED FILES /
  TESTS / REAL EVIDENCE / FIXTURE EVIDENCE / CONTRACT CHANGES / SECURITY /
  PERFORMANCE / RISKS / BLOCKERS / DEVIATIONS / NEXT DEPENDENCIES.
- File-size law: production files ≤400 lines; the 512-line disclosure
  precedent requires a documented deviation.
