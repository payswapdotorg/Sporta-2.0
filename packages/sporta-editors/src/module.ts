/**
 * sporta-editors module manifest.
 * Dependency declarations mirror architecture-policy.yaml; only contract.ts is public.
 */
export const sportaEditorsModule = {
  id: "sporta-editors",
  requires: ["sporta-contracts", "sporta-artifacts"],
  provides: [
    "editor-broker-port",
    "editor-session-history-read-port",
    // Wave 6 (w6a landed, TL registration 2026-10-11): live/shared editor
    // session surface (integration level 3) — additive, for cross-module
    // consumption (e.g. the product takeover projection). The public
    // entrypoint (contract.ts) already exports the full surface; this
    // manifest entry records it in module governance.
    "shared-editor-session-port",
    "shared-delta-sink-port",
    "shared-session-history-read-port",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
