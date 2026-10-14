# Sporta 2.0 Roadmap

## P0 — Repository conversion

Sporta identity, source-of-truth documents, ZCode-substrate ADR, architecture governance and module boundaries.

## P1 — Execution foundation

WorkGraph, IntentSpec, Organizations, Artifact Graph, Editor Broker, SWM seams, CapabilityGap, Arena client.

## P2 — Autonomous loop

intent -> organization -> AgentRuntime -> artifact, with evidence-backed candidate selection.

## P3 — Human takeover

user takeover -> EditDelta -> learning candidate -> reduced future intervention.

## P4 — Arena

CapabilityGap -> Arena -> expert -> validated result -> learning.

## P5 — Organization evolution

LearningArtifact -> candidate organization -> benchmark -> promotion/rollback.

## P6 — Sports production

authorized media -> perception -> SWM -> tactical/3D/anime and additional realities -> playback.

## P7 — Editor ecosystem

round-trip and live/shared integrations.

## P8 — Production hardening

provider fallback, durable artifacts, persistent workers, rights/security/privacy, local install, hosted preview and product acceptance.

## P9 — Transform Studio, Transform Marketplace and Application Environments (new post-release feature)

- Visual pipeline builder for typed feed-to-output DAGs combining models, scripts, deterministic transforms and approved app capabilities.
- Free/paid marketplace of useful executable pipelines; every release/update goes through automated checks and human review before public availability.
- Users select a reviewed pipeline for prerecorded/live feed launch; release dependencies are pinned and output lineage + event-semantic evidence are retained.
- Users attach authorized apps to Sporta workspaces and let agents use declared app capabilities through existing ZCode runtime/session/tool boundaries.
- Sandboxing, rights/provenance/license, privacy/retention, price/entitlement, event fidelity and live latency/back-pressure checks are mandatory.
- P9 is not complete until the dedicated acceptance matrix passes on a TL-verified integration SHA.

See `docs/architecture/adr-transform-studio-marketplace-and-application-environments.md`.

## Completion

A fresh user can express intent, get an explainable organization, watch execution, edit manually in Sporta or an integrated editor, return to the same WorkGraph/artifact, authorize learning, trigger Arena on a capability gap, receive a validated result, and demonstrate reduced manual intervention on a future run. For P9, a creator can publish an approved pipeline, a user can select it for a feed, and an agent can safely use a connected application under explicit, revocable permissions.

## P10 — Integration Reality Wave (post-P9 deferred-scope realization)

- Realize the P9 audit's deferred-and-typed scopes that the environment can exercise honestly: the studio mount (the W9C TL seam), live-feed ingress at the REAL-local grade, and a REAL model provider lane through the sandbox model service.
- Payment provider, Hugging Face hosting, production CDN ingress and hosted deployment stay typed-future behind operator-credential gates — documented, requested, never faked.
- P10 is complete when `docs/testing/p10-acceptance.md` passes on a TL-verified integration SHA.
