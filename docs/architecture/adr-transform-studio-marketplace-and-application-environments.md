# Accepted Architecture Change — Transform Studio, Transform Marketplace, and Application Environments

**Status:** ACCEPTED FOR IMPLEMENTATION — new post-release feature scope (P9)  
**Date:** 2026-10-13  
**Baseline:** Sporta 2.0 P0–P8 release SHA `1be9b6f07df01a439bfd72b222bcf11857bd2874`  
**Reference:** `payswapdotorg/Epoch-2.0` architecture lock, specifically its generic Application Environment boundary. Sporta reuses the boundary concept; it does not import Epoch state, packages, or runtime.

## Decision

Add a Transform Studio where creators compose, test, version, and submit useful feed-to-output pipelines. Approved releases are listed in Sporta's Transform Marketplace for free or paid use. When launching a prerecorded or live feed, users can choose an approved pipeline.

Also provide generic Application Environment attachments. A user can connect an application to a Sporta workspace/session so the existing ZCode AgentRuntime can use its declared, authorized capabilities similarly to the browser and terminal. Provider-specific apps must not create separate UI surface types or duplicate runtime authority.

This ADR adds architecture and work scope only. P0–P8 remain the released baseline; no P9 implementation or package registration is claimed.

## Product rules

1. **Pipelines are executable products, not research-only model cards.** A pipeline can use a new model, an existing model in a new way, deterministic filters, scripts, an approved application action, or any composition of these.
2. **Typed graph.** A pipeline is a directed acyclic graph with typed input/output ports, configuration schemas, versioned components, digests, permissions, licenses, resource bounds, provenance and expected outputs.
3. **Feed launch is first-class.** For prerecorded or live input, users see pipeline version, rights prerequisites, outputs, limitations, latency/resource estimates and price before launch. Each run pins the exact approved release and configuration.
4. **Semantic/event preservation is measured separately.** Where the pipeline preserves event meaning, its contract declares preservation rules for event/entity identity, order, timestamps, uncertainty and provenance. Changes or dropped data are explicit, not hidden.
5. **No copyright-immunity promise.** A style transfer, model, script, format shift or similarity score cannot by itself authorize copying or guarantee lawful use. Input rights, component licenses, output usage and applicable policy are checked separately. The UI must not claim “copyright-safe” merely because appearance changes. Ambiguous cases are blocked or routed to review.
6. **App-store release process.** Every initial release and every update passes automated checks and human review before becoming public. Behaviorally relevant changes to code, weights, dependencies, permissions, data, licenses or runtime require a new immutable candidate and review.
7. **Sporta owns approval.** A GitHub commit, Hugging Face repository, creator claim, or external platform status never implies Sporta approval. Public listings resolve to reviewed immutable digests. Sporta may suspend/revoke a release without falsifying past run history.
8. **Free and paid offerings share the same gates.** Offers may be free, paid-per-run, or subscription/entitlement based. Entitlement and chargeable-run authorization are checked idempotently. Payments are provider adapters, not marketplace authority.
9. **Applications are scoped environments.** Observation, control/mutation, semantic binding, file transfer and network access are independent capabilities. Grants are user-consented, least-privilege, revocable and scoped to tenant/workspace/session/run.
10. **Reuse ZCode.** Existing AgentRuntime, tool registry, permission/admission, credentials, workspace, browser/terminal and session infrastructure stays authoritative. No Sporta runtime, scheduler or second permission authority.
11. **Learning is separate consent.** Attaching an app or running a pipeline does not automatically authorize learning from app activity or run traces. Learning consent, scope and retention are recorded separately.
12. **Provider-neutral contracts.** No core contract depends on GitHub, Hugging Face, a single model, container runtime, payment provider or external application.

## Authority map

| Concern | Authority |
|---|---|
| Agent turns, generic tools, permissions and execution mechanics | Existing ZCode AgentRuntime/tool/workspace substrate |
| Intent, tasks and run references | Sporta Work / WorkGraph |
| Pipeline graph, composition and transform-run manifest | New `sporta-transforms` module, after TL registration |
| Submission/review/listing/offers/entitlements/suspension | New `sporta-marketplace` module, after TL registration |
| App attachment, grants, capability discovery and action audit | New `sporta-app-environments` module, after TL registration |
| Content bytes, immutable revisions and artifact lineage | Existing Sporta Artifact Fabric |
| Sports-world event semantics and uncertainty | Existing Sporta World |
| Compute scheduling/fallback | Existing Sporta Compute and ZCode execution primitives |
| Rights, privacy and retention | Existing Sporta Policy |
| Internal state of an external app | The external application |
| Human expert escalation | Arena through its existing contract |

## End-to-end flows

### Creator publication

```text
Transform Studio -> typed graph + declared dependencies/permissions
 -> sample feed + benchmarks -> graph/runtime validation
 -> security, provenance, license and rights checks
 -> immutable candidate -> automated gates -> human review
 -> approved release digest -> public listing + price/terms
```

