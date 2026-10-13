/**
 * sporta-app-environments module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 * `requires` is the TL-frozen Wave 0 direction and NEVER changes here.
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
    // Wave 9 (Worker C) additive capabilities:
    "app-descriptor-registry",
    "app-scoped-grants-lifecycle",
    "app-session-lifecycle",
    "app-action-admission-ladder",
    "app-action-audit-trail",
    "app-real-local-action-lane",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
