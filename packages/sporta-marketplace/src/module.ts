/**
 * sporta-marketplace module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaMarketplaceModule = {
  id: "sporta-marketplace",
  requires: [
    "sporta-contracts",
    "sporta-transforms",
    "sporta-artifacts",
    "sporta-policy",
  ],
  provides: [
    "marketplace-review-decision-types",
    "marketplace-listing-types",
    "marketplace-entitlement-types",
    "marketplace-suspension-types",
    "marketplace-selection-result-types",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
