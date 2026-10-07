/**
 * sporta-evaluation module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaEvaluationModule = {
  id: "sporta-evaluation",
  requires: ["sporta-contracts", "sporta-organizations"],
  provides: ["evaluation-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
