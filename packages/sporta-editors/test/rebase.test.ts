import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rebaseDelta,
  RebaseNotExpressibleError,
  type RebaseLogEntry,
} from '../src/domain/sharedSession/rebase/rebase.js';

const REFUSED = Object.freeze({ deltaId: 'd-9', baseRevision: 3, payload: { kind: 'cell-edit', path: 'score:1:points', value: 7 }, touches: ['score:1:points'] });

test('w6c-3: rebasable case — base moved to head, payload re-anchored by the pure transform', () => {
  const log: RebaseLogEntry[] = [
    { entryId: 'e4', revision: 4, touches: ['score:2:points'] },
    { entryId: 'e5', revision: 5, touches: ['score:3:points'] },
  ];
  const out = rebaseDelta(REFUSED, log, 5, {
    reanchor: (payload) => ({ ...(payload as { value: number }), value: 7 + 2 }),
  });
  assert.equal(out.kind, 'rebased');
  if (out.kind !== 'rebased') return;
  assert.equal(out.delta.baseRevision, 5);
  assert.deepEqual(out.delta.payload, { kind: 'cell-edit', path: 'score:1:points', value: 9 });
  assert.deepEqual(out.delta.rebase, { previousBaseRevision: 3, appliedLogRevisions: [4, 5] });
});

test('w6c-3: rebasable case without a reanchor — identity re-anchor (disjoint surfaces)', () => {
  const out = rebaseDelta(REFUSED, [{ revision: 4, touches: ['other:coordinate'] }], 4);
  assert.equal(out.kind, 'rebased');
  if (out.kind !== 'rebased') return;
  assert.equal(out.delta.payload, REFUSED.payload);
  assert.equal(out.delta.baseRevision, 4);
});

test('w6c-3: empty-log case — base already at head is a trivial rebase', () => {
  const out = rebaseDelta({ ...REFUSED, baseRevision: 5 }, [], 5);
  assert.equal(out.kind, 'rebased');
  if (out.kind !== 'rebased') return;
  assert.deepEqual(out.delta.rebase, { previousBaseRevision: 5, appliedLogRevisions: [] });
});

test('w6c-3: refusal case — conflicting entry named by entryId', () => {
  const out = rebaseDelta(REFUSED, [{ entryId: 'e4', revision: 4, touches: ['score:1:points'] }], 4);
  assert.equal(out.kind, 'not-expressible');
  if (out.kind !== 'not-expressible') return;
  assert.ok(out.error instanceof RebaseNotExpressibleError);
  assert.equal(out.error.conflictingEntryId, 'e4');
  assert.equal(out.error.conflictingRevision, 4);
  assert.equal(out.error.reason, 'touch-surface-intersection');
});

test('w6c-3: refusal naming falls back to revision:<n> when entryId is absent', () => {
  const out = rebaseDelta(REFUSED, [{ revision: 4, touches: ['score:1:points'] }], 4);
  assert.equal(out.kind, 'not-expressible');
  if (out.kind !== 'not-expressible') return;
  assert.equal(out.error.conflictingEntryId, 'revision:4');
});

test('w6c-3: FIRST conflicting entry in log order is named (log-order determinism)', () => {
  const a = rebaseDelta(REFUSED, [
    { entryId: 'first', revision: 4, touches: ['score:1:points'] },
    { entryId: 'second', revision: 5, touches: ['score:1:points'] },
  ], 5);
  const b = rebaseDelta(REFUSED, [
    { entryId: 'second', revision: 4, touches: ['score:1:points'] },
    { entryId: 'first', revision: 5, touches: ['score:1:points'] },
  ], 5);
  assert.equal(a.kind, 'not-expressible');
  assert.equal(b.kind, 'not-expressible');
  if (a.kind === 'not-expressible' && b.kind === 'not-expressible') {
    assert.equal(a.error.conflictingEntryId, 'first');
    assert.equal(b.error.conflictingEntryId, 'second');
  }
});

