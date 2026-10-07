/**
 * sporta-arena module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaArenaModule = {
  id: "sporta-arena",
  requires: ["sporta-contracts"],
  provides: ["arena-client-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
