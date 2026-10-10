import type { ObservationInput } from "./contract.js";
import type { WorldClock, WorldHashFn } from "./contract.js";
import type {
  AcquisitionManifest,
  BallStateRule,
  EntityStateRule,
  PipelinePlan,
  PipelineSeams,
  RawObservation,
} from "./contract.js";

const capturedAt = "2026-10-07T00:00:00.000Z";

export const exampleObservations: readonly ObservationInput[] = [
  {
    observationId: "obs:example-1",
    domain: "football",
    payloadHash: "ab" + "00".repeat(31),
    capturedAt,
    confidence: 0.88,
    provenance: {
      sourceKind: "observation",
      sourceRef: "source:example",
      capturedAt,
    },
    entityRefs: ["entity:player-10"],
    eventRefs: ["event:pass-3"],
  },
  {
    observationId: "obs:example-2",
    domain: "football",
    payloadHash: "cd" + "00".repeat(31),
    capturedAt,
    confidence: 0.72,
    provenance: {
      sourceKind: "authorized-source",
      sourceRef: "camera:example-2",
      capturedAt,
      confidence: 0.9,
    },
  },
];

/** Example of injected seams (clock + hash stay adapter-owned). */
export const exampleSeams: { clock: WorldClock; hash: WorldHashFn } = {
  clock: { now: () => capturedAt },
  hash: (input) => `fixture-hash:${input.length}`,
};

// ---------------------------------------------------------------------------
// Wave 5 (w5a) — pipeline example (additive). An authorized acquisition
// manifest plus one raw observation, planned through the perception
// pipeline into seam-ready observations. Honest transform — NO ML.
// ---------------------------------------------------------------------------

export const examplePipelineManifest: AcquisitionManifest = {
  manifestId: "acq:example",
  domain: "football",
  provenanceSeed: {
    sourceKind: "authorized-source",
    sourceRef: "broadcaster:example",
    capturedAt,
    confidence: 0.95,
  },
  mediaRefs: [{ mediaId: "camera:example", kind: "video", capturedAt }],
  policy: {
    rights: { holders: ["holder:example"], usages: ["render"], prohibitions: [] },
    privacy: { visibility: "tenant", exportableFields: [] },
    retention: { disposition: "retain" },
  },
};

export const examplePipelineRaws: readonly RawObservation[] = [
  {
    rawId: "raw:example-1",
    mediaRef: "camera:example",
    capturedAt,
    confidence: 0.88,
    payload: { playerId: "entity:player-10", x: 10, y: 20 },
  },
];

export const examplePlayerRule: EntityStateRule = {
  kind: "entity-state",
  ruleId: "rule:example-player",
  entityIdField: "playerId",
  xField: "x",
  yField: "y",
};

export const exampleBallRule: BallStateRule = {
  kind: "ball-state",
  ruleId: "rule:example-ball",
  entityIdField: "ballId",
  xField: "x",
  yField: "y",
  possessionField: "possession",
};

/** A complete pipeline plan (the composition's own seam injection). */
export const examplePipelinePlan: PipelinePlan = {
  manifest: examplePipelineManifest,
  raws: examplePipelineRaws,
  perceptionRules: [examplePlayerRule, exampleBallRule],
  tracking: { maxGapMs: 2000, gapConfidenceCeiling: 0.7 },
  calibration: {
    timing: { offsetsMs: { "camera:example": 100 } },
    camera: { transforms: { "camera:example": { x: { scale: 2, translation: 1 } } } },
  },
  eventRules: [
    {
      kind: "zone-entry",
      ruleId: "rule:example-zone",
      zoneId: "zone:example-box",
      bounds: { minX: 20, maxX: 30, minY: 20, maxY: 30 },
      watchedEntities: ["entity:player-10"],
    },
  ],
};

export const examplePipelineSeams: PipelineSeams = {
  hash: (input) => `fixture-hash:${input.length}`,
};
