/**
 * sporta-editors module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaEditorsModule = {
  id: "sporta-editors",
  requires: ["sporta-contracts", "sporta-artifacts"],
  provides: ["editor-broker-port", "editor-session-history-read-port"],
  publicEntrypoints: ["contract.ts"],
} as const;
