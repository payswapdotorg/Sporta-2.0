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

| Failure                                             | Typed error                 |
| --------------------------------------------------- | --------------------------- |
| Commit for an unrecorded artifact                   | `UnknownArtifactError`      |
| Parent chain violation (4 cases above)              | `LineageIntegrityError`     |
| Blob missing                                        | `ArtifactBlobNotFoundError` |
| Blob content/address mismatch (read, put collision) | `ArtifactIntegrityError`    |

All errors extend `ArtifactError` and carry a machine-readable `detail`.

## Event order (commitRevision)

1. idempotency check on `revisionId`;
2. artifact existence check;
3. parent-chain validation against the CURRENT chain;
4. append the immutable revision record;
5. record `committedAt` from the injected clock;
6. return the record.

Validation always precedes mutation; a failed commit leaves no trace.

## Wave 4 — rights/retention propagation on artifact reads (W4B-1)

Status: SPEC — written with the implementation (ADR:
docs/architecture/adr-wave4-c6-host.md, decisions 1+2 are the
authority; the gate law mirrors the ratified W3-B
`sessionVisibleToUsage` pattern in
packages/sporta-editors/src/domain/history.ts).

### The usage-context gate (invariant 22 — the artifact-plane read half)

- Every gated read surface accepts an OPTIONAL caller-declared usage
  context (`ArtifactReadUsageContext.usages`, mirroring the
  `RightsScope.usages`/`prohibitions` vocabulary). A bare input
  declares no usages and the gate is FAIL-CLOSED.
- Gate law (`artifactVisibleToUsage`, pure): a record is visible iff
  AT LEAST ONE declared usage is affirmatively permitted by the
  record's `policy.rights.usages` AND NO declared usage is in
  `policy.rights.prohibitions` (a mixed context is judged as a whole).
- Holders are not evaluated (usage-class gating only); privacy
  `visibility`/`exportableFields` are carried verbatim but not
  evaluated at this seam (no tenant/session identity in the usage
  context — a caller-boundary gate is a policy-domain concern above
  this port).

### Surface-by-surface law (the W3-B page-vs-scan tradeoff, mirrored)

| Surface             | Kind    | Prohibited / expired handling                                            |
| ------------------- | ------- | ------------------------------------------------------------------------ |
| `readRevision`      | direct  | TYPED `ArtifactRightsRefusalError` / `ArtifactRetentionExpiredError`      |
| `readArtifact`      | direct  | TYPED refusals (the manifest read gates on the artifact record's policy)  |
| `readRevisionContent` | direct | TYPED refusals; the gate runs BEFORE any storage touch                   |
| `lineage`           | listing | HONEST ABSENCE — prohibited/expired revisions are simply not returned    |

- Direct reads reserve `null` for genuinely unknown ids — never for
  prohibited content (no silent filtering where a direct read is
  requested).
- The lineage listing is bounded (default 50, hard cap 500, malformed
  limits are a typed `ArtifactReadQueryError`) and head-anchored: the
  bound applies to the chain WINDOW, the gate then filters that window,
  so a result MAY be shorter than the limit (the W3-B tradeoff).
  Because excluded revisions can sit mid-chain, the returned chain can
  show GAPS: a `parentRevisionId` may reference a revision the caller
  was not permitted to see. Absence is the only signal — the listing
  never errors on a rights refusal.
- The frozen v1 port surfaces (`ArtifactGraphPort.readRevision`/
  `lineage`, `ArtifactBlobStorePort.read`, the service's sync
  `readArtifact` accessor) are the internal storage plumbing and stay
  UNCHANGED (the additive law: existing wiring compiles and behaves
  identically). Rights enforcement lands at this wave-4 read seam;
  product planes consume the gated seam.

### Retention (typed exactly by the @sporta/policy vocabulary)

- `retain` and `archive` dispositions never expire at the read
  boundary: the policy vocabulary types no read refusal for them.
- `purge` becomes effective strictly AFTER `retainUntil` ("ISO-8601
  date after which the disposition applies"); at the exact boundary
  instant it has not yet applied. Direct reads then refuse typed
  (`ArtifactRetentionExpiredError`); listings exclude.
- FAIL-CLOSED: a purge decision with no `retainUntil` (or an
  unparseable one, or an unparseable clock `now`) is treated as already
  effective — the seam must not resurrect purged content on a
  technicality.
- `retainRuns` is carried verbatim but NOT evaluated: this plane owns
  no run ledger, so an honest run count does not exist here (typed in
  the wave-4 worker report NEXT DEPENDENCIES).

### The blob read boundary (content)

- Content-addressed blobs carry NO `PolicySet`; the rights boundary
  for content is the REVISION record that references the content hash.
  `readRevisionContent` gates on the revision's policy, then reads the
  blob (read-time integrity verification stays the store's law; typed
  store errors propagate).
- The gate precedes the storage touch: a prohibited or expired content
  read never reaches the blob store.
- `blobs` is OPTIONAL wiring: absent ⇒ content reads are a typed
  `ArtifactReadUnavailableError` (graceful degradation, never a silent
  pass). Same for a graph without the optional wave-4 manifest-read
  capability.

### Gate order

Rights first, then retention (a caller who is not permitted never
learns the retention state; a permitted caller learns the content is
past its purge date).

### Wave 4 failure semantics

| Failure                                            | Typed error                      |
| -------------------------------------------------- | -------------------------------- |
| Direct read, bare/empty/non-permitted/prohibited   | `ArtifactRightsRefusalError`     |
| Direct read / listing member past purge date       | `ArtifactRetentionExpiredError`  |
| Malformed lineage limit                            | `ArtifactReadQueryError`         |
| Content/manifest capability not wired              | `ArtifactReadUnavailableError`   |

Listing-surface rights/retention refusals are deliberately NOT
errors: they are honest absence.
