import type { RightsScope } from "@sporta/contracts/contract";
/**
 * The C6 usage-context gate at the renderer boundary (domain layer —
 * pure, no IO).
 *
 * ADR wave-5 decision 5: renderers never widen rights and the C6
 * usage-context vocabulary is consumed, never invented. This mirrors
 * the ratified W3-B/W4-B pattern
 * (`packages/sporta-artifacts/src/domain/reads.ts`,
 * `artifactVisibleToUsage`) as per-package duplication — no new shared
 * contracts type (the wave-4/wave-5 ownership law).
 */

/**
 * The caller's usage context for a renderer-plane read (invariant 22 —
 * rights propagate through every plane). Usage classes mirror the
 * `RightsScope.usages`/`prohibitions` vocabulary, consumed verbatim.
 */
export interface RenderUsageContext {
  /** Usage classes the caller is permitted to exercise. */
  readonly usages: readonly string[];
}

/**
 * Fail-closed invariant-22 gate: may a snapshot be rendered to a
 * caller whose usage context is `usage`?
 *
 * Law (byte-for-byte the `artifactVisibleToUsage` law, mirrored for
 * the renderer plane): a snapshot is renderable iff AT LEAST ONE
 * declared usage is affirmatively permitted by the record's
 * `PolicySet.rights.usages` AND NO declared usage is prohibited. A
 * missing or empty usage context is NEVER renderable — the gate
 * cannot affirm any permission. Holders are not evaluated here:
 * holder-bound authorization is a policy-domain concern above this
 * seam.
 */
export function swmRenderableUnder(rights: RightsScope, usage?: RenderUsageContext): boolean {
  if (usage === undefined || usage.usages.length === 0) return false;
  const permitted = usage.usages.some((candidate) => rights.usages.includes(candidate));
  const prohibited = usage.usages.some((candidate) => rights.prohibitions.includes(candidate));
  return permitted && !prohibited;
}
