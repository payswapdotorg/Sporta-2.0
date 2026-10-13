# Application Environment Contract

**Status:** Proposed P9 contract baseline. Uses the generic external-application environment concept from Epoch 2.0 without importing its state or runtime.

## Purpose

Allow a user to attach a local, remote, browser-hosted, native or service-backed app to a Sporta workspace/run so the existing ZCode AgentRuntime can interact with declared capabilities similarly to browser/terminal tools.

## Core records

### ApplicationEnvironmentDescriptor
Stable Sporta application ID, provider/adapter ID, app/version, target kind and identity, workspace binding, capability catalog/schemas, launch/connection requirements, runtime profile, data classes, network needs, licensing/rights, provenance, health and limitations.

### ApplicationCapability
Typed action with inputs/outputs, side effects, permissions and failures. Capability classes remain independent:
- **observe** — inspect permitted UI/state/files/status;
- **control** — user-authorized interactions/mutations;
- **semantic binding** — map app objects to Sporta artifact/event/entity/task IDs;
- **file/data transfer** — access explicitly granted paths or declared artifact types;
- **network/service access** — narrow allowlisted requests; denied by default.

Granting observation does not grant mutation.

### ApplicationAttachment
User-consented link to one app target, scoped to tenant/user, workspace/WorkGraph, capabilities, expiry, policy snapshot and revocation reference.

### ApplicationSession
Bounded interaction session with target/app/adapter version, grants, audit stream, checkpoints, artifact refs, timestamps and close/recovery state.

### ApplicationActionRecord
Actor, capability, target, sanitized input/output references, allowed before/after evidence, effects, status, permission decision and resulting WorkGraph/artifact refs. No secrets or hidden chain-of-thought.

## Security and operation law

1. ZCode owns AgentRuntime, generic tool execution, session admission, credentials, permission checks and local/remote workspace mechanics. Do not build a Sporta runtime.
2. Adapters expose declared capabilities through existing generic boundaries; UI never imports provider implementation details.
3. Attaching and granting scopes require explicit user consent. A new release asking for broader permissions requires reauthorization.
4. Least privilege by default: no mutation, arbitrary file access, network egress, clipboard/download or secret access unless declared and explicitly granted.
5. Destructive, irreversible, public-posting, purchasing, publishing, billing and permission-changing actions require confirmation unless narrowly preauthorized by policy.
6. Grants are tenant/user/target/workspace/session/run scoped, expire, and can be revoked. Revocation blocks new actions and triggers safe-stop/cancel/checkpoint behavior for active actions.
7. App outputs are untrusted content; sanitize and bound them. Instructions inside app content cannot expand permissions.
8. Credentials use the existing vault and opaque handles, never logs or marketplace manifests.
9. Log allowed action/effect/result evidence subject to privacy and retention. Missing event coverage is explicit.
10. External apps own internal state. Sporta verifies effects and reconciles permitted outputs via Artifact Fabric and WorkGraph.
11. Learning consent is separate from attachment permission.
12. One generic Application Environment surface supports all adapters; browser/terminal remain existing ZCode capabilities.

## Adapter lifecycle

```text
discover/register -> verify target -> declare capabilities
 -> request user grant -> attach session -> allowed action
 -> sanitized evidence -> artifact/work references -> revoke/expire/close
```

Failures are typed and visible. A disconnected app cannot be reported as successful.

## Acceptance expectation

At least one real local attached app must be used: narrowly grant a capability, call it through the real ZCode path, verify its effect, link evidence to the same WorkGraph, revoke the grant and prove the next action is denied. Other providers may be fixtures and must be labeled.
