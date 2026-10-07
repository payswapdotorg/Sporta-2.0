import type { ObservationInput } from "./contract.js";

export const exampleObservations: readonly ObservationInput[] = [
  {
    observationId: "obs:example-1",
    domain: "football",
    payloadHash: "ab" + "00".repeat(31),
    capturedAt: "2026-10-07T00:00:00.000Z",
    confidence: 0.88,
    provenance: {
      sourceKind: "observation",
      sourceRef: "source:example",
      capturedAt: "2026-10-07T00:00:00.000Z",
    },
  },
];
