# sporta-arena

CapabilityGap intake and the Arena client boundary.

Invariants that types cannot express:

- Escalations are idempotent per idempotencyKey; retries return the original record.
- Only permitted context leaves the tenant boundary; no secrets, unrelated tenant data or chain-of-thought.
- Arena results are always validated before any application; the application decision belongs to Sporta.
- Arena never receives unrestricted live-world access; sessions are isolated capsules.
- Operational result delivery and reusable-learning retention are separate permissions.
