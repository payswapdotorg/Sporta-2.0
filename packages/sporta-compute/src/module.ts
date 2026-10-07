/**
 * sporta-compute module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaComputeModule = {
  id: "sporta-compute",
  requires: ["sporta-contracts"],
  provides: ["compute-broker-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
