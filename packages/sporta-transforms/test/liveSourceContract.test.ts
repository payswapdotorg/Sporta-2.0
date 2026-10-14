/**
 * W10-A freeze tests — the live-ingress contract surface (P10-01).
 *
 * Freeze law: the names exist, the vocabulary is closed, and the descriptor
 * validation fails closed on every invalid field. Implementation (the real
 * local HTTP adapter, run-manifest integration) is worker A's lane behind
 * these frozen names.
 *
 * W10A-1 EXTENSION (worker A, appended — the TL's tests above are
 * untouched): every frozen name has a named conformance test — the
 * full malformed-descriptor lane table (typed refusals, never raw
 * throws, "production" never accepted), the closed grade vocabulary
 * in BOTH directions, runtime guards over the closed vocabularies and
 * record shapes, and the compile-time conformance module (the
 * type-level assertions live in src/domain/liveSourceConformance.ts,
 * enforced by `tsc -b packages/sporta-transforms`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLiveSourceDescriptor,
  type LiveCloseReason,
  type LiveFrame,
  type LiveIngressRefusal,
  type LiveIngressRefusalKind,
  type LiveSessionEvidence,
  type LiveSourceDescriptor,
  type LiveSourceGrade,
} from "../src/contract.js";
import { liveSourceTypeConformance } from "../src/domain/liveSourceConformance.js";

const valid: LiveSourceDescriptor = {
  sourceId: "live:match-1",
  grade: "real-local-live",
  contentKind: "application/jsonl",
  cadenceMs: 25,
  queueBound: 8,
};

test("W10 freeze: live-ingress names are exported and the valid descriptor passes", () => {
  const result = validateLiveSourceDescriptor(valid);
  assert.equal(result.ok, true);
});

test("W10 freeze: empty sourceId refuses typed (fail-closed)", () => {
  const result = validateLiveSourceDescriptor({ ...valid, sourceId: "" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.refusal.kind, "invalid-descriptor");
    assert.match(result.refusal.detail, /sourceId/);
    assert.equal(result.refusal.framesConsumed, 0);
  }
});

test("W10 freeze: the grade vocabulary is closed — 'production' is refused", () => {
  const result = validateLiveSourceDescriptor({
    ...valid,
    grade: "production" as unknown as LiveSourceDescriptor["grade"],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.refusal.kind, "invalid-descriptor");
    assert.match(result.refusal.detail, /closed vocabulary/);
  }
});

test("W10 freeze: empty contentKind refuses typed", () => {
  const result = validateLiveSourceDescriptor({ ...valid, contentKind: "" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.refusal!.detail, /contentKind/);
});

test("W10 freeze: non-positive cadenceMs refuses typed", () => {
  for (const cadenceMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateLiveSourceDescriptor({ ...valid, cadenceMs });
    assert.equal(result.ok, false, `cadenceMs=${cadenceMs} must refuse`);
    if (!result.ok) assert.match(result.refusal.detail, /cadenceMs/);
  }
});

test("W10 freeze: non-integer or non-positive queueBound refuses typed (back-pressure law)", () => {
  for (const queueBound of [0, -1, 4.5]) {
    const result = validateLiveSourceDescriptor({ ...valid, queueBound });
    assert.equal(result.ok, false, `queueBound=${queueBound} must refuse`);
    if (!result.ok) assert.match(result.refusal.detail, /queueBound/);
  }
});

// ---------------------------------------------------------------------------
// W10A-1 extension (worker A) — full conformance for every frozen name.
// ---------------------------------------------------------------------------

/** Every malformed-descriptor lane (W10A-1): each refuses typed, never throws raw. */
const MALFORMED_LANES: readonly { name: string; descriptor: unknown }[] = [
  { name: "missing sourceId", descriptor: { ...valid, sourceId: undefined } },
  { name: "non-string sourceId", descriptor: { ...valid, sourceId: 7 } },
  { name: "empty sourceId", descriptor: { ...valid, sourceId: "" } },
  { name: "missing grade", descriptor: { ...valid, grade: undefined } },
  { name: "grade 'production'", descriptor: { ...valid, grade: "production" } },
  { name: "arbitrary grade", descriptor: { ...valid, grade: "real-cdn-live" } },
  { name: "numeric grade", descriptor: { ...valid, grade: 0 } },
  { name: "missing contentKind", descriptor: { ...valid, contentKind: undefined } },
  { name: "non-string contentKind", descriptor: { ...valid, contentKind: 42 } },
  { name: "empty contentKind", descriptor: { ...valid, contentKind: "" } },
  { name: "missing cadenceMs", descriptor: { ...valid, cadenceMs: undefined } },
  { name: "non-number cadenceMs", descriptor: { ...valid, cadenceMs: "25" } },
  { name: "zero cadenceMs", descriptor: { ...valid, cadenceMs: 0 } },
  { name: "negative cadenceMs", descriptor: { ...valid, cadenceMs: -5 } },
  { name: "NaN cadenceMs", descriptor: { ...valid, cadenceMs: Number.NaN } },
  { name: "infinite cadenceMs", descriptor: { ...valid, cadenceMs: Number.POSITIVE_INFINITY } },
  { name: "missing queueBound", descriptor: { ...valid, queueBound: undefined } },
  { name: "non-number queueBound", descriptor: { ...valid, queueBound: "8" } },
  { name: "zero queueBound", descriptor: { ...valid, queueBound: 0 } },
  { name: "negative queueBound", descriptor: { ...valid, queueBound: -2 } },
  { name: "fractional queueBound", descriptor: { ...valid, queueBound: 4.5 } },
];

