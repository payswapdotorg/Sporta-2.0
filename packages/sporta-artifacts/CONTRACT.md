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

## Wave 4 implementation notes (W4B-1 — invariant 22 read propagation)

- `ArtifactGatedReadService` (app layer) is the rights-gated artifact
  read seam: `readRevision` / `readArtifact` (manifest) /
  `readRevisionContent` (blob) are DIRECT reads that refuse typed on a
  bare, empty, non-permitted or prohibited usage context and on an
  effective purge disposition; `lineage` is a bounded listing that
  excludes prohibited/expired revisions with honest absence (chain
  gaps possible — a returned `parentRevisionId` may reference an
  excluded revision).
- The gate law (`artifactVisibleToUsage`) and the retention law
  (`artifactRetentionExpired`) are PURE domain functions, exported for
  reuse by declared dependents (sporta-editors' wave-4 write-plane
  check consumes the retention law so both planes share one
  semantics).
- Retention is typed exactly by the `@sporta/policy` vocabulary:
  purge + past `retainUntil` (or no affirmable date — fail-closed)
  refuses/expired; retain/archive never read-refuse; `retainRuns` is
  carried but not evaluated (no run ledger on this plane).
- `ArtifactGraphPort.readArtifact?` is an OPTIONAL additive capability
  (the manifest read): existing port implementations keep compiling;
  absent ⇒ gated manifest reads are a typed
  `ArtifactReadUnavailableError`. The single owner
  `ArtifactGraphService` provides it via its v1 sync accessor.
- The frozen v1 port surfaces and the blob stores are unchanged
  (internal plumbing); enforcement lives at the wave-4 read seam.
- Proven on the REAL W2 `FsArtifactBlobStore` lane (real files, real
  refusals, gate proven to precede the storage touch) with in-memory
  parity; see test/rightsReadGateFs.integration.test.ts (evidence
  classes labeled in the file header).