test('w6c-3: wildcard "*" intersects any known surface', () => {
  const out = rebaseDelta(REFUSED, [{ revision: 4, touches: ['*'] }], 4);
  assert.equal(out.kind, 'not-expressible');
});

test('w6c-3: unknown surface on the LOG entry → fail-closed not-expressible', () => {
  const out = rebaseDelta(REFUSED, [{ revision: 4 }], 4);
  assert.equal(out.kind, 'not-expressible');
  if (out.kind !== 'not-expressible') return;
  assert.equal(out.error.reason, 'unknown-touch-surface');
});

test('w6c-3: unknown surface on the REFUSED delta → fail-closed not-expressible', () => {
  const out = rebaseDelta({ baseRevision: 3, payload: {}, touches: undefined }, [{ revision: 4, touches: ['x'] }], 4);
  assert.equal(out.kind, 'not-expressible');
  if (out.kind !== 'not-expressible') return;
  assert.equal(out.error.reason, 'unknown-touch-surface');
});

test('w6c-3: invalid — base ahead of head', () => {
  const out = rebaseDelta({ baseRevision: 9, payload: {} }, [], 5);
  assert.equal(out.kind, 'invalid-input');
  if (out.kind === 'invalid-input') assert.equal(out.error.reason, 'base-ahead-of-head');
});

test('w6c-3: invalid — head ahead of base with an EMPTY log (a silent rebase would fake-apply)', () => {
  const out = rebaseDelta({ baseRevision: 3, payload: {}, touches: ['x'] }, [], 5);
  assert.equal(out.kind, 'invalid-input');
  if (out.kind === 'invalid-input') assert.equal(out.error.reason, 'log-does-not-cover-intervening-revisions');
});

test('w6c-3: invalid — non-ascending log', () => {
  const log = [
    { revision: 5, touches: ['a'] },
    { revision: 4, touches: ['b'] },
  ];
  const out = rebaseDelta({ baseRevision: 3, payload: {}, touches: ['c'] }, log, 5);
  assert.equal(out.kind, 'invalid-input');
  if (out.kind === 'invalid-input') assert.equal(out.error.reason, 'log-not-ascending');
});

test('w6c-3: invalid — log revision out of (base, head]', () => {
  const out = rebaseDelta({ baseRevision: 3, payload: {}, touches: ['c'] }, [{ revision: 3, touches: ['a'] }], 5);
  assert.equal(out.kind, 'invalid-input');
  if (out.kind === 'invalid-input') assert.equal(out.error.reason, 'log-revision-out-of-range');
});

test('w6c-3: invalid — non-integer revisions', () => {
  assert.equal(rebaseDelta({ baseRevision: 1.5, payload: {} }, [], 2).kind, 'invalid-input');
  assert.equal(rebaseDelta({ baseRevision: 1, payload: {} }, [{ revision: Number.NaN, touches: ['a'] }], 2).kind, 'invalid-input');
});

test('w6c-3: idempotence — rebasing an already-rebased delta against an empty log at the same head is a no-op on (baseRevision, payload)', () => {
  const first = rebaseDelta(REFUSED, [{ revision: 4, touches: ['other'] }], 4);
  assert.equal(first.kind, 'rebased');
  if (first.kind !== 'rebased') return;
  const second = rebaseDelta(first.delta, [], 4);
  assert.equal(second.kind, 'rebased');
  if (second.kind !== 'rebased') return;
  assert.equal(second.delta.baseRevision, first.delta.baseRevision);
  assert.equal(second.delta.payload, first.delta.payload);
  assert.deepEqual(second.delta.rebase.appliedLogRevisions, []);
});

test('w6c-3: determinism — identical inputs give deep-identical outcomes across runs', () => {
  const log: RebaseLogEntry[] = [{ revision: 4, touches: ['a'] }, { revision: 5, touches: ['b'] }];
  const one = rebaseDelta(REFUSED, log, 5);
  const two = rebaseDelta(REFUSED, log, 5);
  assert.deepEqual(two, one);
  assert.notEqual(one.kind, 'invalid-input');
  assert.ok(one.kind === 'rebased' || one.kind === 'not-expressible');
});
