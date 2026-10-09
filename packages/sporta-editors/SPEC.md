# sporta-editors SPEC (Wave 1, Worker B — work orders B2 + B3)

Status: SPEC — written before implementation.

## Scope

The Editor Broker: deterministic, explainable resolution of external
editors; bounded editor sessions with rights verification and a revision
checkpoint; reconciliation of changed external project state back into the
canonical artifact graph. External editors are capabilities/adapters, never
semantic authorities.

Wave 1 is fixture-grade: in-memory session store, in-memory fixture editor
adapters (a known-format "kdenlive" adapter and an unknown-format
"mystery-app" adapter), injectable clock and hash. Real editor adapters
arrive in Wave 2 per the roadmap.

## Behavior

### resolveEditor(input) -> EditorResolution

- Required integration level by operation: `export`/`inspect` -> level >= 1;
  `edit`/`round-trip` -> level >= 2 (an export-only editor cannot accept
  edits that must come back).
- Licensing must permit the requested usage. License classification is a
  deterministic, fail-closed token classifier in the domain layer:
  - always denied: `all-rights-reserved`, `proprietary`, `arr`;
  - derivative-denying (denies `edit`/`round-trip` only): `nd`,
    `no-derivatives` (e.g. CC-BY-ND);
  - recognized permissive/copyleft families (gpl, agpl, lgpl, mpl, mit,
    apache, bsd, isc, unlicense, public-domain, cc, by, cc-by, cc-by-sa,
    ofl, epl) permit usage;
  - anything unrecognized is REFUSED (fail-closed, never a guess).
- Selection is deterministic: among eligible editors, an explicit
  `userPreference` wins when eligible; otherwise the highest integration
  level wins; ties break on ascending `editorId` (stable order).
- The result always carries a human-readable `rationale` naming the chosen
  editor, the required level, the licensing verdict and the preference
  rule applied.
- No eligible editor -> typed `EditorResolutionError` (a refusal, never a
  silent fallback to an ineligible editor).

### openSession(input) -> EditorSessionRecord

- Rights verification BEFORE anything else: `policy.rights.usages` must
  include `"edit"` and `prohibitions` must not — otherwise typed
  `EditorRightsRefusalError` (an editing session without edit rights is
  refused).
- The target revision must exist in the injected `ArtifactGraphPort`, else
  `UnknownRevisionError`.
- The `editorId` must have a registered adapter, else `UnknownEditorError`.
- Idempotent per `editorSessionId` (optional input field): a retry returns
  the SAME session record. Without an id the broker mints `es:<n>`.
- The session record stores the checkpoint: the `revisionId` it was opened
  against. The session store also tracks a mutable internal
  `currentRevisionId` (starts at the checkpoint) which reconciliation
  advances — the checkpoint record itself is never rewritten.

### reconcileSession(input) -> ReconcileResult

- Idempotent per `(editorSessionId, changedProjectHash)`: the store memoizes
  the reconcile result; a retry returns the identical result.
- The session must exist, else `UnknownEditorSessionError`.
- UNDERSTOOD path — when `projectFormat` is a known format declared by the
  session's editor adapter AND that adapter's integration level >= 2:
  1. hash the changed project state (the caller-supplied
     `changedProjectHash`);
  2. derive typed `EditOperation`s from the changed project state via the
     adapter (fixture-grade: top-level project keys become `set` ops with a
     value hash);
  3. commit a NEW revision on the checkpoint's artifact with
     `parentRevisionId` = the session's current revision (chain law), via
     the injected `ArtifactGraphPort`;
  4. return `{ revision, delta, understood: true }` — the delta carries the
     serialized typed operations, the external tool/version and
     editor-session provenance.
- UNKNOWN path — any other format (absent, undeclared, or an export-only
  adapter): import as an OPAQUE artifact:
  1. a NEW artifact with `editability: "opaque"` and a first revision
     holding the changed project hash (no parent — it is a new lineage);
  2. `understood: false`, delta with an EMPTY operation list (no granular
     claims about a project we do not understand);
  3. canonical history is NEVER overwritten — the original artifact's
     lineage is untouched.
- Deterministic ids: reconcile revision/delta ids are derived from
  sha-256 over `(editorSessionId, changedProjectHash)` so retries are
  idempotent even without the memo.
- After a successful understood reconcile the session's current revision
  advances to the new revision; a subsequent save reconciles against it
  (the chain grows: r1 -> r2 -> r3).

## Single state owner

- Editor session state: `InMemoryEditorSessionStore` (adapters) is the sole
  owner of session records, current-revision pointers and reconcile-result
  memos.
- Canonical revision history: sporta-artifacts (injected port). The broker
  NEVER stores revisions itself and never mutates the artifact graph
  except through `recordArtifact`/`commitRevision`.
- External editor internal state: the external application (not modeled
  beyond the fixture adapters in Wave 1).

## Invariants

1. An external application's project file is never canonical Sporta state.
2. Edits create NEW revisions; prior revisions stay readable.
3. Unknown/partially understood projects import opaquely and never
   overwrite canonical history.
4. Rights are checked before a session opens; a checkpoint exists before
   reconciliation can run.
5. Provider/editor failures are typed errors, never silent degradation.
6. Domain layer is pure (no IO, no `node:` imports, no timers); hashing and
   clocks live in adapters and are constructor-injected.
7. Every delta carries provenance (`editor-session` source kind) and the
   external tool/version.

## Failure semantics

