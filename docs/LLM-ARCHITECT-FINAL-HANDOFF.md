# Sporta 2.0 — Final Architect Handoff

This repository contains the complete architecture and implementation instructions for the ZCode-to-Sporta conversion.

The implementation target is defined by:

- docs/source-of-truth.md
- docs/architecture/sporta-architecture-lock.md
- docs/architecture/sporta-dependency-graph.md
- docs/architecture/adr-zcode-substrate.md
- docs/architecture/module-migration-map.md
- docs/contracts/
- docs/architecture/editor-integration.md
- docs/architecture/deployment.md
- docs/roadmap/sporta-roadmap.md
- docs/work-orders/sporta-work-orders.md
- docs/testing/sporta-acceptance.md
- docs/agent-handoff/

## Product loop

user intent
-> evidence-backed organization
-> ZCode AgentRuntime execution
-> durable artifact
-> user/manual editor takeover when desired
-> EditDelta
-> permitted learning
-> improved organization

Capability boundary
-> typed CapabilityGap
-> Arena escalation
-> bounded expert session
-> validated result
-> learning artifact
-> organization candidate
-> benchmark
-> promotion

## Non-negotiable

No second runtime authority.
No second task/job authority.
No silent artifact overwrite.
No hidden provider dependency.
No automatic global learning from one intervention.
No unvalidated Arena promotion.
No fabricated infrastructure success.
No acceptance weakening.

## Concurrency

Wave 0: TL only.

Wave 1: Workers A/B/C concurrently.

Wave 2: Workers A/B/C concurrently.

Wave 3: TL integration; workers become fix-only on disjoint acceptance failures.

A new TL must not need this chat, prior chat context, or undocumented assumptions.
