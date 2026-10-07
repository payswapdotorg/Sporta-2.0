# sporta-editors

The Editor Broker and external editor adapters.

Invariants that types cannot express:

- Before a session opens: rights, path, capability and read/write scope are verified and a checkpoint exists.
- On save/close: reconcile, hash changed resources, create a new revision, emit an EditDelta, run validation.
- Round-trip support is claimed per adapter and verified; unsupported projects import opaquely.
- An external application's project file is never canonical Sporta state.
- Editor sessions reuse ZCode local/remote workspace facilities.
