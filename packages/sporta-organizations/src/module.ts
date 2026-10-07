/**
 * sporta-organizations module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaOrganizationsModule = {
  id: "sporta-organizations",
  requires: ["sporta-contracts"],
  provides: ["organization-resolver-port", "organization-registry-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
