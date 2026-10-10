/**
 * sporta-render module manifest (the playback surface — work-order W5C).
 *
 * Created by Worker C through the WO-C1 module-creation law in
 * PARALLEL with Worker B's render-model surface of the same package
 * (both additive from the same base; the TL merges the surfaces and
 * appends the managed architecture-policy.yaml entry at integration —
 * registration is TL-owned). This manifest mirrors the playback
 * surface's registration shape: zero required modules (the playback
 * port is declared locally — the per-package duplication law; the
 * package declares ZERO dependencies), contract.ts is the only public
 * entrypoint, and the sources follow the domain layer convention
 * (the controller is a pure state machine — no IO anywhere).
 */
export const sportaRenderModule = {
  id: "sporta-render",
  requires: [],
  provides: ["playback-engine"],
  publicEntrypoints: ["contract.ts"],
} as const;
