# sporta-product

The intent-first product shell: the 12-stage product loop projection and
the learning-consent intake. Created by Worker C through work-order
WO-C1; registered in architecture-policy.yaml by the TL at integration.

Invariants that types cannot express:

- The projection is a READ MODEL: it composes the injected v1 ports (work, organizations, artifacts, editors, arena), calls only their read methods (`readWorkGraph`, `resolve`, `lineage`), implements no domain logic and mutates no other module's state. Tests assert it never calls write methods (`openIntent`, `appendNode`, editor broker methods, arena client methods).
- Unknown `workGraphId` → typed `UnknownWorkGraphError` (design decision: a trace is never fabricated for an unreadable graph).
- The trace always contains ALL 12 canonical stages in order (intent, organization, execution, progress, artifact, takeover, editor, learning, capability-gap, arena, result, organization-improvement). Stages the v1 ports cannot derive are honestly "pending" with a detail naming the missing read seam — nothing is fabricated.
- The artifact stage assumes the nodeId of an artifact-kind work-graph node IS the `ArtifactRecord.artifactId` (documented integration assumption; needs Worker A/B confirmation at integration).
- The organization stage calls the resolver with the shell's ambient context; `environmentProfile` defaults to "unknown" and `constraints` to `[]` (the ambient context is optional constructor input).
- Learning consent design decision: `recordConsent` is a pure success type — a DENIED consent throws `LearningConsentRefusedError` and creates NO artifact (the throw happens before any store write). Explicit user denial always blocks learning regardless of `requireConsent`.
- Consent scopes must be a subset of the work graph's learning policy scopes (empty policy scopes = no learning permitted). Empty consent scopes throw `LearningScopeError`.
- Granted consent produces a `LearningArtifactRecord` with `status: "candidate"`, `scope: "user"`, `class` = the sorted-first (primary) scope, `evidence: []`, and `permission` = the granted (deduped, sorted) scopes with `requireConsent: true` — user-scope learning never silently becomes a global rule (invariant 13).
- `recordConsent` is idempotent per (workGraphId, userId, scopes): the learning artifact id is deterministic (`learn:<userId>:<workGraphId>:<sorted+scopes>`); identical retries return the SAME record. Consent revocation (granted → later denied deleting candidates) is Wave 2.
- No record in this module carries a timestamp; there is no clock (LearningArtifactRecord has none).
- The adapters layer is empty in Wave 1: the module has no transport of its own, and injected-port fakes live in the test files per the work order.
