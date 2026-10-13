/**
 * sporta-app-environments module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaAppEnvironmentsModule = {
  id: "sporta-app-environments",
  requires: ["sporta-contracts", "sporta-work", "sporta-policy"],
  provides: [
    "app-environment-descriptor-types",
    "app-capability-types",
    "app-attachment-grant-types",
    "app-session-types",
    "app-action-audit-types",
    "app-action-admission-types",
    // Wave 9 (Worker C) — additive provided capabilities.
    "app-descriptor-registry",
    "app-scoped-grants",
    "app-action-admission-ladder",
    "app-session-lifecycle",
    "app-action-audit",
    "app-local-process-adapter",
    "app-agent-tool-endpoint",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
