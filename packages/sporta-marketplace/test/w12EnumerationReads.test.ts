/**
 * W12-03/04 — the TL Wave 0 freeze test: the creator-side candidate
 * enumeration read (`CreatorCandidateQueryService` over the in-memory
 * store's additive `listAll()`; the frozen `CandidateStorePort` untouched).
 *
 * EVIDENCE CLASS: REAL lifecycle observations over fixture content —
 * state transitions and enumeration are real, digests are REAL sha256.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CreatorCandidateQueryService,
  InMemoryCandidateStore,
} from "../src/contract.js";
import { makeCandidateInput, makeWorld } from "./helpers.js";

test("W12-03 listAll: empty store enumerates empty (no fabricated candidates)", () => {
  const store = new InMemoryCandidateStore();
  const query = new CreatorCandidateQueryService({ candidates: store });
  assert.deepEqual(query.listAll(), []);
  assert.deepEqual(query.listByCreator("user:nobody"), []);
});

test("W12-03 listByCreator: REAL DRAFT + SUBMITTED records enumerate in insertion order", () => {
  const world = makeWorld();
  const query = new CreatorCandidateQueryService({ candidates: world.candidates });
  const draft = world.submission.startDraft(makeCandidateInput("1.0.0"));
  const draft2 = world.submission.startDraft({
    ...makeCandidateInput("1.1.0"),
    submittedBy: "user:other-creator",
  });
  const submitted = world.submission.submitCandidate(draft.candidateId);

  const all = query.listAll();
  assert.equal(all.length, 2, "two REAL candidate slots");
  assert.equal(all[0]?.candidateId, draft.candidateId, "insertion order");
  assert.equal(all[1]?.candidateId, draft2.candidateId, "insertion order");

  // The creator's own view: drafts included, other creators excluded.
  const mine = query.listByCreator(draft.submittedBy);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]?.candidateId, draft.candidateId);
  assert.equal(mine[0]?.lifecycle, "SUBMITTED", "the slot reflects the LIVE record");
  assert.deepEqual(mine[0], submitted, "verbatim: the enumerated record IS the submitted record");

  const others = query.listByCreator("user:other-creator");
  assert.equal(others.length, 1);
  assert.equal(others[0]?.lifecycle, "DRAFT");
});

test("W12-03 draft replacement updates the SAME slot in place (no shadow duplicates)", () => {
  const world = makeWorld();
  const query = new CreatorCandidateQueryService({ candidates: world.candidates });
  const draft = world.submission.startDraft(makeCandidateInput("2.0.0"));
  // Replace the draft with different content (drafts are private/replaceable).
  const replaced = world.submission.startDraft({
    ...makeCandidateInput("2.0.0"),
    manifestDigest: `sha256:${"b".repeat(64)}`,
  });

  const all = query.listAll();
  assert.equal(all.length, 1, "one slot — the replacement did not fork the enumeration");
  assert.equal(all[0]?.candidateId, replaced.candidateId);
  assert.equal(all[0]?.manifestDigest, replaced.manifestDigest);
  assert.notEqual(all[0]?.manifestDigest, draft.manifestDigest, "content actually changed");
});
