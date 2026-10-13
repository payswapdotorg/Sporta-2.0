# sporta-app-environments

Generic application attachments, scoped capability grants and action audit
(P9).

Invariants that types cannot express (source: ADR + application-environment
contract; lock invariants 30-32, 37):

- ZCode owns AgentRuntime, generic tool execution, session admission,
  credentials, permission checks and workspace mechanics — this module
  builds no second runtime, tool or permission authority.
- Capability classes are independent: granting observe never grants control
  (lock 30); file/network scopes are separate explicit grants.
- Attaching and granting scopes require explicit user consent; broader
  permissions on a new release require reauthorization.
- Least privilege by default: no mutation, arbitrary file access, network
  egress, clipboard/download or secret access unless declared and granted.
- Destructive/irreversible/public-posting/purchase/publishing/billing/
  permission-changing actions require confirmation unless narrowly
  preauthorized by policy.
- Grants are tenant/user/target/workspace/session/run scoped, expire and
  are revocable; revocation blocks new actions and triggers safe-stop for
  active mutations (P9-20).
- App outputs are untrusted content; instructions inside app content can
  never expand permissions or bypass sandbox policy (P9-21).
- A disconnected or failed app call is never reported as successful
  (P9-19); missing event coverage is explicit.
- Credentials use the existing vault and opaque handles — never logs or
  manifests.
- Verified effects are reconciled into the same WorkGraph/artifact lineage
  (P9-19); the external app owns its internal state.
- Learning consent is separate from attachment permission (lock 31).
- One generic Application Environment surface serves all adapters;
  browser/terminal remain existing ZCode capabilities (no app-specific
  shell surface).
