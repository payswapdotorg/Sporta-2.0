# sporta-artifacts

The Artifact Fabric: durable, content-addressed, lineage-preserving artifacts.

Invariants that types cannot express:

- Revisions are immutable and append-only; nothing ever overwrites canonical history.
- Content hashes are verified at read time in adapters (integrity failure is a typed error, not silent corruption).
- Execution-worker loss never destroys canonical user work; storage adapters must be durable or honestly refuse.
- Lineage preserves parent revisions, organization version, tool versions and provenance.
