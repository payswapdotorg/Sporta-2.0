# sporta-editors

The Editor Broker and external editor adapters.

Invariants that types cannot express:

- Before a session opens: rights, path, capability and read/write scope are verified and a checkpoint exists.
- On save/close: reconcile, hash changed resources, create a new revision, emit an EditDelta, run validation.
- Round-trip support is claimed per adapter and verified; unsupported projects import opaquely.
- An external application's project file is never canonical Sporta state.
- Editor sessions reuse ZCode local/remote workspace facilities.

## Wave 1 implementation notes

- `resolveEditor` is deterministic and explainable: required level
  (export/inspect >= 1, edit/round-trip >= 2), fail-closed license
  classification (unknown licenses never permit), eligible user
  preference first, then highest level with ascending editorId ties.
- `openSession` verifies rights (`usages` must include "edit"),
  revision existence (via the injected ArtifactGraphPort) and adapter
  registration before creating the checkpointed session record.
- `reconcileSession` of a KNOWN (adapter-declared, level >= 2) project
  format commits a new revision whose parent is the session's current
  revision and emits an EditDelta of typed operations; UNKNOWN formats
  import as new OPAQUE artifacts (own first revision, empty operations)
  and never touch the source artifact's lineage.
- Reconciles are idempotent per (editorSessionId, changedProjectHash);
  ids are additionally sha-256-derived deterministically.
- The session store owns a mutable current-revision pointer that only
  advances on understood reconciles (multi-save chains: r1 -> r2 -> r3).
- Everything is in-memory fixture-grade; real editor adapters over ZCode
  workspace facilities are Wave 2.

## Wave 3 implementation notes

- `EditorSessionHistoryService` implements the frozen contracts
  `EditorSessionHistoryReadPort` exactly (bounded
  `listEditorSessions`); its accepted input is the additive
  `EditorSessionHistoryListInput` — the contracts query plus the
  caller's usage context (`usage?: { usages }`).
- The invariant-22 read gate: a session is listed iff at least one
  declared usage is permitted by the session's PolicySet rights and no
  declared usage is prohibited; missing/empty usage context lists
  nothing (fail-closed). Filtered-out sessions are simply not returned
  — the seam never errors on a rights refusal (a read seam, not an
  authorization oracle).
- Bounded queries: default limit 50, hard cap 500, malformed limits
  are typed `EditorSessionHistoryQueryError`.
- The backing store port `EditorSessionHistoryStorePort` has an
  in-memory implementation and a REAL filesystem JSON ledger
  (`FsEditorSessionHistoryStore`, the W2 FsArtifactBlobStore pattern:
  sharded addresses, atomic .tmp+rename writes, read-time integrity
  verification, durability across fresh instances).
- `EditorBrokerDeps.sessionHistory?` is OPTIONAL additive wiring: when
  present, opened sessions are appended to the durable history (the
  idempotent re-open re-appends, self-healing a missed projection).
