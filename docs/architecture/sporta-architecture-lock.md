# Sporta 2.0 Architecture Lock

Status: LOCKED FOR IMPLEMENTATION — P9 extension accepted 2026-10-13; Sporta-native UI boundary accepted 2026-10-14; see the relevant ADRs.

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
- Sporta Marketplace owns pipeline submission/review/listing/offer/entitlement/suspension state and points to immutable releases; it does not own execution or content bytes.
- Sporta Transforms owns typed graph composition and run manifests; WorkGraph remains task/run authority and Artifact Fabric remains content/revision authority.
- Sporta Application Environments owns attachment metadata, capability grants and audit; the external app owns its internal state.
- Every source/model/dependency/runtime is digest-pinned; moving tags are never execution identity.

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
25. Transform pipelines are typed DAGs; nodes may use models, scripts, deterministic transforms or granted application capabilities.
26. Every first publication and material update requires automated checks plus human review before becoming public.
27. Pipeline runs pin approved release/component digests, config hash, rights snapshot and output provenance.
28. GitHub/Hugging Face/blob providers store assets; they never own Sporta marketplace approval state.
29. Free and paid offerings pass equal quality, rights and security gates; entitlement/charge retries are idempotent.
30. Attached applications expose only declared, user-granted, scoped and revocable capabilities; observation does not imply mutation.
31. App-attachment permission is distinct from learning consent.
32. Untrusted pipeline code/models run only in isolated bounded execution profiles, without default host-secret access or unrestricted network egress.
33. Semantic/event fidelity is evaluated independently from source/output rights review; uncertainty/provenance are preserved or changes are explicit.
34. Similarity/appearance change alone never makes an output legally cleared or “copyright-safe”.
35. Every output run preserves lineage to input and exact release; publishing a new version never mutates existing runs.
36. Publishing, destructive actions, purchases, public distribution and permission escalation require explicit confirmation and policy checks.
37. The TL registers new P9 package roots/edges before workers start; no duplicate runtime, scheduler, artifact or permission authority.
38. The user-facing /sporta application is a Sporta-native product surface. ZCode is an internal execution substrate; its branded Root shell, navigation and global UI theme must not define the Sporta UI.
39. Product UI completion requires a browser-driven user journey and reviewed desktop/mobile visual evidence; build-only/component-only success is not visual acceptance.

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

Feed -> source-rights check -> approved TransformListing/version
  -> typed transform DAG -> existing ZCode/Compute execution
  -> derived ArtifactRevision + semantic/event evidence

User-approved ApplicationAttachment -> scoped ApplicationCapability
  -> existing ZCode AgentRuntime/tool/session boundary
  -> audited action/effect -> Artifact Fabric + WorkGraph reconciliation
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

## P9 Transform Studio and Application Environments

- Transform Studio composes typed DAGs from models, scripts, deterministic transforms and approved app actions.
- Marketplace releases use app-store publication rules: immutable candidates, automated gates and human review for every update.
- The marketplace owns listings/review/entitlements; pipeline execution remains a WorkGraph run using existing runtime/compute facilities.
- Attached applications expose a generic Application Environment contract with independent observe/control/file/semantic/network scopes.
- See `docs/architecture/adr-transform-studio-marketplace-and-application-environments.md` and P9 contracts.

## Sporta-native product UI

- The /sporta home is task-oriented: feed/source entry, active work, recent runs and outputs. It is not a developer diagnostic trace page.
- Studio connects source, typed pipeline graph, preview/event context, run and output.
- Marketplace, My Pipelines, Runs, Library and Connected Apps are coherent product destinations; internal IDs/stages belong in expandable evidence details.
- Sporta owns visual tokens, navigation, page hierarchy, user-facing copy and responsive states. Neutral primitives can be reused only if they do not import ZCode branding/theme/layout.
- TL-owned route isolation must ensure @zcode/ui/styles.css and ZCode theme styles do not leak into the Sporta surface. ZCode execution/workspace/tool services remain reusable below the visual boundary.
- Details and mandatory browser evidence live in docs/architecture/sporta-product-ui.md, docs/architecture/adr-sporta-native-product-ui.md and docs/testing/sporta-native-ui-acceptance.md.

## Concurrency

After TL-only Wave 0, run three workers concurrently:

- A: Intent / WorkGraph / Organizations / Lab / Evaluation.
- B: Artifacts / Editors / Sports World / Compute.
- C: Arena / Capability Gaps / Product UX / Deployment.

