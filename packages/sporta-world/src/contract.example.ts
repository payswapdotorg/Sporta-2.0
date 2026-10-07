import type { ObservationInput } from "./contract.js";
import type { WorldClock, WorldHashFn } from "./contract.js";

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
