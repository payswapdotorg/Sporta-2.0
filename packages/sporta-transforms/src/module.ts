/**
 * sporta-transforms module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaTransformsModule = {
  id: "sporta-transforms",
  requires: [
    "sporta-contracts",
    "sporta-work",
    "sporta-artifacts",
    "sporta-world",
    "sporta-compute",
  ],
  provides: [
    "transform-manifest-types",
    "transform-node-types",
    "transform-release-candidate-types",
    "transform-run-manifest-types",
    "transform-graph-validation-types",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
