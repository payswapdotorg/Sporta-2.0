# sporta-work

Semantic owner of Intent -> WorkGraph state.

Invariants that types cannot express:

- The WorkGraph has exactly one canonical owner; no second write path may be accepted.
- Runs execute only through the ZCode AgentRuntime seam (adapters layer); this module never implements its own runtime.
- Appends are idempotent per (workGraphId, nodeId).
- Status transitions: open -> executing -> awaiting-user/escalated -> closed.
- Manual takeover is first-class: a user append is recorded with the same lineage semantics as agent appends.

Wave 1 additions (see SPEC.md for full behavior):

- `seq` is monotonic per graph; idempotent retries never bump it.
- `closed` is terminal: only `evidence` appends are accepted afterwards.
- Escalation edges (`executing -> escalated`, `awaiting-user -> escalated`) are
  explicit lifecycle transitions, not append-driven.
- The append ledger (`WorkGraphLedgerPort`) records actor provenance per node
  because the frozen `WorkGraphNode` record carries no actor field; user
  appends are takeover evidence.
- `AgentRuntimeExecutionPort` is a seam declaration only; the adapter in
  src/adapters is a deterministic fixture simulation, never a runtime.
- Auto `workGraphId`s are content-derived (`wg:<intent-hash>`) and stay
  idempotent; auto `nodeId`s are deterministic per graph state
  (`node:<graphId>:<seq>`) but retry-stability requires an explicit nodeId.

Wave 3 additions (see SPEC.md "Wave 3 — node refs"; ADR:
docs/architecture/adr-wave3-read-seams.md):

- `WorkGraphNode.refs?` is an append-only immutable ledger: refs are never
  removed or rewritten; duplicate (kind, refId) appends are idempotent
  no-ops.
- Only the four produced kinds (`capability-gap`, `escalation`,
  `arena-result`, `artifact-revision`) are appendable, structurally via
  `WorkGraphRefsPort`; `editor-session`/`learning-artifact` refs are other
  lanes' outputs (read-only here).
- v1 graphs without refs stay valid; reads never fabricate a `refs` array.
