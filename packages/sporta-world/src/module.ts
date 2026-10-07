/**
 * sporta-world module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaWorldModule = {
  id: "sporta-world",
  requires: ["sporta-contracts"],
  provides: ["world-model-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
