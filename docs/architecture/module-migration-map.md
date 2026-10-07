# Sporta 2.0 Module Migration Map

## Existing ZCode substrate

| Existing area | Sporta treatment |
|---|---|
| apps/zcode-cli/packages/core | retain; Sporta organizations execute through AgentRuntime |
| packages/services | retain generic services; Sporta semantics live in Sporta modules |
| packages/shared | retain generic shared protocol/types |
| packages/rpc | retain |
| packages/client | retain |
| packages/server | retain |
| packages/ui | retain shared UI primitives and runtime projections |
| packages/web | retain as product host |
| packages/desktop | retain as native host |
| remote-workspace stack | retain as editor/compute environment substrate |
| MCP/tool system | retain as execution surface |

## New Sporta semantic modules

Planned module IDs:

- sporta-contracts
- sporta-work
- sporta-organizations
- sporta-lab
- sporta-artifacts
- sporta-editors
- sporta-world
- sporta-compute
- sporta-arena
- sporta-evaluation
- sporta-policy

These modules should expose public contract entrypoints and keep provider/editor/model implementations behind adapters.

## Dependency rule

~~~text
sporta-policy
      ↓
sporta-contracts
      ↓
work / artifacts / organizations / world / arena
      ↓
lab / evaluation / editors / compute
      ↓
web / desktop product projections

ZCode substrate remains below the Sporta semantic layer.
~~~

No Sporta semantic module imports ZCode implementation internals when a public port/contract is available.