| Failure                              | Typed error                 |
| ------------------------------------ | --------------------------- |
| No eligible editor for the operation | `EditorResolutionError`     |
| Rights do not permit editing         | `EditorRightsRefusalError`  |
| Checkpoint revision unknown          | `UnknownRevisionError`      |
| Editor without registered adapter    | `UnknownEditorError`        |
| Session id unknown at reconcile      | `UnknownEditorSessionError` |

All errors extend `EditorError` with a machine-readable `detail`.

## Event order (reconcileSession, understood path)

1. memo lookup `(editorSessionId, changedProjectHash)`;
2. session lookup;
3. format-understanding decision (adapter + level + declared format);
4. deterministic id derivation;
5. `commitRevision` on the artifact graph (parent = current revision);
6. delta construction (typed operations, provenance, external tool);
7. advance the session's current revision;
8. memoize the result;
9. return.

The unknown path replaces step 5 with `recordArtifact` (opaque) +
`commitRevision` (first revision) and skips step 7.

## Wave 3 — the editor-session history read seam (W3B-1/W3B-2)

Status: SPEC — written with the implementation (ADR:
docs/architecture/adr-wave3-read-seams.md is the authority; the frozen
contracts shapes in `packages/sporta-contracts/src/records/readSeams.ts`
are implemented EXACTLY — `EditorSessionHistoryReadPort`,
`EditorSessionHistoryQuery`, `EditorSessionSummary`).

### listEditorSessions(input) -> readonly EditorSessionSummary[]

- The public port is the frozen contracts shape. The input this package
  accepts is the ADDITIVE `EditorSessionHistoryListInput`: the contracts
  query plus `usage?` — an options object carrying the caller's
  permitted usages (`EditorSessionHistoryUsageContext`). A bare
  contracts query is valid input that declares no usages.
- Summaries mirror `EditorSessionRecord` field-for-field
  (editorSessionId, editorId, revisionId, mode, integrationLevel,
  openedAt, closedAt?) — no fewer fields, and nothing else: the
  session's `PolicySet` never leaks through the read seam.
- Structural filters: `revisionId`, `editorSessionId`, `openOnly`
  (open = no `closedAt`). Order is newest-first: descending `openedAt`,
  ties broken by descending `editorSessionId` (deterministic on every
  store alike).
- Bounded-query law: `limit` defaults to 50 when absent, is
  hard-capped at 500, and a non-positive/non-integer limit is a typed
  `EditorSessionHistoryQueryError` (the seam never guesses what a
  malformed bound meant). The bound applies to the STORE page read; the
  rights gate then filters that page, so a result MAY be shorter than
  the limit when prohibited sessions occupy early page slots — callers
  needing older permitted sessions narrow the structural filters or
  raise the limit (capped at 500).

### The rights gate (invariant 22 — the C6 read half)

- A session is listed iff AT LEAST ONE usage declared by the caller is
  affirmatively permitted by the session's PolicySet
  (`rights.usages`) AND NO declared usage is prohibited
  (`rights.prohibitions`). A mixed context is judged as a whole: any
  declared prohibited usage hides the session.
- FAIL-CLOSED: a missing or empty usage context lists NOTHING — the
  gate cannot affirm any permission, so the seam refuses by emptiness.
- REFUSAL IS HONEST: filtered-out sessions are simply NOT returned.
  The seam is a read seam, not an authorization oracle — it never
  errors on a rights refusal, never explains an absence, and never
  reveals whether a session exists behind a prohibition. Absence is
  the only signal.
- Holders are not evaluated (usage-class gating only); holder-bound
  authorization is a policy-domain concern above this port.

### The session-history store (durable-capable projection)

- `EditorSessionHistoryStorePort` (domain): `append` (idempotent per
  session id, first write wins), `close` (first close wins; unknown
  session is a typed `UnknownEditorSessionError`), `list` (bounded,
  newest-first, structural filters only — rights gating happens in the
  service, above the store).
- `EditorBrokerDeps.sessionHistory?` — OPTIONAL additive wiring. When
  present, every session the broker opens is appended to the history
  (and an idempotent re-open re-appends the EXISTING record, which
  self-heals a projection that missed the original append). Absent ⇒
  no history is written and broker behavior is unchanged.
- `InMemoryEditorSessionHistoryStore` — fixture-grade, for tests.
- `FsEditorSessionHistoryStore` — REAL durable JSON ledger following
  the W2 `FsArtifactBlobStore` pattern: one pretty-printed record per
  session at `rootDir/<sha256(id)[0:2]>/<sha256(id)>.json`, atomic
  writes (stage under `.tmp`, rename into place), integrity verified on
  EVERY read (parses, required fields present, and the record's
  `editorSessionId` hashes back to the file's own address) with typed
  `EditorSessionHistoryIntegrityError` on any violation — never silent
  corruption. A fresh instance over the same directory reads everything
  earlier instances wrote (real durability).
- Session closure is recorded through the store's `close()`. A
  broker-level close-session flow is future work; the read seam honors
  whatever `closedAt` the durable record carries.

### Wave 3 failure semantics

| Failure                              | Typed error                            |
| ------------------------------------ | -------------------------------------- |
| Malformed history limit              | `EditorSessionHistoryQueryError`       |
| Ledger entry fails integrity checks  | `EditorSessionHistoryIntegrityError`   |
| Close of an unknown session          | `UnknownEditorSessionError`            |

Rights refusal at the READ boundary is deliberately NOT in this table:
it is not an error, it is honest absence.
