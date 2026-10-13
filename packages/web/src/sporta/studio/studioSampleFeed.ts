/**
 * The studio demo sample feed bytes (W9C-6) — fixture CONTENT for the
 * sample preview/launch inputs (the process lanes that consume them are
 * real). Browser-safe: only TextEncoder, no Node imports — the React
 * surface may import this freely.
 */
export function studioSampleFeedBytes(): Uint8Array {
  const events = [0, 1, 2, 3, 4].map((index) =>
    JSON.stringify({
      eventId: `evt-${index + 1}`,
      entityId: index % 2 === 0 ? "team-A" : "team-B",
      atMs: 1000 + index * 1000,
      confidence: 0.3 + index / 10,
      provenance: {
        sourceKind: "observation",
        sourceRef: `source:${index + 1}`,
        capturedAt: "2026-10-13T00:00:00.000Z",
      },
    }),
  );
  return new TextEncoder().encode(`${events.join("\n")}\n`);
}
