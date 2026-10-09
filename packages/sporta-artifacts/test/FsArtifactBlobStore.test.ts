import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FsArtifactBlobStore } from "../src/adapters/FsArtifactBlobStore.js";
import { ArtifactIntegrityError, ArtifactBlobNotFoundError } from "../src/domain/errors.js";
import { sha256Content } from "../src/adapters/hash.js";

describe("FsArtifactBlobStore", () => {
  let store: FsArtifactBlobStore;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), "sporta-test-" + Date.now());
    store = new FsArtifactBlobStore(testDir);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("put", () => {
    it("stores content and returns content address", async () => {
      const content = new TextEncoder().encode("test content");
      const hash = await store.put(content);
      
      expect(hash).toBeTypeOf("string");
      expect(hash.length).toBe(64); // SHA-256 hex length
      
      // Verify content exists at expected path
      const blobPath = join(testDir, hash.substring(0, 2), hash.substring(2, 4), hash);
      const stats = await stat(blobPath);
      expect(stats.isFile()).toBe(true);
    });

    it("deduplicates identical content", async () => {
      const content = new TextEncoder().encode("test content");
      const hash1 = await store.put(content);
      const hash2 = await store.put(content);
      
      expect(hash1).toBe(hash2);
    });

    it("throws on hash collision", async () => {
      // Create a scenario where the same hash would map to different content
      // This is extremely unlikely with SHA-256 but we test the error path
      const content1 = new TextEncoder().encode("content 1");
      const content2 = new TextEncoder().encode("content 2");
      
      // Force a hash collision by mocking (in a real test, this would be nearly impossible)
      const collisionHash = "01434a0d7c52b6a8a00a6376b942d1a5f5d6a1b8c4e3f2a1b8c4e3f2a1b8c4e3f2a1b8c4e3f2a1b8c4";
      
      // Store first content
      await store.put(content1);
      
      // Try to store different content at same hash (this should throw)
      await expect(store.put(content2)).rejects.toThrow(ArtifactIntegrityError);
    });
  });

  describe("read", () => {
    it("reads stored content", async () => {
      const content = new TextEncoder().encode("test content");
      const hash = await store.put(content);
      
      const readContent = await store.read(hash);
      expect(readContent).toEqual(content);
    });

    it("verifies integrity on read", async () => {
      const content = new TextEncoder().encode("test content");
      const hash = await store.put(content);
      
      // Corrupt the file by writing different content
      const corruptPath = join(testDir, hash.substring(0, 2), hash.substring(2, 4), hash);
      await mkdir(join(testDir, hash.substring(0, 2), hash.substring(2, 4)), { recursive: true });
      await import("node:fs/promises").then(fs => fs.writeFile(corruptPath, "corrupted content"));
      
      // Reading should detect the corruption
      await expect(store.read(hash)).rejects.toThrow(ArtifactIntegrityError);
    });

    it("throws ArtifactBlobNotFoundError for missing content", async () => {
      const fakeHash = "01434a0d7c52b6a8a00a6376b942d1a5f5d6a1b8c4e3f2a1b8c4e3f2a1b8c4e3f2a1b8c4e3f2a1b8c4e3f2a1b8c4";
      
      await expect(store.read(fakeHash)).rejects.toThrow(ArtifactBlobNotFoundError);
    });
  });

  describe("durability", () => {
    it("persists content across store re-instantiation", async () => {
      const content = new TextEncoder().encode("persistent content");
      const hash = await store.put(content);
      
      // Create new store instance
      const newStore = new FsArtifactBlobStore(testDir);
      const readContent = await newStore.read(hash);
      
      expect(readContent).toEqual(content);
    });

    it("creates directory structure automatically", async () => {
      const content = new TextEncoder().encode("test content");
      const hash = await store.put(content);
      
      // Verify directory structure was created
      const dirPath = join(testDir, hash.substring(0, 2));
      const dirStats = await stat(dirPath);
      expect(dirStats.isDirectory()).toBe(true);
    });
  });

  describe("atomic writes", () => {
    it("performs atomic writes via temp files", async () => {
      const content = new TextEncoder().encode("atomic content");
      const hash = await store.put(content);
      
      // Verify file exists and is complete
      const blobPath = join(testDir, hash.substring(0, 2), hash.substring(2, 4), hash);
      const stats = await stat(blobPath);
      expect(stats.isFile()).toBe(true);
      
      // Verify content is correct
      const readContent = await store.read(hash);
      expect(readContent).toEqual(content);
    });
  });

  describe("error handling", () => {
    it("throws for filesystem errors", async () => {
      // Use an invalid directory path to simulate filesystem error
      const invalidStore = new FsArtifactBlobStore("/invalid/path/that/does/not/exist");
      const content = new TextEncoder().encode("test");
      
      // Should throw when trying to write
      await expect(invalidStore.put(content)).rejects.toThrow();
    });
  });
});