Updates are new immutable versions and repeat the review process. Private drafts may be tested in an isolated non-public environment.

### Feed launch

```text
recorded asset/live feed -> rights and policy check
 -> approved listing + entitlement -> pin release/dependency digests
 -> existing WorkGraph + ZCode runtime + Compute capabilities
 -> outputs + per-step provenance + semantic/event evidence
 -> immutable Artifact Fabric revisions -> user review/export
```

Live runs expose latency, back-pressure, disconnects, gaps and partial output. Switching versions happens at an explicit checkpoint and is recorded as such, never as silent in-place mutation.

### Application attachment

```text
user chooses app -> verify target -> declare capabilities
 -> ask user for scopes -> existing ZCode tool/session boundary
 -> agent performs allowed action -> audit effect/result
 -> reconcile artifacts + WorkGraph -> optional separately consented learning
```

Observation does not grant mutation. A generic Application Environment supports local, remote, browser-hosted and service-backed apps.

## Publication lifecycle

```text
DRAFT -> SUBMITTED -> AUTOMATED_CHECKS -> HUMAN_REVIEW -> APPROVED -> PUBLISHED
                    |                    |
                    +-> CHANGES_REQUESTED +-> REJECTED
PUBLISHED -> SUSPENDED | WITHDRAWN | SUPERSEDED
```

Each release records digest, publisher, declared permissions, license/provenance, SBOM/dependencies, benchmark evidence, reviewer roles, decision and policy version. Only approved releases are publicly selectable. Suspensions stop new runs; old run manifests retain exact historical versions.

## Sandboxing and supply chain

- Treat submitted code, model weights, configs, dependencies and app outputs as untrusted until checked.
- Execute untrusted nodes in an isolated, resource-limited worker/process/container or equivalent sandbox. No host secret access or network egress by default; exceptions are explicit and narrow.
- Pin all code/model/dependency/runtime references by digest. Generate SBOM/provenance and check license compatibility and security signals.
- Never execute creator installation scripts or untrusted model code inside the web/control-plane process.
- Enforce tenant isolation, quotas, cancellation, timeout, CPU/GPU/memory/output limits and cleanup.
- Record exact release digest, config hash, rights/policy snapshot and step provenance per run.
- Credentials use existing vault/permission boundaries and opaque handles. High-impact/destructive/public/purchase/permission actions require confirmation unless narrowly preauthorized.

## Storage and distribution

Do not use GitHub as the marketplace database or default host for large model weights.

- **GitHub:** code, tests, manifests, documentation, small assets, changelogs and immutable source commits.
- **Hugging Face Hub or another model-weight adapter:** large model repositories/weights where licenses and access terms permit. Hugging Face repositories use Git-based version history; its Xet backend is designed for large AI/ML assets and chunk-level deduplication: https://huggingface.co/docs/hub/repositories and https://huggingface.co/docs/hub/en/xet/index.
- **Sporta Artifact Fabric / blob adapter:** canonical digests, release manifest refs, generated outputs and lineage. Filesystem serves local use; an object store such as R2 is a hosted candidate.
- **Sporta records:** authoritative listing, review, pricing/entitlement and suspension state. External asset stores do not decide what is approved.

The storage provider is pluggable. Model licensing, access restrictions and usage constraints must be checked before eligibility.

## Rights and safety boundary

The goal is to make useful new outputs that preserve semantic events—for example a rights-cleared tactical timeline, reconstructed 3D sequence, annotated visualization, or stylized rendering—where the source and intended use permit it.

Sporta must not market a pipeline as a way to evade copyright detection, strip attribution/watermarks, bypass access controls, or make unauthorized footage automatically cleared. Similarity is a quality signal or review trigger, never a legal clearance decision. Source authorization, licenses, purpose, amount used, output market/substitution risk and jurisdictions require separate policy/legal consideration. This is architecture guidance, not legal advice.

References for qualified review:
- U.S. Copyright Office Fair Use Index: https://copyright.gov/fair-use/
- U.S. Copyright Office Fair Use FAQ: https://www.copyright.gov/help/faq/faq-fairuse.html
- Epoch 2.0 Application Environment boundary: https://github.com/payswapdotorg/Epoch-2.0/blob/main/spec/architecture/ARCHITECTURE-LOCK.md

## Implementation sequencing

1. TL-only Wave 0: freeze record names, package roots/owners, dependency rules, sandbox ports, acceptance, architecture-policy entries strategy and baseline gates.
2. Three disjoint workers: A—transform graph/runtime; B—marketplace/review/entitlements; C—app environments and feed/Studio UX.
3. TL serializes shared public contracts, architecture-policy, manifests, lockfile and end-to-end integration.
4. First slice: local prerecorded feed, a deterministic no-model transform, one model adapter, one attached app, free listing and reviewed release lifecycle. Add real live ingress/payment settlement only behind the same tested ports.
5. No new AgentRuntime, task authority, scheduler, artifact authority, permission authority, or unreviewed public code marketplace.
