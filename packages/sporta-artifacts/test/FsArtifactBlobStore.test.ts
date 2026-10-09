import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArtifactBlobNotFoundError,
  ArtifactIntegrityError,
  FsArtifactBlobStore,
  sha256Content,
} from "../src/contract.js";

/**
 * FsArtifactBlobStore — REAL durable-storage tests. Every test runs
 * against a real temp directory on the real filesystem: content is
 * written, read back and byte-compared; corruption is produced by
 * overwriting real files; durability is proven by re-instantiating the
 * store over the same directory. No mocks — the only injected seam is an
 * explicit fake hash used to force a collision (labeled below).
 */

async function realTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sporta-fs-blob-"));
}

/** The documented shard layout: rootDir/ab/cd/<rest of the hash>. */
function blobPath(root: string, contentHash: string): string {
  return join(root, contentHash.substring(0, 2), contentHash.substring(2, 4), contentHash.substring(4));
}

const encoder = new TextEncoder();

test("put stores real bytes on disk at the sharded content address", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    const content = encoder.encode("sporta durable blob");
    const contentHash = await store.put(content);

    assert.match(contentHash, /^[0-9a-f]{64}$/);
    const path = blobPath(root, contentHash);
    const info = await stat(path);
    assert.ok(info.isFile());
    assert.equal(info.size, content.byteLength);
    // REAL file content assertion: bytes on disk equal bytes stored.
    const onDisk = await readFile(path);
    assert.deepEqual(new Uint8Array(onDisk), content);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("put round-trips arbitrary binary content (all 256 byte values)", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    const binary = new Uint8Array(256);
    for (let byte = 0; byte < 256; byte += 1) binary[byte] = byte;
    const contentHash = await store.put(binary);
    assert.deepEqual(await store.read(contentHash), binary);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read returns the identical bytes as a plain Uint8Array (never a Node Buffer)", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    const content = encoder.encode("plain view");
    const contentHash = await store.put(content);
    const read = await store.read(contentHash);
    assert.deepEqual(read, content);
    assert.equal(read.constructor, Uint8Array);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("put deduplicates identical content (content-addressed no-op)", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    const content = encoder.encode("dedup me");
    const first = await store.put(content);
    const second = await store.put(content);
    assert.equal(second, first);
    // Exactly one blob file exists under the shard directory.
    const shardDir = join(root, first.substring(0, 2), first.substring(2, 4));
    const files = await readdir(shardDir);
    assert.deepEqual(files, [first.substring(4)]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("put refuses a hash collision with a typed ArtifactIntegrityError", async () => {
  const root = await realTempRoot();
  try {
    // Injected fake hash (the only non-real seam, and it is the point of
    // the test): it simulates a content address whose stored bytes no
    // longer hash to that address — the exact condition the collision
    // guard exists to catch. Call 1 stores the first content honestly;
    // call 2 claims the SAME address for different content; call 3 is
    // the guard's re-hash of the stored bytes and yields a different
    // digest, so the guard must refuse instead of deduplicating.
    const address = sha256Content(encoder.encode("first content"));
    const other = sha256Content(encoder.encode("other"));
    let invocations = 0;
    const statefulHash = (): string => {
      invocations += 1;
      return invocations === 3 ? other : address;
    };
    const store = new FsArtifactBlobStore(root, statefulHash);
    await store.put(encoder.encode("first content"));
    await assert.rejects(
      store.put(encoder.encode("second, different content")),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactIntegrityError);
        assert.equal((error as ArtifactIntegrityError).detail, `integrity:${address}`);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read throws a typed ArtifactBlobNotFoundError for missing content", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    const missing = sha256Content(encoder.encode("never stored"));
    await assert.rejects(
      store.read(missing),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactBlobNotFoundError);
        assert.equal((error as ArtifactBlobNotFoundError).detail, `blob-not-found:${missing}`);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("read detects on-disk corruption with a typed ArtifactIntegrityError", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    const content = encoder.encode("integrity matters");
    const contentHash = await store.put(content);
    // Corrupt the REAL file on disk.
    await writeFile(blobPath(root, contentHash), encoder.encode("integrity m@tters"));
    await assert.rejects(
      store.read(contentHash),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactIntegrityError);
        assert.equal((error as ArtifactIntegrityError).detail, `integrity:${contentHash}`);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durability: a fresh store instance over the same directory reads earlier blobs", async () => {
  const root = await realTempRoot();
  try {
    const first = new FsArtifactBlobStore(root);
    const content = encoder.encode("canonical work must survive");
    const contentHash = await first.put(content);

    // Simulate process restart: brand-new instance, same directory.
    const second = new FsArtifactBlobStore(root);
    assert.deepEqual(await second.read(contentHash), content);

    // The restarted store keeps working (new writes land and read back).
    const more = encoder.encode("post-restart write");
    const moreHash = await second.put(more);
    assert.deepEqual(await second.read(moreHash), more);
    assert.deepEqual(await first.read(moreHash), more);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomic writes: no temp files are left behind after puts", async () => {
  const root = await realTempRoot();
  try {
    const store = new FsArtifactBlobStore(root);
    for (let i = 0; i < 5; i += 1) {
      await store.put(encoder.encode(`atomic blob ${i}`));
    }
    const tempDir = join(root, ".tmp");
    const leftovers = await readdir(tempDir);
    assert.deepEqual(leftovers, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("put surfaces real filesystem errors instead of swallowing them", async () => {
  // A root that is a regular FILE: every shard write under it fails.
  const root = await realTempRoot();
  try {
    const blocker = join(root, "blocker");
    await writeFile(blocker, "i am a file, not a directory");
    const store = new FsArtifactBlobStore(blocker);
    await assert.rejects(store.put(encoder.encode("must fail")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
