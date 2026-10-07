/**
 * sporta-contracts module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaContractsModule = {
  id: "sporta-contracts",
  requires: ["sporta-policy"],
  provides: ["canonical-records"],
  publicEntrypoints: ["contract.ts"],
} as const;
