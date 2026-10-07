# Sporta 2.0 Architecture Lock

Status: LOCKED FOR IMPLEMENTATION

## Product thesis

Sporta 2.0 is an intent-driven creative and sports-production operating environment built on the ZCode execution substrate.

Core loop:

~~~text
user intent -> organization selection -> agent execution -> durable artifact
             -> optional user/editor takeover -> EditDelta -> permitted learning
             -> improved organization

capability gap -> Arena escalation -> expert intervention -> validated result
               -> learning artifact -> organization candidate -> evaluation -> promotion
~~~

## Authorities

- ZCode owns generic AgentRuntime/session/runtime mechanics, permissions, MCP, subagents, dynamic workflows, remote workspaces, desktop/web/CLI transport and generic tool execution.
- Sporta owns Intent, Work Graph, Organizations, Lab, Sports World Model, Artifact Fabric, Editor Broker, learning, CapabilityGap, evaluation and promotion.
- Arena owns human expert qualification, expert sessions, intervention validation and settlement.
- External editors own their internal project state; Sporta owns artifact lineage and reconciliation.
- The originating Sporta workflow remains authoritative over Sporta state. Arena never directly mutates it.

## Non-negotiable invariants

1. Repository is the sole source of truth.
2. No second AgentRuntime.
3. No second canonical task/job authority.
4. No second canonical artifact authority.
5. Organization versions are immutable after promotion.
6. Simulation never becomes production SWM truth.
7. Production facts require provenance, confidence and rights.
8. Artifact edits create new revisions and preserve history.
9. Export/import must be reversible where the adapter claims round-trip support.
10. External tools are adapters/capabilities, never semantic authorities.
11. Manual takeover is a first-class supported workflow.
12. Learning always carries explicit scope and permission.
13. User preferences never silently become global rules.
14. Capability gaps are typed records with evidence.
15. Arena sessions are isolated capsules and never receive unrestricted live-world access.
16. Arena results are validated by Sporta before application.
17. Provider failure is a typed fallback/refusal, not semantic corruption.
18. Promotion requires evidence and policy gates.
19. User intervention cost is a first-class evaluation signal.
20. Organization choice is contextual: intent + user + source + environment + constraints.
21. No hidden chain-of-thought is stored as evidence.
22. Rights, privacy and retention policy propagate through artifacts, editors and Arena.
23. Workers operate concurrently only inside disjoint ownership boundaries.
24. Shared contracts, root manifests and lockfiles are TL-owned and serialized.

## Canonical topology

~~~text
Intent
  -> WorkGraph
  -> Organization Resolver
  -> OrganizationVersion
  -> ZCode AgentRuntime
  -> Work/World/Artifact/Editor capabilities
  -> Result
  -> optional user takeover
  -> EditDelta
  -> evaluation
  -> preference/workflow/org learning
  -> CapabilityGap when needed
  -> Arena
  -> validated result / learning artifact
  -> candidate organization
  -> evaluation
  -> promotion
~~~

## Organization

OrganizationVersion contains:

- intent profile;
- role graph;
- Agent Bodies;
- cognitive substrates;
- tool graph;
- workflow graph;
- environment profile;
- fallbacks/cascades;
- budgets/latency;
- rights/privacy;
- artifact strategy;
- learned preferences;
- evidence/version metadata.

A model/provider is not an organization.

## Work Graph

Canonical operational graph:

~~~text
Intent -> Task -> Run -> Action -> Artifact -> Evidence -> Outcome
~~~

References may include OrganizationVersion, ToolSession, EditorSession, EditDelta, CapabilityGap and ArenaEscalation.

## Artifact Fabric

Artifacts are durable, content-addressed, lineage-preserving objects.

Workers may be ephemeral; canonical artifacts may not be.

## Editor ecosystem

Initial open-source targets:

- Kdenlive;
- Blender;
- Godot;
- Krita;
- Inkscape;
- Audacity;
- Penpot.

Integration levels:

1. export;
2. round-trip;
3. live/shared session.

## Learning

Learning sources:

- explicit preference;
- repeated edit patterns;
- workflow corrections;
- tool/editor choice;
- organization outcomes;
- Arena expert intervention;
- ToolGapSignal;
- scoped domain knowledge.

Learning must be classified and evaluated before promotion.

## Arena

Typed flow:

~~~text
CapabilityGap
  -> EscalationRequest
  -> matching/session
  -> expert intervention
  -> validation
  -> ArenaResult
  -> Sporta application decision
  -> LearningArtifact
~~~

## Evaluation

Candidate organizations are compared on:

- intent success;
- output quality/fidelity;
- user preference fit;
- manual intervention cost;
- latency;
- resource/cost efficiency;
- reliability;
- determinism;
- provenance;
- rights/security/privacy.

No single benchmark metric is sufficient for promotion.

## Infrastructure

Provider-neutral adapters support local, user-owned and hosted execution.

Preview target may use Vercel, Neon, R2, Upstash Redis and optional Apify, but no named provider is a semantic dependency.

## Concurrency

After TL-only Wave 0, run three workers concurrently:

- A: Intent / WorkGraph / Organizations / Lab / Evaluation.
- B: Artifacts / Editors / Sports World / Compute.
- C: Arena / Capability Gaps / Product UX / Deployment.

