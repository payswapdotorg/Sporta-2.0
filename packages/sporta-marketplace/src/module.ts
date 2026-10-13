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
    // Wave 9 (Worker B) — additive provided capabilities.
    "marketplace-submission-lifecycle",
    "marketplace-automated-checks",
    "marketplace-human-review",
    "marketplace-material-change-detection",
    "marketplace-listing-publication",
    "marketplace-listing-state-actions",
    "marketplace-settlement-port",
    "marketplace-entitlement-service",
    "marketplace-launch-admission",
    "marketplace-launch-disclosure",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
