# sporta-work

Semantic owner of Intent -> WorkGraph state.

Invariants that types cannot express:

- The WorkGraph has exactly one canonical owner; no second write path may be accepted.
- Runs execute only through the ZCode AgentRuntime seam (adapters layer); this module never implements its own runtime.
- Appends are idempotent per (workGraphId, nodeId).
- Status transitions: open -> executing -> awaiting-user/escalated -> closed.
- Manual takeover is first-class: a user append is recorded with the same lineage semantics as agent appends.
