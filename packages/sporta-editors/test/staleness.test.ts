import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStaleness,
  participantRecord,
  stalenessSnapshot,
  validateStalenessPolicy,
  InvalidStalenessPolicyError,
} from '../src/domain/sharedSession/staleness/staleness.js';

const POLICY = Object.freeze({ staleAfterMs: 30_000, expiredAfterMs: 120_000 });

test('w6c-2: FRESH below staleAfterMs carries participant id, measured age, threshold', () => {
  const d = classifyStaleness(participantRecord('p1', 1_000), 1_000 + 29_999, POLICY);
  assert.equal(d.classification, 'FRESH');
  assert.equal(d.ageMs, 29_999);
  assert.equal(d.thresholdMs, POLICY.staleAfterMs);
  assert.equal(d.participantId, 'p1');
});

test('w6c-2: boundary age === staleAfterMs → STALE (inclusive on the later class)', () => {
  const d = classifyStaleness(participantRecord('p1', 0), 30_000, POLICY);
  assert.equal(d.classification, 'STALE');
  assert.equal(d.ageMs, 30_000);
});

test('w6c-2: STALE interior of the band', () => {
  assert.equal(classifyStaleness(participantRecord('p1', 0), 30_001, POLICY).classification, 'STALE');
  assert.equal(classifyStaleness(participantRecord('p1', 0), 119_999, POLICY).classification, 'STALE');
});

test('w6c-2: boundary age === expiredAfterMs → EXPIRED', () => {
  const d = classifyStaleness(participantRecord('p1', 0), 120_000, POLICY);
  assert.equal(d.classification, 'EXPIRED');
  assert.equal(d.thresholdMs, POLICY.expiredAfterMs);
});

test('w6c-2: missing heartbeat record → EXPIRED fail-closed, never fresh', () => {
  const d = classifyStaleness(participantRecord('p1', null), 999_999, POLICY);
  assert.equal(d.classification, 'EXPIRED');
  assert.equal(d.ageMs, null);
  assert.equal(d.thresholdMs, POLICY.expiredAfterMs);
});

test('w6c-2: threshold ordering enforced — expiredAfterMs < staleAfterMs throws', () => {
  assert.throws(() => validateStalenessPolicy({ staleAfterMs: 10, expiredAfterMs: 5 }), InvalidStalenessPolicyError);
});

test('w6c-2: negative thresholds throw', () => {
  assert.throws(() => validateStalenessPolicy({ staleAfterMs: -1, expiredAfterMs: 10 }), InvalidStalenessPolicyError);
  assert.throws(() => validateStalenessPolicy({ staleAfterMs: 0, expiredAfterMs: -1 }), InvalidStalenessPolicyError);
});

test('w6c-2: non-finite thresholds throw', () => {
  assert.throws(() => validateStalenessPolicy({ staleAfterMs: Number.NaN, expiredAfterMs: 10 }), InvalidStalenessPolicyError);
  assert.throws(() => validateStalenessPolicy({ staleAfterMs: 0, expiredAfterMs: Number.POSITIVE_INFINITY }), InvalidStalenessPolicyError);
});

test('w6c-2: equal thresholds are legal — no STALE band exists', () => {
  const p = { staleAfterMs: 50, expiredAfterMs: 50 };
  assert.equal(classifyStaleness(participantRecord('p1', 0), 49, p).classification, 'FRESH');
  assert.equal(classifyStaleness(participantRecord('p1', 0), 50, p).classification, 'EXPIRED');
});

test('w6c-2: determinism — same inputs → identical decision, repeated', () => {
  const a = classifyStaleness(participantRecord('p1', 5_000), 40_000, POLICY);
  const b = classifyStaleness(participantRecord('p1', 5_000), 40_000, POLICY);
  assert.deepEqual(b, a);
});

test('w6c-2: snapshot — counts derived, input order preserved', () => {
  // Station fix: 'late' heartbeat moved to 10_000 (age 110_000 — strictly
  // inside the STALE band). At the original 0 the age hit the expiry
  // boundary exactly (120_000), which the boundary law classifies EXPIRED.
  const snapshot = stalenessSnapshot(
    [participantRecord('late', 10_000), participantRecord('ghost', null), participantRecord('fresh', 115_000)],
    120_000,
    POLICY,
  );
  assert.deepEqual(snapshot.counts, { FRESH: 1, STALE: 1, EXPIRED: 1 });
  assert.deepEqual(snapshot.decisions.map((d) => d.participantId), ['late', 'ghost', 'fresh']);
  assert.equal(snapshot.nowMs, 120_000);
});

test('w6c-2: empty input → empty snapshot with zero counts', () => {
  const snapshot = stalenessSnapshot([], 1, POLICY);
  assert.deepEqual(snapshot.decisions, []);
  assert.deepEqual(snapshot.counts, { FRESH: 0, STALE: 0, EXPIRED: 0 });
});

test('w6c-2: negative age (heartbeat ahead of now) → FRESH by the pure-comparison law', () => {
  const d = classifyStaleness(participantRecord('p1', 2_000), 1_000, POLICY);
  assert.equal(d.classification, 'FRESH');
  assert.equal(d.ageMs, -1_000);
});
