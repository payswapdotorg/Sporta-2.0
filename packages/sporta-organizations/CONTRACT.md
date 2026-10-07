# sporta-organizations

Semantic owner of organization state (composition, resolution, registry, promotion).

Invariants that types cannot express:

- Organization versions are immutable once promoted; drafts are append-only.
- Resolution is deterministic for identical contexts (no hidden global default).
- Every selection carries an explanation with factors and weights.
- User-specific personalization never silently applies to other users (personalization boundary).
- A model or provider is never itself an organization.
