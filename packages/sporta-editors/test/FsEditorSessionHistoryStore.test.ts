import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EditorSessionHistoryIntegrityError,
  EditorSessionHistoryService,
  FsEditorSessionHistoryStore,
  UnknownEditorSessionError,
  sha256EditorHash,
} from "../src/contract.js";
import type { EditorSessionRecord, PolicySet } from "@sporta/contracts/contract";

/**
 * FsEditorSessionHistoryStore — REAL durable-storage tests (the W2
 * FsArtifactBlobStore evidence pattern). Every test runs against a real
 * temp directory on the real filesystem: session records are written as
 * real JSON ledger files, read back byte-for-byte, corrupted by
 * overwriting real files, and durability is proven by re-instantiating
 * the store over the same directory. No mocks — the only injected seam
 * is the constructor's hash, defaulting to the real sha-256 adapter.
 */

const policy: PolicySet = {
  rights: { holders: ["holder:fs-history"], usages: ["render", "edit"], prohibitions: ["derive"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

function historyRecord(
  editorSessionId: string,
  openedAt: string,
  revisionId = "rev:fs-1",
): EditorSessionRecord {
  return {
    editorSessionId,
    editorId: "kdenlive",
    revisionId,
    mode: "local",
    integrationLevel: 2,
    openedAt,
    policy,
  };
}

async function realTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sporta-fs-editor-history-"));
}

/** The documented ledger layout: rootDir/<sha256(id)[0:2]>/<sha256(id)>.json. */
function ledgerPath(root: string, editorSessionId: string): string {
  const idHash = sha256EditorHash(editorSessionId);
  return join(root, idHash.substring(0, 2), `${idHash}.json`);
}

test("append writes a real JSON ledger file at the sharded id address", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(root);
    const record = historyRecord("es:fs-1", "2026-04-01T00:00:00.000Z");
    await store.append(record);

    const path = ledgerPath(root, "es:fs-1");
    const info = await stat(path);
    assert.ok(info.isFile());
    // REAL file content assertion: the bytes on disk parse back to the record.
    const onDisk = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(onDisk, record);
    // MEASURED real evidence: the ledger entry is a real file of real size.
    assert.ok(info.size > 100, `ledger file measured at ${info.size} bytes`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durability: a fresh store instance over the same directory reads earlier sessions", async () => {
  const root = await realTempRoot();
  try {
    const first = new FsEditorSessionHistoryStore(root);
    await first.append(historyRecord("es:dur-1", "2026-04-01T00:00:00.000Z"));
    await first.append(historyRecord("es:dur-2", "2026-04-01T00:01:00.000Z"));

    // Simulate process restart: brand-new instance, same directory.
    const second = new FsEditorSessionHistoryStore(root);
    const listed = await second.list({ limit: 10 });
    assert.equal(listed.length, 2);
    assert.deepEqual(listed[0], historyRecord("es:dur-2", "2026-04-01T00:01:00.000Z"));
    assert.deepEqual(listed[1], historyRecord("es:dur-1", "2026-04-01T00:00:00.000Z"));

    // The restarted store keeps working: closure lands and survives another restart.
    await second.close("es:dur-1", "2026-04-02T00:00:00.000Z");
    const third = new FsEditorSessionHistoryStore(root);
    const closed = await third.list({ editorSessionId: "es:dur-1", limit: 10 });
    assert.equal(closed.length, 1);
    assert.equal(closed[0]?.closedAt, "2026-04-02T00:00:00.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic writes: no temp files are left behind after appends and closes", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(root);
    for (let index = 1; index <= 5; index += 1) {
      await store.append(historyRecord(`es:atomic-${index}`, `2026-04-01T00:0${index}:00.000Z`));
    }
    await store.close("es:atomic-1", "2026-04-02T00:00:00.000Z");
    const tempDir = join(root, ".tmp");
    const leftovers = await readdir(tempDir);
    assert.deepEqual(leftovers, []);
    // MEASURED: exactly five real ledger files exist across the shards.
    let ledgerFiles = 0;
    for (const shard of await readdir(root)) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue;
      ledgerFiles += (await readdir(join(root, shard))).filter((name) =>
        name.endsWith(".json"),
      ).length;
    }
    assert.equal(ledgerFiles, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("append is idempotent per session id: the first write wins on real disk", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(root);
    await store.append(historyRecord("es:idem-1", "2026-04-01T00:00:00.000Z"));
    // A conflicting re-append for the same id must NOT overwrite the ledger.
    await store.append(historyRecord("es:idem-1", "2026-04-09T00:00:00.000Z", "rev:fs-other"));
    const onDisk = JSON.parse(await readFile(ledgerPath(root, "es:idem-1"), "utf8"));
    assert.equal(onDisk.openedAt, "2026-04-01T00:00:00.000Z");
    assert.equal(onDisk.revisionId, "rev:fs-1");
    const listed = await store.list({ limit: 10 });
    assert.equal(listed.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("close: unknown session is a typed refusal; first close wins on disk", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(root);
    await store.append(historyRecord("es:close-1", "2026-04-01T00:00:00.000Z"));
    await assert.rejects(
      () => store.close("es:missing", "2026-04-02T00:00:00.000Z"),
      (error: unknown) => {
        assert.ok(error instanceof UnknownEditorSessionError);
        assert.equal(
          (error as UnknownEditorSessionError).detail,
          "unknown-editor-session:es:missing",
        );
        return true;
      },
    );
    const closed = await store.close("es:close-1", "2026-04-02T00:00:00.000Z");
    assert.equal(closed.closedAt, "2026-04-02T00:00:00.000Z");
    const again = await store.close("es:close-1", "2026-04-08T00:00:00.000Z");
    assert.equal(again.closedAt, "2026-04-02T00:00:00.000Z");
    // The durable file itself carries the FIRST closure timestamp.
    const onDisk = JSON.parse(await readFile(ledgerPath(root, "es:close-1"), "utf8"));
    assert.equal(onDisk.closedAt, "2026-04-02T00:00:00.000Z");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("list filters structurally over real files, newest first, bounded", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(root);
    await store.append(historyRecord("es:list-1", "2026-04-01T00:00:01.000Z", "rev:fs-a"));
    await store.append(historyRecord("es:list-2", "2026-04-01T00:00:02.000Z", "rev:fs-a"));
    await store.append(historyRecord("es:list-3", "2026-04-01T00:00:03.000Z", "rev:fs-b"));
    await store.close("es:list-2", "2026-04-02T00:00:00.000Z");

    const revisionA = await store.list({ revisionId: "rev:fs-a", limit: 10 });
    assert.deepEqual(
      revisionA.map((record) => record.editorSessionId),
      ["es:list-2", "es:list-1"],
    );
    const openOnly = await store.list({ openOnly: true, limit: 10 });
    assert.deepEqual(
      openOnly.map((record) => record.editorSessionId),
      ["es:list-3", "es:list-1"],
    );
    const pinned = await store.list({ editorSessionId: "es:list-3", limit: 10 });
    assert.equal(pinned.length, 1);
    const bounded = await store.list({ limit: 2 });
    assert.equal(bounded.length, 2);
    assert.deepEqual(
      bounded.map((record) => record.editorSessionId),
      ["es:list-3", "es:list-2"],
    );
    // An empty (or absent) ledger directory lists nothing, never errors.
    assert.deepEqual(
      await new FsEditorSessionHistoryStore(join(root, "absent")).list({ limit: 10 }),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("corrupted ledger files are typed integrity errors, never silent corruption", async () => {
  // Scenario A: a real ledger file overwritten with non-JSON bytes.
  const rootA = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(rootA);
    await store.append(historyRecord("es:corrupt-1", "2026-04-01T00:00:00.000Z"));
    await writeFile(ledgerPath(rootA, "es:corrupt-1"), "this is not json");
    await assert.rejects(
      () => store.list({ limit: 10 }),
      (error: unknown) => {
        assert.ok(error instanceof EditorSessionHistoryIntegrityError);
        assert.match((error as EditorSessionHistoryIntegrityError).detail, /:not-json$/);
        return true;
      },
    );
  } finally {
    await rm(rootA, { recursive: true, force: true });
  }

  // Scenario B: a record whose editorSessionId does not hash to its own
  // file address (a misfiled or tampered ledger entry).
  const rootB = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(rootB);
    await store.append(historyRecord("es:corrupt-2", "2026-04-01T00:01:00.000Z"));
    const swapped = {
      ...historyRecord("es:someone-else", "2026-04-01T00:01:00.000Z"),
    };
    await writeFile(ledgerPath(rootB, "es:corrupt-2"), JSON.stringify(swapped, null, 2));
    await assert.rejects(
      () => store.list({ limit: 10 }),
      (error: unknown) => {
        assert.ok(error instanceof EditorSessionHistoryIntegrityError);
        assert.match((error as EditorSessionHistoryIntegrityError).detail, /:id-address-mismatch$/);
        return true;
      },
    );
  } finally {
    await rm(rootB, { recursive: true, force: true });
  }

  // Scenario C: a ledger entry missing required record fields.
  const rootC = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(rootC);
    await store.append(historyRecord("es:corrupt-3", "2026-04-01T00:02:00.000Z"));
    await writeFile(
      ledgerPath(rootC, "es:corrupt-3"),
      JSON.stringify({ editorSessionId: "es:corrupt-3" }),
    );
    await assert.rejects(
      () => store.list({ limit: 10 }),
      (error: unknown) => {
        assert.ok(error instanceof EditorSessionHistoryIntegrityError);
        assert.match((error as EditorSessionHistoryIntegrityError).detail, /:missing-editorId$/);
        return true;
      },
    );
  } finally {
    await rm(rootC, { recursive: true, force: true });
  }
});

test("the durable ledger backs the rights-gated read seam end-to-end", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsEditorSessionHistoryStore(root);
    const reads = new EditorSessionHistoryService({ history: store });
    await store.append(historyRecord("es:seam-1", "2026-04-01T00:00:00.000Z"));

    // render is permitted by the durable record's PolicySet.
    const render = await reads.listEditorSessions({ usage: { usages: ["render"] } });
    assert.equal(render.length, 1);
    assert.equal(render[0]?.editorSessionId, "es:seam-1");
    assert.equal(render[0]?.editorId, "kdenlive");
    // derive hits the durable record's prohibition: honest absence.
    const derive = await reads.listEditorSessions({ usage: { usages: ["derive"] } });
    assert.deepEqual(derive, []);
    // Durability: a second instance (fresh process) gates identically.
    const restarted = new EditorSessionHistoryService({
      history: new FsEditorSessionHistoryStore(root),
    });
    assert.deepEqual(await restarted.listEditorSessions({ usage: { usages: ["derive"] } }), []);
    assert.equal((await restarted.listEditorSessions({ usage: { usages: ["render"] } })).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("put surfaces real filesystem errors instead of swallowing them", async () => {
  // A root that is a regular FILE: every ledger write under it fails.
  const root = await realTempRoot();
  try {
    const blocker = join(root, "blocker");
    await writeFile(blocker, "i am a file, not a directory");
    const store = new FsEditorSessionHistoryStore(blocker);
    await assert.rejects(store.append(historyRecord("es:fs-fail", "2026-04-01T00:00:00.000Z")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
