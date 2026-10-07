/**
 * sporta-product module manifest.
 *
 * The intent-first product shell projection + learning-consent intake.
 * Created by Worker C through work-order WO-C1; NOT yet registered in
 * architecture-policy.yaml — the TL appends the managed entry at
 * integration time. This manifest mirrors the future registration:
 * requires lists every consumed module, contract.ts is the only public
 * entrypoint, and the source follows the domain/app/adapters layer
 * convention (adapters is empty in Wave 1 — port fakes live in tests
 * per the work order; no transport exists yet).
 */
export const sportaProductModule = {
  id: "sporta-product",
  requires: [
    "sporta-contracts",
    "sporta-work",
    "sporta-organizations",
    "sporta-artifacts",
    "sporta-editors",
    "sporta-world",
    "sporta-arena",
    "sporta-evaluation",
    "sporta-lab",
    "sporta-policy",
  ],
  provides: ["product-loop-projection", "learning-intake"],
  publicEntrypoints: ["contract.ts"],
} as const;
