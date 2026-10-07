/**
 * sporta-work module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaWorkModule = {
  id: "sporta-work",
  requires: ["sporta-contracts"],
  provides: ["work-graph-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
