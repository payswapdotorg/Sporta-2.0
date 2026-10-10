/**
 * sporta-render module manifest.
 *
 * The renderer adapter boundary + two materially different sports
 * production realities (tactical board + play-by-play), created by
 * Worker B through work-order W5B (ADR wave-5, decisions 2 + 5), plus
 * the playback engine surface created by Worker C through work-order
 * W5C (decisions 3 + 5) in PARALLEL (both additive from the same
 * base; the TL merged the surfaces — conflict-free by construction —
 * and appends the managed architecture-policy.yaml entry at
 * integration; registration is TL-owned). This manifest mirrors the
 * registration shape: requires lists every consumed module (type-only
 * consumption of the frozen contracts surface by the render-model
 * lane; the playback port is declared locally — the per-package
 * duplication law), contract.ts is the only public entrypoint, and
 * the sources follow the domain/app/adapters layer convention
 * (adapters holds the external SVG document serializer — the
 * kdenliveXml.ts precedent; the playback controller is a pure state
 * machine — no IO anywhere).
 */
export const sportaRenderModule = {
  id: "sporta-render",
  requires: ["sporta-contracts"],
  provides: [
    "renderer-adapter-boundary",
    "tactical-board-reality",
    "play-by-play-reality",
    "playback-engine",
  ],
  publicEntrypoints: ["contract.ts"],
} as const;
