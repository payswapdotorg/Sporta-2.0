# Sporta 2.0 Canonical Contracts

Status: CONTRACT BASELINE v1

Semantic contracts must remain stable unless an ADR explicitly changes them.

## Core records

### IntentSpec
Goal, constraints, quality target, deadline, budget/resource limits, rights/privacy scope, editor/tool preferences, learning policy, artifact requirements.

### WorkGraph
Canonical graph: Intent -> Tasks -> Runs -> Actions -> Artifacts -> Evidence -> Outcomes.

### OrganizationVersion
Immutable composition of Agent Bodies, cognitive substrates, tools, workflows, environment, policies, fallbacks, preferences and evidence.

### AgentBody
Persistent professional capability composition independent from any single model/provider.

### Capability
Typed capability with inputs, outputs, limits, evidence expectations and required tools.

### Tool / ToolSession
Provider-neutral executable capability and one execution of it.

### Artifact / ArtifactRevision
Immutable work-product reference plus content-addressed revision and lineage.

### EditorSession
Bounded local, remote, embedded or external editing session.

### EditDelta
Machine-readable difference between revisions, with editor/version/provenance.

### SportsWorldModel
Authoritative structured sporting-event state backed by observations/provenance/confidence.

### EvidenceRecord
Machine-readable action, observation, measurement, evaluation or human judgment.

### CapabilityGap
Typed missing capability discovered during execution.

### ArenaEscalation / ArenaResult
Typed request to Arena and validated typed result from Arena.

### LearningArtifact
Candidate reusable preference, workflow, tool, capability, knowledge or organization improvement.

### EvaluationReport
Evidence used to compare organization candidates.

### PromotionRecord
Immutable lifecycle/promotion decision.

## State owners

| State | Owner |
|---|---|
| agent turn/runtime | ZCode AgentRuntime |
| intent/work | Sporta Work |
| organization | Sporta Organizations |
| lab candidate/evaluation | Sporta Lab |
| production SWM | Sporta World |
| artifact lineage | Sporta Artifact Fabric |
| external editor state | editor application |
| Arena escalation/session | Arena |
| organization promotion | Sporta Organizations |

## Rules

- IDs stable/opaque.
- Retryable writes idempotent.
- Clocks injectable.
- Provenance/rights explicit.
- Tenant checks at service boundaries.
- External provider identifiers never become domain identifiers.
- No hidden chain-of-thought is stored as evidence.
