# ADR — ZCode as Sporta 2.0 Execution Substrate

Status: ACCEPTED

## Decision

Sporta 2.0 remains a fork of zai-org/zcode and reuses ZCode as the generic execution substrate.

Sporta does not create a replacement AgentRuntime, session runtime, task queue, remote-workspace system, permission broker, MCP layer, desktop transport, or generic tool scheduler.

## ZCode capabilities retained

- AgentRuntime and runtime state;
- permission and admission boundaries;
- tool registry/scheduling/execution;
- subagents;
- dynamic workflows;
- MCP;
- browser/computer-control seams;
- local and remote workspaces;
- Desktop, Web and CLI surfaces;
- generic artifact/tool storage ports;
- generic filesystem/image/PDF ports;
- architecture-governance checks.

## Sporta semantic ownership

Sporta adds:

- Intent;
- Work Graph;
- Organization and Agent Body composition;
- Organization Lab;
- Sports World Model;
- Artifact Graph and revision semantics;
- Editor Broker and external editor round-trip;
- user takeover and EditDelta;
- learning and personalization;
- CapabilityGap;
- Arena integration;
- evaluation and organization promotion;
- sports-specific product UX.

## Consequence

The existing ZCode package namespace may remain ZCode during migration. Renaming/restructuring it is a separate implementation work order and must not be mixed into semantic-contract work.

A new TL must prefer extending an existing ZCode port over creating a second authority.
