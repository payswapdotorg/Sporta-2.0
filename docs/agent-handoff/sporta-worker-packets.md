# Sporta 2.0 Worker Packets

## Worker A — Organization Intelligence

Own: sporta-work, sporta-organizations, sporta-lab, sporta-evaluation.

Build the intent-to-organization loop. Learn from user intervention without leaking personal preferences globally.

Do not own ZCode runtime internals, canonical artifacts, editor sessions, Arena transport, root manifests or lockfiles.

Primary proof: deterministic candidate search, explainable selection, replay, personalization isolation, measurable reduction in intervention.

## Worker B — Artifact / Editor / World

Own: sporta-artifacts, sporta-editors, sporta-world, sporta-compute.

Build durable artifacts, revision/round-trip semantics, Editor Broker, initial editor integrations, SWM seams and provider-neutral execution.

Do not own organization-selection semantics, Arena lifecycle, product-wide UX, or root manifests/lockfiles.

Primary proof: round-trip revision preservation, editor provenance, graceful unsupported projects, provider fallback and SWM provenance.

## Worker C — Arena / Product

Own: sporta-arena, product UX modules, deployment/policy integration.

Build CapabilityGap, Arena lifecycle, validated expert results, user takeover controls, learning consent, intent-first product UX, deployment/provider surfaces and rights/privacy propagation.

Do not own Arena internal semantics, organization promotion, canonical artifact store, ZCode AgentRuntime internals, or root manifests.

Primary proof: fresh user flow, idempotent escalation, controlled learning, no Arena direct mutation, truthful infrastructure state.

## Concurrency

Workers run concurrently whenever their dependency prerequisites are satisfied.

Workers must not modify another worker's owned source. A dependency is resolved through an explicit work-order note or public contract, not by crossing ownership boundaries.

The TL may ask workers to create fixtures, interface stubs or contract-consumption tests in their own directories so that integration can proceed without serializing unrelated implementation.

## Worker report location

Each worker maintains a checked-in implementation report under docs/implementation/worker-a.md, worker-b.md or worker-c.md.

Reports are append/update based and contain exact commit SHA references after merge.
