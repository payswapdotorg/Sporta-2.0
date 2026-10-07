# sporta-artifacts SPEC (Wave 1, Worker B — work order B1)

Status: SPEC — written before implementation.

## Scope

The Artifact Fabric: the single owner of canonical artifact identity and
revision lineage. Durable, content-addressed, lineage-preserving objects.

This Wave 1 implementation is fixture-grade: all state is in-memory inside
the service/adapters, honestly typed, with no persistence, no network and
no filesystem IO. It is real executed domain logic, not a stub.

## Behavior

### recordArtifact(input) -> ArtifactRecord

- Registers an artifact (id, kind, editability, policy).
- Idempotent per `artifactId`: a retry with the same id returns the SAME
  record (first write wins; later fields are ignored — artifacts are never
  mutated once recorded).
- When `artifactId` is absent the service mints a deterministic sequential
  id `art:<n>` (fixture-grade id minting, per-instance sequence).

### commitRevision(input) -> ArtifactRevisionRecord

- Appends an immutable revision to an artifact's lineage.
- Idempotent per `revisionId`: a retry returns the SAME revision record
  (first write wins; the retry never creates a duplicate).
- The referenced artifact must already exist, else `UnknownArtifactError`.
- Parent-chain integrity (all failures are `LineageIntegrityError`):
  - `parentRevisionId` absent is legal ONLY for the first revision of the
    artifact (`artifact-has-revisions` otherwise);
  - `parentRevisionId` must reference an existing revision
    (`parent-not-found`);
  - the parent must belong to the SAME artifact (`parent-foreign-artifact`);
  - a parent may have at most one child — lineage is an ordered chain, so a
    second child is refused (`parent-already-has-child`). Concurrent
    reconciles against the same checkpoint therefore fail loudly instead of
    silently forking history.

### readRevision(revisionId) -> ArtifactRevisionRecord | null

- Returns the stored revision or `null` for an unknown id.

### lineage(artifactId) -> readonly ArtifactRevisionRecord[]

- Returns the revisions of the artifact in chain order (root -> head).
- Unknown artifact -> `[]` (honest empty lineage, not an error).

### Blob store (adapters, separate capability)

- `put(content)`: content-addressed store keyed by sha-256 of the bytes;
  returns the `ContentHash`. A put whose hash already exists with DIFFERENT
  bytes is an integrity error (collision), never a silent overwrite.
- `read(contentHash)`: missing key -> `ArtifactBlobNotFoundError`; stored
  bytes that no longer hash to their content address ->
  `ArtifactIntegrityError` (integrity is verified on EVERY read; corruption
  is always a typed error, never a silent pass).
- `restore(contentHash, content)`: fixture persistence seam — seeds state as
  if previously persisted by an external process, deliberately unverified so
  that read-time integrity checking is observable in tests.

## Single state owner

- `ArtifactGraphService` (app layer) solely owns the in-memory artifact and
  revision maps. No second artifact authority exists anywhere.
- `InMemoryArtifactBlobStore` (adapters layer) solely owns blob bytes.
- The commit timestamp ledger (`committedAt`) is owned by the graph service.

## Invariants

1. Revisions are immutable and append-only; nothing overwrites canonical
   history (the maps only add entries; stored records are never reassigned).
2. Lineage per artifact is a single ordered chain (single root, single
   head, one child per parent).
3. Content-addressed blobs are verified on every read.
4. `EditDelta`-style consumers (sporta-editors) may only extend history by
   calling `commitRevision`; they can never rewrite it.
5. Domain layer is pure: no IO, no `node:` imports, no timers. sha-256
   helpers live in adapters (`node:crypto` is adapters-only).
6. Clocks are injectable (`ArtifactClock`); record timestamps come only
   from the injected clock.

## Failure semantics

| Failure | Typed error |
| --- | --- |
| Commit for an unrecorded artifact | `UnknownArtifactError` |
| Parent chain violation (4 cases above) | `LineageIntegrityError` |
| Blob missing | `ArtifactBlobNotFoundError` |
| Blob content/address mismatch (read, put collision) | `ArtifactIntegrityError` |

All errors extend `ArtifactError` and carry a machine-readable `detail`.

## Event order (commitRevision)

1. idempotency check on `revisionId`;
2. artifact existence check;
3. parent-chain validation against the CURRENT chain;
4. append the immutable revision record;
5. record `committedAt` from the injected clock;
6. return the record.

Validation always precedes mutation; a failed commit leaves no trace.
