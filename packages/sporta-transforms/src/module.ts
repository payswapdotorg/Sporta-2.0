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
    // Wave 9 (Worker A) — additive provided capabilities.
    "transform-graph-validation",
    "transform-execution-plan",
    "transform-deterministic-execution",
    "transform-model-lane",
    "transform-run-service",
    // Wave 10 (Worker A) — additive provided capabilities.
    "live-source-port",
    "live-source-real-local-http",
    "live-run-ingress",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
