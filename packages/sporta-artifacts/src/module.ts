/**
 * sporta-artifacts module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaArtifactsModule = {
  id: "sporta-artifacts",
  requires: ["sporta-contracts"],
  provides: ["artifact-graph-port", "artifact-gated-read-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
