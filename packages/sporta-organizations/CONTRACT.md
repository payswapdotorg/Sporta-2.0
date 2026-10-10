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

Wave 4 additions (see SPEC.md "Wave 4 — rejection/rollback decision
path"):

- `rejectCandidate` / `rollbackPromotion` (declared on
  `OrganizationDecisionPort`) are the rejection/rollback decision path:
  append-only typed decision records (PromotionRecord, decisions
  "rejected"/"rolled-back") gated exactly like promotion
  (evidence-present, policy-defined) plus prior-promotion for rollback.
- Decision records are immutable once granted; retries are idempotent per
  candidate+decision for identical effective evidence and typed
  immutability refusals otherwise; promote-after-reject and
  promote-after-rollback are typed refusals (register a new version).
- A rollback RETRACTS the entry's promoted flag (the version leaves the
  resolver's candidate set) while keeping the granted promotion record
  (append-only history; `listPromotionRecords` surfaces the full decision
  ledger in grant order).
- Refusal errors are typed: `OrganizationDecisionError` (failed decision
  gates) and the existing immutability/not-found errors. No silent
  fallbacks, no downgrades.
