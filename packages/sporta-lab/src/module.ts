/**
 * sporta-lab module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaLabModule = {
  id: "sporta-lab",
  requires: ["sporta-contracts", "sporta-work", "sporta-organizations"],
  provides: ["lab-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
