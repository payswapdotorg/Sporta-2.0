# P9 Acceptance — Transform Studio, Marketplace and Application Environments

P9 extends the completed P0–P8 release. Do not mark P9 complete from documentation or fixtures alone. Label every claim REAL, FIXTURE or MIXED.

## Pipeline construction and execution

- **P9-01**: Validate typed DAG ports/edges; cycles, unknown ports, missing parameters and incompatible types fail closed.
- **P9-02**: Run a script/deterministic transform without a model in an isolated local worker; run one model node behind a provider-neutral adapter.
- **P9-03**: Every run pins exact manifest, code/model/dependency/runtime digests and a non-secret configuration hash.
- **P9-04**: Event/entity identity, order, timestamps, provenance and uncertainty are preserved where claimed or explicitly marked changed/dropped. No hidden semantic drift.
- **P9-05**: Resource budgets, timeout, cancellation, partial outputs, typed failures/fallback, live back-pressure and disconnect state are observable.
- **P9-06**: Outputs create immutable Artifact Fabric revisions linked to input feed and WorkGraph; prior revisions remain readable.

## Marketplace review and business model

- **P9-07**: Drafts are private and not selectable publicly; submission freezes a candidate digest.
- **P9-08**: Automated checks plus human product/rights/security review are required before public publication.
- **P9-09**: Material code/model/weights/dependency/permission/license/source/runtime changes require a new version and separate review; v1 remains pinned and reproducible.
- **P9-10**: Rejection, change request, suspension, withdrawal and revocation prevent unauthorized new selection while preserving historical records.
- **P9-11**: Free releases pass the same gates as paid releases; paid authorization/settlement retries are idempotent.
- **P9-12**: User sees publisher, approved version, terms/price, rights prerequisites, dependencies, outputs, limitations, cost/latency estimates and evidence grade.
- **P9-13**: Manifest/component digests, SBOM, licenses, secrets and unsafe-dependency checks are recorded before release.

## Rights and source use

- **P9-14**: Invalid/missing rights for the requested use results in refusal or review-required status, never “safe because it looks different”.
- **P9-15**: Input footage authorization, music/graphics, model/dataset licenses and output use are tracked distinctly. A checkbox cannot bypass policy.
- **P9-16**: Visual similarity is only a quality signal or review trigger; it cannot alone grant legal clearance.
- **P9-17**: Output provenance points to source rights scope and pipeline release without guaranteeing legality for every downstream use.

## Application Environment

- **P9-18**: Attach one real local application; grant observation and control separately.
- **P9-19**: Verify the actual app effect and reconcile evidence to the same WorkGraph; failed/disconnected calls never count as success.
- **P9-20**: Revoking/expiring a grant blocks the next action and triggers safe cancellation/checkpoint behavior for active mutations.
- **P9-21**: Malicious app content cannot expand permissions or bypass sandbox policy; logs contain no secrets.
- **P9-22**: Learning consent is separate from app attachment. Without it, activity is not transformed into reusable learning.

## End-to-end release proof

- **P9-23**: One coherent lineage runs creator graph -> review -> feed launch -> derived artifact/event evidence -> attached app action -> verified result.
- **P9-24**: Version 2 requires review; outputs and manifests for v1 do not mutate and active runs never silently switch versions.
- **P9-25**: Real live-feed claims include measured end-to-end latency, buffering/back-pressure, gaps and resource use. If ingress is a fixture, mark MIXED/fixture and do not claim production-live.
- **P9-26**: Storage/provider outages, restore, sandbox refusal and fallback preserve honest status and never fabricate successful outputs.

P9 completion requires TL-measured gates on the exact integration/release SHA with no critical rights/security gap. A hosted provider can remain deferred only when explicitly marked as such; it must not be advertised as live.
