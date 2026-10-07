/**
 * sporta-policy module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaPolicyModule = {
  id: "sporta-policy",
  requires: [],
  provides: ["policy-set"],
  publicEntrypoints: ["contract.ts"],
} as const;
