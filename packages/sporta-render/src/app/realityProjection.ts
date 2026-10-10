import type { SportsWorldModelRecord } from "@sporta/contracts/contract";
import { RenderRightsRefusalError } from "../domain/errors.js";
import { tacticalRenderModel, type TacticalRenderModel } from "../domain/tactical.js";
import { playByPlayRenderModel, type PlayByPlayRenderModel } from "../domain/playByPlay.js";
import { swmRenderableUnder, type RenderUsageContext } from "../domain/usage.js";
/**
 * RealityProjectionService (app layer) — the two-realities composition
 * over the per-reality adapters, and the A13 harness surface: both
 * materially different realities derived from the SAME snapshot
 * through their adapters (the renderer adapter boundary invariant).
 *
 * `project` is the ungated pure read-model composition: producing a
 * data projection exercises no usage — hosts gate at the surfacing
 * boundary (the artifact plane's v1 plumbing / gated-seam split).
 * `projectGated` is the fail-closed variant: the snapshot's rights
 * must affirmatively permit a declared usage, else a typed
 * `RenderRightsRefusalError` (renderers never widen rights).
 */

/** Both realities derived from one snapshot (A13 surface). */
export interface RealityProjection {
  readonly tactical: TacticalRenderModel;
  readonly playByPlay: PlayByPlayRenderModel;
}

/** Composition root: runs both adapters over the SAME snapshot. */
export class RealityProjectionService {
  /** The ungated pure composition (deterministic, read-only). */
  project(snapshot: SportsWorldModelRecord): RealityProjection {
    return {
      tactical: tacticalRenderModel(snapshot),
      playByPlay: playByPlayRenderModel(snapshot),
    };
  }

  /**
   * The fail-closed composition: refuses with a typed
   * `RenderRightsRefusalError` when the snapshot's rights do not
   * affirmatively permit a declared usage of `usage` (C6 law,
   * consumed — never invented).
   */
  projectGated(snapshot: SportsWorldModelRecord, usage: RenderUsageContext): RealityProjection {
    if (!swmRenderableUnder(snapshot.policy.rights, usage)) {
      const declared = usage.usages.join(", ");
      throw new RenderRightsRefusalError(
        `the snapshot's rights do not affirmatively permit the declared usage(s) [${declared}]`,
        `swm:${snapshot.swmId}:${declared}`,
      );
    }
    return this.project(snapshot);
  }
}
