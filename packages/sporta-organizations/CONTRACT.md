# sporta-organizations

Semantic owner of organization state (composition, resolution, registry, promotion).

Invariants that types cannot express:

- Organization versions are immutable once promoted; drafts are append-only.
- Resolution is deterministic for identical contexts (no hidden global default).
- Every selection carries an explanation with factors and weights.
- User-specific personalization never silently applies to other users (personalization boundary).
- A model or provider is never itself an organization.

Wave 1 additions (see SPEC.md for full behavior):

- Version numbers are contiguous-monotonic per organizationId (first
  registration is exactly 1; each next is exactly max + 1).
- Promotion is evidence- and policy-gated; the PromotionRecord and the
  promoted version are immutable afterwards (re-promotion is idempotent for
  identical evidence).
- Resolution considers only promoted versions; drafts are Lab material.
- Preference lookups happen only for `context.userRef` — personalization is
  structurally isolated per user.
- `setPreference` is idempotent per userRef: identical signals return the
  stored record unchanged.

Wave 3 additions (see SPEC.md "Wave 3 — promotion history read port"):

- `listPromotionRecords()` is read-only and deterministic (store order);
  the bounded query lives at the consuming Lab read seam, not here.
- `candidateIdFor` is the canonical `<orgId>:<version>` candidate id
  convention, exported for the Lab/evaluation read seams (no second
  convention).
