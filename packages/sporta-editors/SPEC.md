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

| Failure | Typed error |
| --- | --- |
| No eligible editor for the operation | `EditorResolutionError` |
| Rights do not permit editing | `EditorRightsRefusalError` |
| Checkpoint revision unknown | `UnknownRevisionError` |
| Editor without registered adapter | `UnknownEditorError` |
| Session id unknown at reconcile | `UnknownEditorSessionError` |

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
