/**
 * Wave-3 escalation read seam tests (EscalationReadPort on ArenaClientService).
 *
 * EVIDENCE CLASS: fixture — the ArenaClientService store and the
 * InMemoryArenaTransport are fixture-grade in-memory doubles; the
 * read-seam LOGIC under test is production code. No network, no real
 * Arena.
 *
 * Project law: node:test + tsx only — no describe/it/expect globals.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EscalationReadPort } from "@sporta/contracts/contract";
import { ArenaClientService, InMemoryArenaTransport } from "../src/contract.js";
import { fixtureEscalateInput, fixtureGapInput } from "./fixtures.js";

async function newClient(): Promise<ArenaClientService> {
  const transport = new InMemoryArenaTransport();
  const client = new ArenaClientService({ transport });
  return client;
}

/** Create `count` escalations on distinct gaps/graphs; return the records. */
async function seedEscalations(
  client: ArenaClientService,
  count: number,
): Promise<readonly ReturnType<ArenaClientService["escalate"]>[]> {
  const records = [];
  for (let index = 1; index <= count; index += 1) {
    await client.recordGap(
      fixtureGapInput({
        gapId: `gap:seam-${index}`,
        workGraphId: `wg:seam-${index}`,
      }),
    );
    const record = await client.escalate(
      fixtureEscalateInput({
        idempotencyKey: `esc-key-${index}`,
        gapId: `gap:seam-${index}`,
      }),
    );
    records.push(record);
  }
  return records;
}

test("the service satisfies the frozen EscalationReadPort shape (additive, no port-surface change)", () => {
  const client = new ArenaClientService({ transport: new InMemoryArenaTransport() });
  const seam: EscalationReadPort = client; // structural typing: both ports on one service
  assert.equal(typeof seam.listEscalations, "function");
  assert.equal(typeof seam.listResults, "function");
});

test("listEscalations returns field-for-field summaries in creation order", async () => {
  const client = await newClient();
  const records = await seedEscalations(client, 3);
  const summaries = await client.listEscalations({});
  assert.deepEqual(
    summaries,
    records.map((record) => ({
      escalationId: record.escalationId,
      gapId: record.gapId,
      workGraphId: record.workGraphId,
      sessionMode: record.sessionMode,
      lifecycle: record.lifecycle,
    })),
  );
  assert.equal(summaries.length, 3);
});

test("listEscalations filters by workGraphId, gapId and escalationId", async () => {
  const client = await newClient();
  const records = await seedEscalations(client, 3);
  const second = records[1];
  assert.ok(second !== undefined);

  assert.deepEqual(await client.listEscalations({ workGraphId: "wg:seam-2" }), [
    {
      escalationId: second.escalationId,
      gapId: second.gapId,
      workGraphId: second.workGraphId,
      sessionMode: second.sessionMode,
      lifecycle: second.lifecycle,
    },
  ]);
  const byGap = await client.listEscalations({ gapId: "gap:seam-1" });
  assert.equal(byGap.length, 1);
  assert.equal(byGap[0]?.gapId, "gap:seam-1");
  const byId = await client.listEscalations({ escalationId: second.escalationId });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.escalationId, second.escalationId);
  assert.deepEqual(await client.listEscalations({ workGraphId: "wg:none" }), []);
});

test("listEscalations default limit is capped at 50, hard cap 200 (bounded-query law)", async () => {
  const client = await newClient();
  await seedEscalations(client, 205);
  const defaultList = await client.listEscalations({});
  assert.equal(defaultList.length, 50, "default limit caps at 50");
  const explicit = await client.listEscalations({ limit: 3 });
  assert.equal(explicit.length, 3);
  const overHardCap = await client.listEscalations({ limit: 500 });
  assert.equal(overHardCap.length, 200, "requested limits above the hard cap are capped at 200");
});

test("listResults mirrors ArenaResultRecord field-for-field after the simulated session", async () => {
  const transport = new InMemoryArenaTransport();
  const client = new ArenaClientService({ transport });
  await seedEscalations(client, 1);
  const [record] = await client.listEscalations({});
  assert.ok(record !== undefined);
  await transport.advance(record.escalationId, 12); // submitted -> result produced
  const result = await client.readResult(record.escalationId);
  assert.ok(result !== null);

  assert.deepEqual(await client.listResults({}), [
    {
      resultId: result.resultId,
      escalationId: result.escalationId,
      resultType: result.resultType,
      validated: result.validated,
    },
  ]);
});

test("listResults filters by escalationId, resultId and validatedOnly", async () => {
  const transport = new InMemoryArenaTransport();
  const client = new ArenaClientService({ transport });
  await seedEscalations(client, 2);
  const summaries = await client.listEscalations({});
  await transport.advance(summaries[0]?.escalationId ?? "", 12);
  await transport.advance(summaries[1]?.escalationId ?? "", 12);
  const first = await client.readResult(summaries[0]?.escalationId ?? "");
  assert.ok(first !== null);

  assert.equal((await client.listResults({ escalationId: first.escalationId })).length, 1);
  assert.equal((await client.listResults({ resultId: first.resultId })).length, 1);
  assert.equal((await client.listResults({ resultId: "res:none" })).length, 0);
  // the fake transport never claims validation: validatedOnly stays empty
  assert.deepEqual(await client.listResults({ validatedOnly: true }), []);
  assert.equal((await client.listResults({})).length, 2);
});

test("listResults is empty for escalations with no result and for unknown escalations", async () => {
  const client = await newClient();
  await seedEscalations(client, 1);
  assert.deepEqual(await client.listResults({}), [], "no results before the session");
  assert.deepEqual(await client.listResults({ escalationId: "esc:unknown" }), []);
});

test("the read seam performs no writes: repeated reads converge and never re-submit", async () => {
  const transport = new InMemoryArenaTransport();
  const client = new ArenaClientService({ transport });
  await seedEscalations(client, 2);
  await transport.advance((await client.listEscalations({}))[0]?.escalationId ?? "", 12);

  // First result read mirrors the authoritative Arena lifecycle into the
  // client's own record copy (the readResult boundary law — read-only
  // against every OTHER module's state, sync of the client's own copy).
  await client.listResults({});
  const afterFirst = await client.listEscalations({});
  await client.listResults({});
  await client.listResults({ validatedOnly: true });
  const afterRepeat = await client.listEscalations({});
  assert.deepEqual(afterRepeat, afterFirst, "repeated seam reads converge (no mirroring drift)");

  const idempotent = await client.escalate(
    fixtureEscalateInput({ idempotencyKey: "esc-key-1", gapId: "gap:seam-1" }),
  );
  assert.equal(idempotent.escalationId, afterFirst[0]?.escalationId, "idempotency keys unaffected");
  assert.equal(transport.submissions().length, 2, "seam reads never submit to the transport");
  assert.ok(afterFirst[0]?.lifecycle !== "created", "the mirror did sync the own copy");
});
