# sporta-marketplace

Submission, review, listing, entitlement and suspension state for approved
transform releases (P9).

Invariants that types cannot express (source: ADR + transform-marketplace
contract; lock invariants 26-29, 35):

- Only APPROVED/PUBLISHED releases are publicly discoverable/selectable;
  drafts are private and submission freezes the candidate digest (P9-07).
- Every first publication AND every material update (code/model/weights/
  dependency/permission/license/source/runtime/default behavior) creates a
  new immutable candidate and repeats review; v1 stays pinned and
  reproducible (P9-09).
- Automated checks plus human product/rights/security review are required;
  fixture evidence is labeled and never replaces human review (P9-08).
- Sporta owns approval state. GitHub/Hugging Face/blob providers store
  assets; they never decide what is approved (lock 28).
- Free and paid offerings pass equal gates; entitlement/charge retries are
  idempotent; the payment provider is never the entitlement authority
  (lock 29, P9-11).
- Suspension/withdrawal/revocation block new selection while preserving
  historical run records — history is never falsified (P9-10).
- A new repository commit or model reference never auto-publishes.
- Listing approval does not authorize every input source or output use;
  each invocation re-checks input rights, output use, tenant policy and
  component rights (P9-14/15).
- Similarity/appearance is only a quality signal or review trigger; it can
  never alone grant legal clearance (P9-16, lock 34).
