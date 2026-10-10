/**
 * sporta-render module manifest.
 *
 * The renderer adapter boundary + two materially different sports
 * production realities (tactical board + play-by-play), created by
 * Worker B through work-order W5B (ADR wave-5, decisions 2 + 5); NOT
 * yet registered in architecture-policy.yaml — the TL appends the
 * managed entry at integration time. This manifest mirrors the future
 * registration: requires lists every consumed module (type-only
 * consumption of the frozen contracts surface), contract.ts is the
 * only public entrypoint, and the source follows the
 * domain/app/adapters layer convention (adapters holds the external
 * SVG document serializer — the kdenliveXml.ts precedent).
 */
export const sportaRenderModule = {
  id: "sporta-render",
  requires: ["sporta-contracts"],
  provides: ["renderer-adapter-boundary", "tactical-board-reality", "play-by-play-reality"],
  publicEntrypoints: ["contract.ts"],
} as const;
