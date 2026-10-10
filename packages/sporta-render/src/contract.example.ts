import type { SportsWorldModelRecord } from "@sporta/contracts/contract";
import type { PlayByPlayRenderModel, RenderUsageContext, TacticalRenderModel } from "./contract.js";
import {
  RealityProjectionService,
  serializeTacticalSvg,
  playByPlayRenderModel,
  playByPlayTranscript,
  tacticalRenderModel,
} from "./contract.js";

/** FIXTURE — an example snapshot input (fixture-grade, labeled). */
export const exampleSnapshot: SportsWorldModelRecord = {
  swmId: "swm:example",
  domain: "example-domain",
  snapshotHash: "ab" + "00".repeat(31),
  entities: ["entity:home-1", "entity:away-7"],
  events: ["evt:kickoff", "evt:substitution"],
  uncertainty: [
    { subject: "obs:example-1", confidence: 0.9 },
    { subject: "entity:away-7", confidence: 0.75 },
  ],
  provenance: {
    sourceKind: "authorized-source",
    sourceRef: "camera:example",
    capturedAt: "2026-10-10T00:00:00.000Z",
  },
  policy: {
    rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

/** The tactical reality of the example snapshot (deterministic). */
export const exampleTactical: TacticalRenderModel = tacticalRenderModel(exampleSnapshot);

/** The play-by-play reality of the SAME example snapshot. */
export const examplePlayByPlay: PlayByPlayRenderModel = playByPlayRenderModel(exampleSnapshot);

/** The caller usage context that the example rights affirmatively permit. */
export const exampleUsageContext: RenderUsageContext = { usages: ["render"] };

/** The gated two-realities projection (permitted usage passes). */
export const exampleProjection = new RealityProjectionService().projectGated(
  exampleSnapshot,
  exampleUsageContext,
);

/** The deterministic SVG document of the example tactical reality. */
export const exampleTacticalSvg: string = serializeTacticalSvg(exampleTactical);

/** The deterministic transcript of the example play-by-play reality. */
export const exampleTranscript: string = playByPlayTranscript(examplePlayByPlay);
