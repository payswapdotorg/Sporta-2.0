# sporta-artifacts

The Artifact Fabric: durable, content-addressed, lineage-preserving artifacts.

Invariants that types cannot express:

- Revisions are immutable and append-only; nothing ever overwrites canonical history.
- Content hashes are verified at read time in adapters (integrity failure is a typed error, not silent corruption).
- Execution-worker loss never destroys canonical user work; storage adapters must be durable or honestly refuse.
- Lineage preserves parent revisions, organization version, tool versions and provenance.

## Wave 1 implementation notes

- `commitRevision` idempotency is first-write-wins per `revisionId`; retries
  return the original immutable record.
- Lineage is a single ordered chain: absent parent only for the first
  revision, one child per parent (forks refused with
  `LineageIntegrityError`).
- The blob store verifies integrity on every read; `restore` is a
  fixture persistence seam (unverified seed, verified on read).
- sha-256 helpers live in the adapters layer only; the domain stays pure.
- Everything is in-memory and fixture-grade; durable storage adapters are
  a Wave 2+ seam over the same ports.
