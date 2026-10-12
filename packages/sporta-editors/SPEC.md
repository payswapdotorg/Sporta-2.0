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

## Wave 4 — write-plane rights/retention propagation (W4B-2)

Status: SPEC — written with the implementation (ADR:
docs/architecture/adr-wave4-c6-host.md; the READ half of invariant 22
landed in Wave 3 above — this section is the write-plane half of the
audit's outcome).

### openSession (the OPEN operation)

- The caller-supplied SESSION policy is verified as in Wave 1: its
  rights must permit "edit".
- NEW (the audit's closed gap #1): the CHECKPOINT REVISION's own
  PolicySet must ALSO permit "edit" — a caller-supplied session policy
  can never grant rights the artifact's revision does not carry
  (typed `EditorRightsRefusalError`, detail carrying the revision id
  and the revision's usages/prohibitions).
- NEW (the audit's closed gap #2): the checkpoint revision's retention
  must not be an effective purge disposition (`purge` past its
  `retainUntil`, or with no affirmable deferral date — the artifact
  plane's `artifactRetentionExpired` law, CONSUMED from
  `@sporta/artifacts/contract` so both planes share one semantics).
  Typed `EditorRetentionRefusalError`. A purge NOT yet past its date
  still opens (the deferral is honored).
- A refused open leaves no trace: no session record, no history
  append, no revision.
- The idempotent re-open path (first write wins) returns the existing
  record without re-verification, exactly as before.

### reconcileSession (the APPEND/COMMIT operations)

- Understood path: the new revision carries the session's PolicySet
  VERBATIM (asserted deep-equal in tests) — the propagation chain is
  openSession policy → revision policy, with no layer dropping or
  inventing rights.
- Opaque path: the new imported artifact record AND its first revision
  both carry the session's PolicySet verbatim.
- Structural gap (typed under NEXT DEPENDENCIES, not implemented):
  `EditDeltaRecord` carries no `policy` field — the delta's policy
  context is the session/revision it belongs to; adding a field to
  frozen contracts is a TL serialization decision.
- Policy COMPOSITION (e.g. intersecting a session policy with the
  parent revision's) is deliberately NOT invented here: the policy
  module defines no merge semantics; the broker propagates the session
  policy verbatim.

### Wave 4 failure semantics

| Failure                                                     | Typed error                    |
| ----------------------------------------------------------- | ------------------------------ |
| Session policy rights lack "edit" (Wave 1, unchanged)       | `EditorRightsRefusalError`     |
| Checkpoint revision rights do not permit "edit" (NEW)       | `EditorRightsRefusalError`     |
| Checkpoint revision retention is an effective purge (NEW)    | `EditorRetentionRefusalError`  |

## Wave 6 — live/shared editor sessions (W6A, integration level 3)

Status: SPEC — written before implementation (SPEC-first law). Authority:
docs/architecture/editor-integration.md integration level 3 + its Session
rules section (binding); the frozen Wave 1/3/4 seams are built ON, never
edited (additive-only: new files under `src/domain/sharedSession/`, one
new app service, new stores, and appended `contract.ts` re-exports).

### Scope and seam law

The live/shared session surface: multiple admitted participants editing
one artifact checkpoint through ONE coordinated session with a total
order over broadcast deltas, reconciled back into the canonical artifact
graph on save/close. The level-3 capability is Sporta's coordination
layer COMPOSED over a round-trip (level >= 2) adapter beneath — the
underlying editor session is an ordinary broker session and keeps its
Wave 1/3/4 laws verbatim; adapters declaring native level 3 are future
work (the level-3 record itself carries `integrationLevel: 3` by
construction, citing the resolved round-trip editor).

- Broker, `EditDeltaRecord`, `EditorSessionRecord`, session-history
  seams: FROZEN. The shared session CALLS the broker
  (`resolveEditor`, `openSession`, `reconcileSession`); it never
  reimplements rights, checkpoints, hashing or lineage.
- Domain layer stays pure: no IO, no `node:` imports, no timers.
  Timestamps are `Iso8601` parameters from the injected clock;
  deltas' `deliveredAt` likewise.

### openSharedSession(input) -> SharedSessionRecord

1. Idempotent per `sessionId` (optional input field): a retry returns
   the SAME stored record. Without an id the service mints `ss:<n>`.
   The underlying broker session id is DERIVED deterministically as
   `<sessionId>#es`, so an interrupted open retries onto the same
   broker session (the broker's own idempotency law).
2. `broker.resolveEditor` runs first (operation `round-trip`, level
   >= 2 required — a shared session is useless without round-trip).
   The resolution (editorId, integrationLevel, rationale) is carried
   on the record verbatim (explainable provenance).
3. Admission snapshot: the CHECKPOINT revision's `PolicySet` is read
   via the injected `ArtifactGraphPort` and stored on the record as
   the admission policy, citing `checkpointRevisionId`. Revisions are
   immutable, so the snapshot equals any later read forever.
4. The OPENER is admitted through the SAME admission gate as every
   later participant (below) — the opener is participant #1 and
   never gains rights the checkpoint revision does not carry.
5. `broker.openSession` then applies every Wave 1 + W4B gate
   (session-policy rights, checkpoint-revision rights, retention) and
   creates the checkpoint; a typed editor refusal propagates.
6. OPTIONAL coherence check (only when `historyRead` is wired AND a
   usage context is declared): the freshly opened underlying editor
   session MUST be visible through the rights-gated history read for
   the opener's declared usage — the usage that admits a participant
   must also be able to SEE the editor session whose policy carries
   it. Divergence (e.g. the session policy prohibits a usage the
   context declares, while the checkpoint policy does not) is a typed
   `SharedSessionAdmissionError` (fail-closed). Absent port ⇒ no
   check; absent declared usage ⇒ no check (nothing to cohere).
7. Coordination state is initialized: head = the checkpoint revision,
   empty log, `lastSequence = 0`.

### The admission gate (invariant 22 at the level-3 boundary)

A join request carries the participant id, optional declared
capabilities, and a REQUIRED usage context (`{ usages }`). Admission
is decided against the record's admission policy (the checkpoint
revision's rights) — fail-closed:

1. Absent or EMPTY usage context: `SharedSessionAdmissionError` —
   admits NO ONE (the gate cannot affirm any permission).
2. The context must declare `"edit"`: a shared editing session admits
   editors only (the session-open gate's own law).
3. The checkpoint rights must PERMIT `"edit"` (usages include it,
   prohibitions do not): a participant NEVER gains rights the
   checkpoint revision does not carry.
4. NO declared usage may be prohibited by the checkpoint rights —
   a mixed context is judged as a whole (the Wave 3 read-gate law,
   applied on the write/admission side).
5. Admitted participants carry `effectiveUsages` = declared ∩
   checkpoint-permitted (declaration order preserved) and an
   admission record citing `checkpointRevisionId` (provenance).

### join / leave / presence

- `joinSharedSession`: closed session → `SharedSessionClosedError`;
  unknown session → `UnknownSharedSessionError`. Joining an already
  LIVE participant is idempotent (record unchanged). Re-joining a
  previously left participant re-admits (fresh admission through the
  gate — the same participant id keeps ONE record).
- `leaveSharedSession`: typed reason `"left" | "disconnected" |
  "evicted"` (default `"left"`). First leave wins (idempotent);
  unknown participant → `UnknownSharedParticipantError`. `closed`
  is reserved for the close transition itself.
- Presence is a PURE record per participant: declared capabilities,
  `joinedAt`, `lastHeartbeatAt`, `state: live | left`. Heartbeat
  updates `lastHeartbeatAt` from the injected clock ONLY — no
  timers, no staleness computation, no IO (the semantic is carried,
  liveness policy belongs to hosts above this layer). Closing a
  session leaves every live participant with reason `"closed"`.

### The coordination law (deterministic total order)

Coordination state per session: `headRevisionId`, `lastSequence`,
and the ordered broadcast log. `broadcastSharedDelta`:

1. The broadcasting participant must be admitted AND live (else
   typed `SharedSessionAdmissionError` / `UnknownSharedParticipantError`)
   and the session open (else `SharedSessionClosedError`).
2. IDEMPOTENT DELIVERY: a delta whose `deltaId` is already in the
   log is NOT re-delivered — the existing ordered entry is returned
   with `deduplicated: true` and the log is unchanged (checked
   BEFORE the conflict rule, so a retry after the head moved is
   still an idempotent no-op, never a spurious conflict).
3. CONFLICT REFUSAL: a delta whose `baseRevisionId` differs from the
   session head is refused with `SharedSessionConflictError`
   carrying BOTH divergent revision ids (`sessionHeadRevisionId`,
   `deltaBaseRevisionId`). Never merged, never guessed.
4. Delivery appends with `sequence = lastSequence + 1` — sequences
   are contiguous ascending from 1: the deterministic TOTAL ORDER.
   `sharedSessionLogIsOrdered` asserts the invariant (strictly
   ascending, contiguous, no duplicate delta ids/sequences).
5. The head advances ONLY when a reconcile commits (below); live
   broadcasts never move it.
6. When `deltaSink` is wired, every NEWLY delivered delta (never a
   deduplicated retry) is published to the sink together with the
   live participant ids. Absent sink ⇒ no fan-out, core unchanged.

### saveSharedSession (mid-session reconcile) and head advance

The Wave 1 multi-save law, lifted to level 3: reconcile WITHOUT
closing. The caller supplies the changed (merged) project state,
its content hash, the project format and the external tool; the
service calls `broker.reconcileSession` on the underlying session
(idempotent per `(editorSessionId, changedProjectHash)` by the
broker's own memo) and then advances the coordination head to the
new revision. In-flight deltas based on the OLD head now conflict
(the typed refusal above) — that is the intended semantics: the
head moved, stale bases are refused with both divergent ids.

### reconcileOnClose (the Session rules law)

On close: reconcile, hash, create revision, emit EditDelta, then run
relevant validation —

1. The close memo is checked first: `closeSharedSession` is
   idempotent per `sessionId` (first close wins, retries return the
   identical stored result).
2. `broker.reconcileSession` commits the new revision (parent = the
   broker's current revision for the underlying session) and emits
   the `EditDeltaRecord` with `editor-session` provenance — the
   shared session never builds revisions itself (no second artifact
   authority).
3. VALIDATION (pure, fail-closed, BEFORE any state is written):
   - chain law: the reconciled delta's `fromRevisionId` must equal
     the session head — OR the reconciled revision IS already the
     head (the idempotent re-save of the same reconcile). Anything
     else (e.g. an uncoordinated reconcile outside this service
     advanced the broker's current revision) is a typed
     `SharedSessionConflictError` with both divergent ids; the
     shared session refuses to reconcile onto a head it did not
     advance.
   - total-order invariant: the log's sequences are contiguous
     ascending (else typed `SharedSessionOrderError`).
4. On success: the record closes (`closedAt`), every live
   participant leaves with reason `"closed"`, the head advances to
   the new revision, the close result (reconcile result + broadcast
   summary + participant leave summary) is memoized. The
   invariant-22 propagation is the broker's own verbatim
   session-policy → revision law (Wave 4), asserted at level 3 in
   tests.

### Stores and optional ports

- `SharedSessionStorePort`: the sole owner of shared-session
  records, coordination state and close memos. `saveSession` /
  `saveCoordination` are last-write-wins state transitions;
  `saveCloseResult` is first-write-wins (memo).
- `InMemorySharedSessionStore` — fixture-grade, for tests.
- `FsSharedSessionStore` — REAL durable JSON ledger (the W2
  `FsArtifactBlobStore` pattern): one pretty-printed file per
  session at `rootDir/<sha256(id)[0:2]>/<sha256(id)>.json` holding
  `{session, coordination, closeResult?}`; atomic `.tmp`+rename
  writes; integrity verified on EVERY read (parses, required
  fields present and well-typed, the `sessionId` hashes back to
  the file's own address) with typed `SharedSessionIntegrityError`
  — never silent corruption. A fresh instance over the same
  directory reads everything earlier instances wrote.
- `SharedDeltaSinkPort` (optional, additive): live fan-out.
- `historyRead?: EditorSessionHistoryReadPort` (optional,
  additive, the W4-B pattern): the coherence check above. Existing
  signatures are untouched; both ports are opt-in.

### Idempotency summary

| Operation     | Key                                        |
| ------------- | ------------------------------------------ |
| open          | `sessionId` (record) + derived `<id>#es`   |
| join (live)   | `(sessionId, participantId)` no-op         |
| leave         | first leave wins                           |
| broadcast     | `deltaId` (deduplicated)                   |
| save          | broker memo `(editorSessionId, hash)`      |
| close         | close memo per `sessionId` (first wins)    |

### Wave 6 failure semantics

| Failure                                            | Typed error                      |
| -------------------------------------------------- | -------------------------------- |
| Usage context absent/empty or lacks "edit"         | `SharedSessionAdmissionError`    |
| Checkpoint rights do not permit the context       | `SharedSessionAdmissionError`    |
| Coherence: usage cannot see the editor session    | `SharedSessionAdmissionError`    |
| Non-live participant broadcasts                   | `SharedSessionAdmissionError`    |
| Delta base revision != session head               | `SharedSessionConflictError`     |
| Reconcile onto a head the service did not advance | `SharedSessionConflictError`     |
| Operation on a closed session                     | `SharedSessionClosedError`       |
| Unknown session id                                | `UnknownSharedSessionError`      |
| Unknown participant id                            | `UnknownSharedParticipantError`  |
| Broadcast log violates the total-order invariant  | `SharedSessionOrderError`        |
| FS ledger entry fails integrity checks            | `SharedSessionIntegrityError`    |

All extend `EditorError` (machine-readable `detail` preserved).

### Evidence grades

- Pure-domain laws: fixture-grade by construction (no IO at all).
- Service laws: in-memory stores + fixture adapters (labeled FIXTURE).
- REAL lane: `FsSharedSessionStore` on a real temp dir, real
  content-addressed blob store, real revision chain, real MLT XML
  through the REAL `KdenliveAdapter`, reconciled through the REAL
  broker — measured (files, bytes, wall time), labeled REAL.

### Wave 6 implementation addenda (written with the implementation)

- Delta ids: when a broadcast carries no caller-supplied `deltaId`, the
  service derives one content-addressed over
  `(sessionId, participantId, baseRevisionId, operations)` — identical
  resubmissions dedupe by construction. Caller-supplied ids remain the
  explicit idempotency key (the broker's `es:<n>` minting caveat does
  not apply).
- Validation order at save/close: the broker's `reconcileSession` is
  the frozen session-rules law and commits its revision BEFORE the
  shared-session validation runs (the broker's own writes are legal and
  append-only). "Before any state is written" therefore means the
  SHARED-SESSION state: a validation refusal (divergence detection)
  writes no session/coordination/close-memo state — the shared session
  stays open and refuses to adopt the moved head.
- `SharedSessionHistoryReadPort` (the additive consumption shape for
  the optional `historyRead` dep): the wave-3
  `EditorSessionHistoryListInput` signature, which
  `EditorSessionHistoryService` satisfies structurally — the frozen
  contracts port is untouched.

## Wave 6 — round-trip expansions (W6B, integration level 2)

Status: SPEC — written before implementation (SPEC-first law).
Authority: docs/architecture/editor-integration.md (integration
levels + initial ecosystem: Godot = interactive/game/tactical,
Inkscape = vector, Audacity = audio) and the KdenliveAdapter
level-2 precedent (parse/serialize laws, unknown-element honesty,
typed format errors, `deriveOperations` contract). Additive-only:
new files under `src/adapters/` + tests + appended `contract.ts`
re-exports; the broker, the domain layer and every frozen surface
are untouched (`KdenliveFixtureAdapter`/`MysteryAppFixtureAdapter`
stay for fixture tests). Node stdlib only.

### Scope

Three REAL level-2 adapters, each round-tripping the REAL text
document format of its editor:

- `InkscapeAdapter` — SVG 1.1 (`image/svg+xml`), editorId
  `inkscape`, licensing GPL-3.0.
- `GodotTscnAdapter` — Godot text scene `.tscn`
  (`application/x-godot-scene`, `.tscn`), editorId `godot`,
  licensing MIT.
- `AudacityAupAdapter` — Audacity 2.x legacy XML project `.aup`
  (`application/x-audacity-project`), editorId `audacity`,
  licensing GPL-2.0+.

All three implement `EditorAdapterPort` exactly (editorId /
editorVersion / integrationLevel 2 / licensing /
knownProjectFormats / deriveOperations) and are wired into callers
through the EXISTING broker injection seam
(`EditorBrokerDeps.adapters`) — the broker itself is never edited.

### Shared laws (the KdenliveAdapter shape, verbatim)

- parse produces a canonical typed state; serialize emits a
  well-formed document canonically; `parse(serialize(parse(doc)))`
  equals `parse(doc)` (deep equality) and
  `serialize(parse(serialize(x)))` equals `serialize(x)` byte-identically
  (fixed point from the second pass — first-pass normalization of
  semantically inert surface details is documented per adapter).
- Elements/sections/properties the adapter does not model are
  CARRIED OPAQUELY as raw source fragments and re-emitted
  byte-identically — never guessed, never dropped.
- A document that is not the expected format (wrong root, wrong
  first section, malformed markup) is a TYPED error of that adapter
  (`InkscapeSvgError` / `GodotTscnError` / `AudacityAupError`, all
  extending `EditorError` with a machine-readable `detail`) naming
  the failure point — never a raw `SyntaxError`, never a guess.
- `deriveOperations(projectState)` derives typed `set` operations
  with sha-256 value hashes: granular paths for the adapter's own
  state shape, honest top-level carry for other object states,
  nothing for non-objects.
- File-size law: every file <= 400 lines; parser/serializer
  machinery lives in per-format modules separate from the adapter
  classes.

### InkscapeAdapter — SVG 1.1 understanding model

Understood: the `<svg>` root (ALL attributes preserved verbatim —
`xmlns`, `xmlns:inkscape`, `width`/`height`/`viewBox` root geometry
and any others), direct root children IN DOCUMENT ORDER (SVG paint
order is semantic), `<g inkscape:groupmode="layer">` layers
(`inkscape:label`, `id`, remaining attributes) with their children
in document order, and hollow `<path>` elements inside layers
(explicit `id`, the `d` data carried verbatim, remaining
attributes preserved). Serialization guarantees the XML declaration
and a root carrying at least `xmlns` (SVG 1.1) and
`xmlns:inkscape` (added with their standard values only when the
state does not already carry them) and emits layers as
`<g inkscape:groupmode="layer" inkscape:label="...">` groups with
stable element ids. Everything else (any non-layer element at any
depth the adapter does not model — `rect`, `text`, `defs`,
`metadata`, `sodipodi:namedview`, nested groups, non-hollow
paths…) is carried as an opaque raw fragment. Normalizations
(semantically inert, XML attribute order and whitespace): root
attribute emission order (namespaces first, then the preserved
insertion order), indentation, the `id`-first attribute order on
modeled paths, missing `inkscape:label` on a layer group becomes
`inkscape:label=""`. XML prolog DOCTYPE/comments are not carried
(the Kdenlive precedent law). Stray non-whitespace character data
inside `<svg>` or a layer `<g>` (element-only positions in every
real document) is a typed refusal.

### GodotTscnAdapter — .tscn understanding model

Understood: the `[gd_scene ...]` header (all attributes as parsed
Godot literals — `load_steps`, `format`, `uid`, …),
`[ext_resource ...]` sections (all attributes as literals:
`type`, `path`, `id`), `[sub_resource ...]` sections (attributes
plus `key = value` properties), `[node name="..." type="..."
parent="..."]` sections (attributes plus properties) with the node
order and `parent` paths preserved (the node tree is the ordered
section list; `parent` is absent for the scene root, `"."` for
root-level children, a path for deeper nodes). Property values
are parsed as TYPED Godot literals: int/float (VERBATIM literal
strings — JS numbers corrupt int64 and exotic float forms, so the
lossless representation is the validated literal itself), bool,
string (unescaped), null, `Vector2(x, y)`, `NodePath("...")`,
`ExtResource("id")`, `SubResource("id")`, arrays `[a, b]`,
dictionaries `{k: v}`; any other literal (Color, Transform2D, …)
is carried as an OPAQUE verbatim literal, never guessed. Unknown
top-level sections (e.g. `[connection]`, `[editable]`) are carried
as opaque raw section fragments and re-emitted byte-identically.
Values are single-line (the Godot text-resource emitter never
wraps values) — a value line that does not parse completely is a
typed `GodotTscnError` naming the section and 1-based line. The
document must begin with `[gd_scene`; a non-`gd_scene` first
section (e.g. `.tres` `[gd_resource]`) is a typed refusal.
Normalization: sections separated by one blank line, canonical
`Vector2(x, y)`/array/dictionary spacing.

### AudacityAupAdapter — .aup understanding model

Understood: the `<project>` root (ALL attributes preserved —
`projname`, `rate`, `snapto`/`selection*`, …) with children in
document order, the `<tags>` block (each `<tag name="...">text`
pair; `name` required), `<wavetrack>` elements with their
attribute records (`name`, `channel`, `rate`, `offset`, `gain`,
`linked`, …) and children in order, `<waveclip offset="...">`
(attribute record) containing one modeled `<sequence ...>`
(attribute record, e.g. `maxlen`), whose `<waveblock>` children
carry the REQUIRED `start` attribute (typed refusal when absent —
malformed in every real document) plus the modeled file-reference
child: `<simpleblockfile filename="...">` or `<aliasblockfile
summaryfile="..." aliasfile="...">` with all attributes preserved.
The external sample data those references point at stays external
— the .aup document is the adapter's format, exactly the
Kdenlive-MLT law (an .aup without its sample blocks on disk is
still a legal document; binary sample data is NEVER fabricated).
Everything else is carried opaquely as raw fragments (including
unknown children inside modeled containers). Non-`<project>` root
is a typed refusal; malformed XML is a typed `AudacityAupError`
naming the offset.

### Wave 6 failure semantics (round-trip expansion)

| Failure                                        | Typed error            |
| ---------------------------------------------- | ---------------------- |
| SVG: non-`<svg>` root / malformed markup       | `InkscapeSvgError`     |
| SVG: stray text in element-only positions      | `InkscapeSvgError`     |
| SVG: serialize of a non-SVG state              | `InkscapeSvgError`     |
| tscn: first section is not `[gd_scene`         | `GodotTscnError`       |
| tscn: malformed section/property/line         | `GodotTscnError`       |
| tscn: serialize of a non-scene state           | `GodotTscnError`       |
| aup: non-`<project>` root / malformed markup   | `AudacityAupError`    |
| aup: waveblock without `start`                 | `AudacityAupError`    |
| aup: serialize of a non-project state          | `AudacityAupError`    |

All extend `EditorError` (machine-readable `detail` preserved).

### Evidence grades (the packet's labeling law)

- REAL: every round-trip lane test writes serialized bytes to a
  real temp workspace directory (the editor-integration.md session
  seam — one real temp dir per session, removed on dispose), reads
  them back with `node:fs`, re-parses, re-serializes and proves
  export->import->export byte stability with real diffs; ids,
  provenance and the external-reference chain are asserted against
  the file bytes on disk.
- FIXTURE (labeled): broker-level smoke wiring (in-memory stores,
  fixture artifact graph) — the resolution/level-2 honoring of the
  REAL adapters through the REAL `EditorBrokerService` constructor
  seam, without editing the broker.

## Wave 6 — Worker C (w6c): live/shared expansions (P7)

Additive to the frozen w6a level-3 core. ZERO edits to `session.ts`, `presence.ts`,
`coordination.ts`, `errors.ts`, `ports.ts`, or `SharedEditorSessionService.ts`. New public
names are APPENDED to `contract.ts`; every frozen name still exports (surface check holds).
No new cross-module edges; no new dependencies (node stdlib only). Files are split per the
file-size law (< 400 lines each).

### W6C-1 — REAL stdlib WebSocket transport delta-sink (`adapters/wsSharedDeltaSink/`)

REAL RFC 6455 over `node:http` + `node:crypto` + `node:net`. No third-party libraries.

- Handshake law: `Sec-WebSocket-Accept = base64(SHA1(Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))`;
  version 13 only; the client key must decode to exactly 16 canonical base64 bytes;
  `Connection: Upgrade` + `Upgrade: websocket` required; non-upgrade requests on the port
  are answered `426 Upgrade Required`; failed upgrades are answered with an honest status
  (400/404/426) and the socket destroyed.
- Frame law: FIN/opcode/mask/len with 126 (uint16) and 127 (uint64) extended lengths, parsed
  incrementally (partial frames wait; multiple frames per chunk decode in order).
  Client→server frames MUST be masked; an unmasked client frame is a protocol error → close 1002.
  Server→client frames MUST NOT be masked. RSV bits set (no negotiated extension) → 1002.
  Non-minimal length encodings → 1002. Control frames (close/ping/pong): FIN=1, payload ≤ 125,
  never fragmented; violations → 1002. Unknown opcodes → 1002.
- Caps: frame payload cap (default 1 MiB) and assembled-message cap (default 1 MiB). A header
  claiming more → close 1009 WITHOUT buffering the body. Fragmented messages are assembled;
  a new data frame during fragmentation → 1002.
- Text law: text payloads are strict UTF-8 (invalid → close 1007). The delta protocol is
  text-only; binary data frames are read and ignored by design. Close codes on the wire are
  validated (1000–4999; reserved 1004/1005/1006/1015 rejected → 1002; 1-byte close payload → 1002);
  a received close is echoed (no-status → echo 1000); server shutdown closes clients with 1001.
- Sink law: `deliver(serializedDelta)` fans out ONE text frame per connected client, awaiting
  kernel flush per client (sequential, receipt order = sorted connection-id order); receipts are
  recorded PER CLIENT (bounded history, default last 128); ZERO clients = zero deliveries, NOT an
  error. `listen(0)` binds an OS-assigned port and reports the ACTUAL bound port read back from
  the OS. `close()` sends 1001 to every client, then stops the listener and resolves only after
  sockets are down.
- A stdlib test CLIENT is exported (`connectWs`): client-side masking is REQUIRED (RFC 6455 §5.1),
  it verifies the accept hash (a dishonest handshake fails loudly), and it reports the server's
  close frame separately from its own.
- File split (file-size law): `frameCodec.ts` / `handshake.ts` / `wsServer.ts` / `wsClient.ts` /
  `wsSharedDeltaSink.ts`.

### W6C-2 — presence staleness policy (`domain/sharedSession/staleness/`)

Host-level, ABOVE the pure heartbeat record; `presence.ts` is untouched. Pure, deterministic,
no clock reads, no I/O. Thresholds are explicit records (`StalenessPolicy`), never ambient globals.

Classification law, with `ageMs = nowMs - lastHeartbeatAtMs`:
- missing heartbeat record → **EXPIRED** (fail-closed; threshold: `expiredAfterMs`; `ageMs: null`)
- `ageMs < staleAfterMs` → **FRESH** (threshold: `staleAfterMs`)
- `staleAfterMs <= ageMs < expiredAfterMs` → **STALE** (threshold: `expiredAfterMs`)
- `ageMs >= expiredAfterMs` → **EXPIRED** (threshold: `expiredAfterMs`)

Boundary instants are inclusive on the LATER class: `age == staleAfterMs` is STALE,
`age == expiredAfterMs` is EXPIRED. A negative age (heartbeat ahead of `now`) falls in the FRESH
branch by pure comparison — documented, deterministic. Every decision carries the participant id,
the measured age, and the threshold used. `expiredAfterMs >= staleAfterMs >= 0`, both finite;
violations throw `InvalidStalenessPolicyError` (threshold ordering is a record property).
`stalenessSnapshot(participants, nowMs, policy)` is the composition the service layer MAY call;
decisions preserve input order; counts are derived. The frozen service is NOT edited.

### W6C-3 — rebase-on-conflict for REFUSED stale deltas (`domain/sharedSession/rebase/`)

Additive, pure, I/O-free recovery for deltas the frozen coordination domain REFUSED as stale.

- Input: the refused delta (with its stale base revision), the ordered delta log that advanced
  the head past that base, and the current head revision.
- Output is TOTAL (three-kind union, never a throw for domain reasons, never a silent drop,
  never a fake apply): `rebased` | `not-expressible` (typed `RebaseNotExpressibleError` naming
  the conflicting log entry) | `invalid-input` (typed `RebaseInvalidInputError`).
- Rebase incompatibility law: each delta may declare a touch surface (opaque coordinate tokens).
  A rebase is expressible iff NO intervening log entry's surface intersects the refused delta's.
  An ABSENT surface on either side is UNKNOWN and refuses (fail-closed). `'*'` is a wildcard
  intersecting everything. The FIRST conflicting entry in LOG ORDER is named (`entryId` if
  present, else `revision:<n>`).
- Validation law: integers required; `baseRevision > headRevision` → invalid; `baseRevision < head`
  with an empty log → invalid (`log-does-not-cover-intervening-revisions` — silently re-basing over
  unknown history would be a fake apply); log must be strictly ascending with every revision in
  `(base, head]`. `baseRevision == headRevision` with an empty log is the trivial rebase.
- Determinism: same inputs → same outcome (no clock, no randomness). Idempotence: re-applying
  rebase to an already-rebased delta against an empty intervening log at the same head leaves
  `(baseRevision, payload)` identical with an empty applied-revision list.
- `reanchor` is a caller-supplied PURE transform `(payload, appliedLog) => payload`; no transform
  means identity re-anchor (valid when surfaces are disjoint). A throwing reanchor is a caller
  programming error and propagates.

### W6C-4 — product shared-session projection (read-only takeover UX wiring)

- READ-ONLY: the projection never mutates session state; the level-3 editors service remains the
  sole writer.
- Optional-port pattern (W4-B): an absent `SharedSessionHistoryReadPort` yields an EMPTY
  projection (`wired: false`, empty list, not-found detail) — never a crash, never a throw.
- `withSharedSessions(view, list)` is a pure combiner; `productLoopProjection.ts` is NOT edited
  this wave (the combiner is consumed additively by callers).
- Product gains NO new dependencies; the registered `@sporta/editors` edge is used as-is.
- REAL lane proves the read-back over real `FsSharedSessionStore` + real service lifecycle
  (open → join → broadcast → save → close); FIXTURE lanes prove the absent-port and fake-port paths.

### Additive contract exports (w6c)

`StalenessClass, StalenessPolicy, StalenessRecord, StalenessDecision, StalenessSnapshot,
classifyStaleness, stalenessSnapshot, validateStalenessPolicy, participantRecord,
MISSING_HEARTBEAT_REASON, InvalidStalenessPolicyError, RebaseDeltaInput, RebaseLogEntry,
RebasedDelta, RebaseOutcome, RebaseNotExpressibleReason, RebaseInvalidReason, rebaseDelta,
RebaseNotExpressibleError, RebaseInvalidInputError, WsSharedDeltaSink, WsSharedDeltaSinkOptions,
WsDeliveryReceipt, WsDeliveryRecord, connectWs, WsTestClient, WsCloseInfo, ConnectWsOptions`

## Wave 7 — Worker C (w7c): WS transport origin/token auth (SPEC-first)

Additive to the frozen w6c-1 transport. ZERO edits to `frameCodec.ts` or any
domain file; `handshake.ts`/`wsServer.ts`/`wsClient.ts`/`wsSharedDeltaSink.ts`
gain STRICTLY ADDITIVE OPTIONAL options/params only (every frozen test stays
green — absent auth config is byte-compatible with w6c behavior). New public
names are APPENDED to `contract.ts`. Runtime law unchanged: node:test + tsx
(bun does not deliver http 'upgrade' events).

### W7C-3 — origin allow-list + shared-token auth (`adapters/wsSharedDeltaSink/wsAuth.ts`)

The W6-C NEXT #1 security item. `WsServer` (and `WsSharedDeltaSink`, which
passes it through) gains an OPTIONAL `auth` config:

```ts
interface WsUpgradeAuthConfig {
  readonly allowedOrigins: readonly string[]; // exact-match allow-list
  readonly sharedToken: string;               // offered as the single subprotocol
}
```

- ABSENT auth config = the documented DEV-MODE law: current behavior exactly
  (localhost dev; any origin, no token). This is a documented posture, never
  an accident.
- PRESENT auth config = FAIL-CLOSED. Both checks run BEFORE the 101 handshake
  response is written, so a refused upgrade is an honest HTTP status and the
  connection NEVER frames (no WebSocket frame is ever sent — the socket is
  destroyed after the HTTP failure response):
  1. ORIGIN: the `Origin` request header must EXACTLY match one entry of
     `allowedOrigins` (case-sensitive string equality — no parsing, no
     wildcard, no normalization; the fail-closed posture). A missing Origin
     header is REFUSED (403 `missing Origin header`) — non-browser clients
     must send it too.
  2. TOKEN (the RFC-honest mechanism — browsers cannot set custom headers on
     WebSocket, so the token rides `Sec-WebSocket-Protocol` per RFC 6455
     §4.2/§4.2.2): the request must offer EXACTLY ONE subprotocol and it must
     equal `sharedToken`, compared in CONSTANT TIME (sha-256 digests +
     `crypto.timingSafeEqual` — no length leak). On success the server ECHOES
     the subprotocol in the 101 response (RFC 6455 §4.2.2 — the client can
     verify auth was actually applied); the stdlib test client verifies the
     echo and fails loudly on a dishonest handshake.
  - Rejections: wrong/missing origin → 403; missing/multiple/mismatched
    subprotocol token → 401. Every rejection is answered with the honest
    HTTP status + the `X-Sporta-Upgrade-Rejection` reason header (the w6c
    failure-response wire format), then the socket is destroyed.
- Config validation is typed and fail-closed (`WsAuthConfigError` extends
  `EditorError`): `allowedOrigins` must be non-empty and every entry a
  non-empty origin-shaped string (`scheme://host[:port]`, no whitespace);
  `sharedToken` must be 16–256 chars of `[A-Za-z0-9_-]` (a safe RFC 7230
  token charset, comma-free so it can never smuggle a second subprotocol).
- Observability: `WsServerHandlers.onAuthRejection?(rejection, req)` — hosts
  may audit refusals; it fires only when auth is configured and a request is
  refused (never for dev-mode connections).
- The stdlib test client (`connectWs`) gains additive options `origin`,
  `token` (sends `Origin` + the single `Sec-WebSocket-Protocol: <token>` and
  verifies the echo) and `subprotocols` (the raw multi-offer form, for the
  fail-closed rejection lanes).
- REAL test lanes: allowed origin+token connects and a delta frames
  end-to-end; wrong origin refused (403, zero server connections); wrong
  token refused (401, zero server connections); missing origin refused
  (403); multiple offered subprotocols refused (401); absent auth config
  stays open with the plain client (the backward-compat law); config
  validation fail-closes.

### Additive contract exports (w7c)

`WsUpgradeAuthConfig, UpgradeAuthRejection, UpgradeAuthKind, WsAuthConfigError,
authorizeUpgrade, offeredAuthProtocol, timingSafeTokenEqual`
