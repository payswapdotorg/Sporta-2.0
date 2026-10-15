# W12 Acceptance — the composition-side seams

Gates W12-01…W12-18. Every gate is evidenced by a NAMED passing test at the
integration station (never worker-reported numbers alone). Evidence labels
REAL/FIXTURE are carried verbatim into the record.

## Wave 0 (TL freeze)

- **W12-01** — `TransformRunService.listRuns()` returns the ledger in
  insertion order; manifests verbatim (named freeze test,
  `packages/sporta-transforms/test/`).
- **W12-02** — `ArtifactGraphService.listArtifacts()` returns the registry
  order; records verbatim (named freeze test, `packages/sporta-artifacts/test/`).
- **W12-03** — `CreatorCandidateQueryService` lists REAL candidate records;
  the frozen `CandidateStorePort` is untouched (surface check green + named
  test, `packages/sporta-marketplace/test/`).
- **W12-04** — module `provides` registrations present; surface check
  additive-only; arch 0/0/0; battery green at the freeze SHA.

## Lane A — runs + library REAL hosts

- **W12-05** — `createRunsRealHost` satisfies `RunsScreenPort` over the REAL
  service: list + point reads, manifests verbatim, typed errors propagate
  (named test: REAL run through the REAL host).
- **W12-06** — honest-states law: refused/failed/cancelled runs stay visible
  with their typed states verbatim (named test).
- **W12-07** — the ledger honesty label carries to the screen surface
  (`BACKING: REAL (ledger: fixture-grade in-memory)`) — never re-badged
  (named test).
- **W12-08** — `createLibraryRealHost` satisfies `LibraryScreenPort` over the
  REAL graph: immutable lineage root-first, honest editability classes
  (named test with REAL committed revisions).
- **W12-09** — the export/content read through the gated seam: hash-verified
  bytes; gate refusal = typed `ScreenRefusal`; no gate bypass (named test,
  both arms).

## Lane B — marketplace submission-states REAL host

- **W12-10** — `createMyPipelinesRealHost` returns creator records over REAL
  candidates: `origin: "record"` rows with `creatorState` a pure lifecycle
  projection; zero `fixture-demo` rows remain (named test).
- **W12-11** — draft/submitted immutability laws surface verbatim: the
  changed-resubmit typed error and the already-submitted refusal project as
  typed refusals (named test).
- **W12-12** — creator version-status reads: real decisions or the honest
  `no review decision recorded` refusal (named test, both arms).

## Lane C — connected-apps REAL host

- **W12-13** — `createAppsRealHost` attachment/descriptor views over the REAL
  service reads (named test).
- **W12-14** — audit reads over REAL `ApplicationActionRecord`s; absent
  sessions = empty audit (named test).
- **W12-15** — the revoke write over `revokeAttachment`: idempotent re-revoke
  returns the same record; mid-session safe-stop surfaces; exactly one write
  path (named test).

## TL integration

- **W12-16** — `productComposition.ts` wires the REAL services → REAL screen
  ports; `app.tsx` accepts optional real ports (constructor injection); the
  pure browser demo keeps honest fixture labels (named wiring test).
- **W12-17** — the five missing-seam notes retire at the composition grade;
  the browser journeys re-run 4/4 at both viewports on the integrated app
  (screenshots at the integration SHA).
- **W12-18** — six-gate battery at the final integration SHA: arch 0/0/0 ·
  surface OK additive-only · scoped tsc exit 0 · battery (count recorded) ·
  lint 0 errors / 70 warnings · lockfile identical; serial `--no-ff` merges
  with re-verification per merge (integration-log entries).

## Honest-boundary record (typed-future, never silent)

- Browser-real data path over a local HTTP boundary: typed-future with the
  P11 hosted-preview arc (operator-credential-gated).
- The run ledger remains fixture-grade in-memory until a durable run store is
  ordered (the W9A label carried, W12-07).
- Real payment provider / HF weight hosting / production ingress / hosted
  deployment: unchanged operator-credential-gated typed-future.