test("W10A-1 freeze: EVERY malformed-descriptor lane returns a typed refusal, never throws raw (fail-closed)", () => {
  for (const lane of MALFORMED_LANES) {
    let result: ReturnType<typeof validateLiveSourceDescriptor>;
    assert.doesNotThrow(
      () => {
        result = validateLiveSourceDescriptor(lane.descriptor as LiveSourceDescriptor);
      },
      `lane "${lane.name}" must never throw raw`,
    );
    assert.equal(result!.ok, false, `lane "${lane.name}" must refuse`);
    if (!result!.ok) {
      assert.equal(result!.refusal.kind, "invalid-descriptor", `lane "${lane.name}" refusal kind`);
      assert.equal(result!.refusal.framesConsumed, 0, `lane "${lane.name}" refuses before any frames`);
      assert.ok(result!.refusal.detail.length > 0, `lane "${lane.name}" carries a detail`);
    }
  }
});

test("W10A-1 freeze: the grade vocabulary is closed in BOTH directions — 'fixture' is the other legal grade", () => {
  const fixtureLane = validateLiveSourceDescriptor({ ...valid, grade: "fixture" });
  assert.equal(fixtureLane.ok, true, "grade 'fixture' is legal vocabulary");
  const realLocalLane = validateLiveSourceDescriptor({ ...valid, grade: "real-local-live" });
  assert.equal(realLocalLane.ok, true, "grade 'real-local-live' is legal vocabulary");
  for (const grade of ["production", "prod", "real", "staging", "real-local", ""] as const) {
    const refused = validateLiveSourceDescriptor({
      ...valid,
      grade: grade as unknown as LiveSourceDescriptor["grade"],
    });
    assert.equal(refused.ok, false, `grade "${grade}" must be refused (closed vocabulary)`);
  }
});

test("W10A-1 freeze: runtime guards — the closed vocabularies carry exactly their frozen members", () => {
  assert.deepEqual([...liveSourceTypeConformance.refusalKinds], [
    "invalid-descriptor",
    "queue-overflow",
    "source-unavailable",
    "aborted",
  ] satisfies LiveIngressRefusalKind[]);
  assert.deepEqual([...liveSourceTypeConformance.closeReasons], [
    "completed",
    "aborted",
    "refused",
    "in-flight",
  ] satisfies LiveCloseReason[]);
  const grades: readonly string[] = [
    liveSourceTypeConformance.grades.realLocalLive,
    liveSourceTypeConformance.grades.fixtureGrade,
  ];
  assert.deepEqual(grades, ["real-local-live", "fixture"]);
  // The refused negative lanes stay refused words — never legal grades.
  const refusedGrades: readonly string[] = [
    liveSourceTypeConformance.grades.productionRefused,
    liveSourceTypeConformance.grades.arbitraryRefused,
  ];
  for (const grade of refusedGrades) {
    const result = validateLiveSourceDescriptor({
      ...valid,
      grade: grade as unknown as LiveSourceDescriptor["grade"],
    });
    assert.equal(result.ok, false, `negative-lane grade "${grade}" must never validate`);
  }
});

test("W10A-1 freeze: runtime guards — frame/refusal/evidence record shapes against the frozen types", () => {
  const frame: LiveFrame = {
    index: 0,
    payload: '{"eventId":"evt-1"}',
    receivedAt: "2026-10-14T00:00:00.000Z",
  };
  assert.equal(typeof frame.index, "number");
  assert.equal(typeof frame.payload, "string");
  assert.ok(!Number.isNaN(Date.parse(frame.receivedAt)), "receivedAt is a parseable Iso8601 timestamp");

  const refusal: LiveIngressRefusal = {
    kind: "queue-overflow",
    detail: "queue bound exceeded at frame arrival",
    framesConsumed: 3,
  };
  assert.equal(typeof refusal.kind, "string");
  assert.equal(typeof refusal.detail, "string");
  assert.equal(typeof refusal.framesConsumed, "number");

  const evidence: LiveSessionEvidence = {
    descriptor: valid,
    framesConsumed: 5,
    openedAt: "2026-10-14T00:00:00.000Z",
    closedAt: null,
    closeReason: "in-flight",
    refusal: null,
  };
  assert.equal(typeof evidence.framesConsumed, "number");
  assert.equal(evidence.closedAt, null);
  assert.equal(evidence.closeReason, "in-flight");
  assert.deepEqual(evidence.descriptor, valid, "the evidence pins its descriptor verbatim");

  // The conformance module's records satisfy the same guards.
  const conformanceEvidence = liveSourceTypeConformance.refusedEvidence;
  assert.equal(conformanceEvidence.closeReason, "refused");
  assert.equal(conformanceEvidence.refusal?.kind, "queue-overflow");
  assert.ok(!JSON.stringify(conformanceEvidence).includes("production"), "evidence never claims 'production'");
});

test("W10A-1 freeze: type-level conformance is compiled into the build (two-sided @ts-expect-error law)", () => {
  // The assertions themselves are compile-time (src/domain/liveSourceConformance.ts
  // is compiled by tsc -b via tsconfig include: ["src"]); here we observe the
  // module exists, is pure data, and the negative lanes never validate.
  const module = liveSourceTypeConformance;
  assert.equal(module.descriptor.grade satisfies LiveSourceGrade, "real-local-live");
  assert.equal(module.inFlightEvidence.closeReason, "in-flight");
  assert.equal(module.handle.evidence().closeReason, "in-flight");
});
