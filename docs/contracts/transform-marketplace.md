# Transform Studio and Marketplace Contract

**Status:** Proposed P9 contract baseline. The TL freezes public names and registers the module before implementation.

## Core records

### TransformPipelineManifest
Immutable pipeline identity/version/digest, publisher, purpose/limitations, typed inputs/outputs, DAG nodes/edges, semantic invariants, expected outputs, pinned transform/model/runtime dependencies, licensing/provenance, per-node permissions, sandbox profile, resource/latency budgets, cancellation/checkpoint behavior, benchmark IDs/results/evidence grade, and policy/retention requirements.

### TransformNode
A typed operation referencing a model, script, deterministic algorithm/filter, existing Sporta capability, or approved Application Environment action. Declares input/output ports, parameter schema, immutable component digest, permissions, runtime profile, resource limits, error/fallback behavior and provenance rules. Models are optional.

### TransformReleaseCandidate
An immutable submitted manifest with hashes for source, model weights, dependencies, runtime image and test material, plus license/source attestations and SBOM/provenance. Behaviorally relevant changes create a new candidate.

### TransformReviewDecision
Durable automated/human review decision tied to release digest, checks, evidence, reviewer roles, policy version, date, rationale and outcome: approved, changes-requested, rejected, suspended or withdrawn.

### TransformListing
Marketplace listing for an approved immutable release: title, description, category, supported feed types, expected outputs, limitations, publisher, status, current approved release, changelog, terms/license, price, compatibility, support and resource/latency expectations.

### TransformEntitlement
Permission for a user/tenant to invoke a release under free/paid terms, with provider-neutral payment/settlement reference, usage limits/expiry if any, idempotency key and revocation status. The payment provider is not the entitlement authority.

### TransformRunManifest
Per-run pinning record: WorkGraph/run refs, input feed/artifact refs and rights snapshot, exact release and component digests, non-secret config hash, granted app capabilities, step results/timing/resource/cost, typed failures/fallbacks, output ArtifactRevision refs, semantic-fidelity evidence, provenance and retention scope.

## Lifecycle and invariants

- Candidate lifecycle: `DRAFT -> SUBMITTED -> AUTOMATED_CHECKS -> HUMAN_REVIEW -> APPROVED -> PUBLISHED`; also `CHANGES_REQUESTED` and `REJECTED`.
- Listing lifecycle: `PUBLISHED -> SUSPENDED | WITHDRAWN | SUPERSEDED`.
- Only approved releases are publicly discoverable/selectable.
- A changed code/model/weight/dependency/permission/license/source/runtime or material default behavior creates a new candidate and repeats review.
- Historical runs stay pinned to the precise release used. Publishing v2 never upgrades a current run or rewrites v1 lineage.
- Listing approval does not automatically authorize every input source or output use; each invocation checks input rights, output use, tenant policy and component rights.
- Security, privacy, retention and provenance propagate to intermediate objects, node execution and output artifacts.
- Nodes return declared outputs through existing services; they cannot directly mutate canonical WorkGraph, marketplace, policy or artifact state.
- Learning from a pipeline or app activity requires independent scoped consent and evaluation.
- Similarity/visual difference alone is never legal clearance.

## Publication quality gates

Review evidence must cover as applicable: graph correctness, error/cancellation behavior, repeatability, event/entity identity and order, timestamps, uncertainty/provenance, output quality, feed throughput/latency/back-pressure, resource budgets, source and component rights, dependency/model licenses, SBOM and digest integrity, security signals, privacy/retention, tenant isolation, network/secret scope and compatibility. Fixture evidence is labeled; passing tests do not replace human review.

## Storage

Sporta owns listing/review/entitlement/run metadata. Source and model bytes are stored behind immutable Artifact Fabric/blob/provider seams. GitHub may host code; Hugging Face Hub or another adapter may host large weights. External stores do not own Sporta approval state.

## User-facing disclosure

Before launch show publisher, approved version, free/paid terms, source-rights requirements, outputs, dependencies, limitations, review date, latency/resource expectations and measured-vs-fixture labels. Never promise copyright safety because an output is visually different.
