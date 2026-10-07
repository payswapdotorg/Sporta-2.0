# Sporta ↔ Arena Escalation Contract

## Boundary

Arena provides human capability acquisition. Sporta remains authoritative over Sporta work state.

## Request

Include request/idempotency key, tenant/work/run refs, capability need, urgency/deadline/budget, required expert capabilities, desired output schema, context references, session/privacy policy, permitted actions, learning permissions and retention policy.

## Session modes

observe / correct / unblock / takeover / teach / review

## Result types

Correction / Unblock / Solution / Review / EvidenceBundle / KnowledgePatch / ToolGapSignal / EvaluationVerdict / LearningArtifactRef

## Lifecycle

created -> triaged -> matching -> offered -> accepted -> session_ready -> in_progress -> submitted -> validating -> accepted | revision_required | rejected -> closed

## Safety

Arena gets only permitted context. No secrets, unrelated tenant data or hidden chain-of-thought.

Arena does not directly mutate Sporta state.

## Tool-gap loop

expert uses missing tool -> ToolGapSignal -> ToolSpec candidate -> adapter -> benchmark -> organization candidate -> promotion

Operational result delivery and reusable-learning retention are separate permissions.
