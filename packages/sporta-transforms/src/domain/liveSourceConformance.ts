/**
 * W10A-1 — compile-time conformance for the TL-frozen live-ingress
 * surface (P10-01). TYPE-LEVEL ONLY: this module is compiled by
 * `tsc -b packages/sporta-transforms` (tsconfig `include: ["src"]`)
 * and erased at runtime — the `src/contract.example.ts` precedent.
 * Runtime guards live in `test/liveSourceContract.test.ts`.
 *
 * Two-sided law: well-formed shapes MUST typecheck against the frozen
 * types, and malformed shapes MUST NOT — each negative lane is
 * guarded by `@ts-expect-error`, so the build fails if a violation
 * stops being one (a shape widened) OR if an expected error
 * disappears (a lane silently legalized).
 */
import type {
  LiveCloseReason,
  LiveFrame,
  LiveIngressRefusal,
  LiveIngressRefusalKind,
  LiveSessionEvidence,
  LiveSessionHandle,
  LiveSourceDescriptor,
  LiveSourceGrade,
  LiveSourcePort,
} from "./liveSource.js";

// --- The grade vocabulary is closed: exactly the two honest grades. ---
const realLocalLive: LiveSourceGrade = "real-local-live";
const fixtureGrade: LiveSourceGrade = "fixture";
// @ts-expect-error "production" is not a LiveSourceGrade — the word is unutterable
const productionGrade: LiveSourceGrade = "production";
// @ts-expect-error arbitrary strings are not grades
const arbitraryGrade: LiveSourceGrade = "real-cdn-live";

// --- LiveSourceDescriptor: the five declared fields, exactly. ---
const wellFormedDescriptor: LiveSourceDescriptor = {
  sourceId: "live:match-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};
// @ts-expect-error a missing queueBound is malformed (back-pressure law)
const missingQueueBound: LiveSourceDescriptor = { sourceId: "live:match-1", grade: "real-local-live", contentKind: "application/jsonl", cadenceMs: 25 };
// @ts-expect-error cadenceMs must be a number
const stringCadence: LiveSourceDescriptor = { ...wellFormedDescriptor, cadenceMs: "25" };
// @ts-expect-error sourceId must be a string
const numericSourceId: LiveSourceDescriptor = { ...wellFormedDescriptor, sourceId: 1 };

// --- LiveFrame: index/payload/receivedAt, exactly. ---
const wellFormedFrame: LiveFrame = {
  index: 0,
  payload: '{"eventId":"evt-1"}',
  receivedAt: "2026-10-14T00:00:00.000Z",
};
// @ts-expect-error index must be a number
const stringIndexFrame: LiveFrame = { ...wellFormedFrame, index: "0" };
// @ts-expect-error receivedAt must be a string (Iso8601)
const numericReceivedAt: LiveFrame = { ...wellFormedFrame, receivedAt: 0 };

// --- LiveIngressRefusal: the closed kind vocabulary + counts. ---
const wellFormedRefusal: LiveIngressRefusal = {
  kind: "queue-overflow",
  detail: "queue bound exceeded at frame arrival",
  framesConsumed: 3,
};
// @ts-expect-error the refusal-kind vocabulary is closed
const inventedKindRefusal: LiveIngressRefusal = { ...wellFormedRefusal, kind: "timeout" };
// @ts-expect-error framesConsumed must be a number
const missingCountRefusal: LiveIngressRefusal = { kind: "aborted", detail: "closed" };

// --- The closed vocabularies, enumerated member by member. ---
const refusalKinds: readonly LiveIngressRefusalKind[] = [
  "invalid-descriptor",
  "queue-overflow",
  "source-unavailable",
  "aborted",
];
const closeReasons: readonly LiveCloseReason[] = ["completed", "aborted", "refused", "in-flight"];
// @ts-expect-error "closed" is not a LiveCloseReason
const inventedCloseReason: LiveCloseReason = "closed";

// --- LiveSessionEvidence: the pinned record, exactly. ---
const inFlightEvidence: LiveSessionEvidence = {
  descriptor: wellFormedDescriptor,
  framesConsumed: 0,
  openedAt: "2026-10-14T00:00:00.000Z",
  closedAt: null,
  closeReason: "in-flight",
  refusal: null,
};
const refusedEvidence: LiveSessionEvidence = {
  ...inFlightEvidence,
  closedAt: "2026-10-14T00:00:01.000Z",
  closeReason: "refused",
  refusal: wellFormedRefusal,
};
// @ts-expect-error the close-reason vocabulary is closed — evidence can never claim "production"
const productionCloseReason: LiveSessionEvidence = { ...inFlightEvidence, closeReason: "production" };
// @ts-expect-error closedAt is null until the session closes
const numericClosedAt: LiveSessionEvidence = { ...inFlightEvidence, closedAt: 0 };

// --- LiveSessionHandle / LiveSourcePort: structural conformance. ---
const handleConformance: LiveSessionHandle = {
  next: async () => ({ frame: wellFormedFrame }),
  close: async (reason: "completed" | "aborted") => ({
    ...inFlightEvidence,
    closeReason: reason,
    closedAt: "2026-10-14T00:00:02.000Z",
  }),
  evidence: () => inFlightEvidence,
};
const portConformance: LiveSourcePort = {
  open: async (_descriptor: LiveSourceDescriptor) => ({ handle: handleConformance }),
};
// @ts-expect-error next() must return a frame or a refusal with done
const badHandle: LiveSessionHandle = { ...handleConformance, next: async () => ({}) };

/**
 * Compile-time conformance evidence (the negative-lane values exist
 * only as refused test data — exactly like the TL's own freeze test
 * casts "production" through the closed vocabulary).
 */
export const liveSourceTypeConformance = {
  grades: { realLocalLive, fixtureGrade, productionRefused: productionGrade, arbitraryRefused: arbitraryGrade },
  descriptor: wellFormedDescriptor,
  frame: wellFormedFrame,
  refusal: wellFormedRefusal,
  refusalKinds,
  closeReasons,
  inFlightEvidence,
  refusedEvidence,
  handle: handleConformance,
  port: portConformance,
  negativeLanes: { inventedKindRefusal, inventedCloseReason, productionCloseReason, stringCadence, numericSourceId, stringIndexFrame, numericReceivedAt, missingCountRefusal, missingQueueBound, numericClosedAt, badHandle },
} as const;
