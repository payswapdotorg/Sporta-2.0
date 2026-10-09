import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ContentHash } from "@sporta/contracts/contract";
import { ArtifactIntegrityError, ArtifactBlobNotFoundError } from "../domain/errors.js";
import type { ArtifactBlobStorePort, ArtifactContentHashFn } from "../domain/ports.js";
import { sha256Content } from "./hash.js";
/**
 * Durable filesystem-based content-addressed blob store (adapters layer).
 *
 * Blobs live as ordinary files under a two-level shard of their sha-256
 * content address (`ab/cd/<hash>`). Writes are atomic: content lands in a
 * `.tmp` staging file inside the store root and is renamed into place, so
 * a reader never observes a torn blob. Integrity is verified on EVERY read
 * and on every dedup hit — stored bytes that do not hash back to their
 * content address raise a typed ArtifactIntegrityError, never silent
 * corruption.
 */

/** Monotonic suffix so concurrent puts of equal content never share a temp path. */
let tempCounter = 0;

export class FsArtifactBlobStore implements ArtifactBlobStorePort {
  private readonly rootDir: string;
  private readonly hash: ArtifactContentHashFn;

  constructor(
    rootDir: string = join(tmpdir(), "sporta-artifacts"),
    hash: ArtifactContentHashFn = sha256Content,
  ) {
    this.rootDir = rootDir;
    this.hash = hash;
  }

  async put(content: Uint8Array): Promise<ContentHash> {
    const contentHash = this.hash(content);
    const blobPath = this.pathFor(contentHash);

    // Content-addressed dedup: an identical blob already present is a no-op;
    // different bytes at the same address is a collision, never a overwrite.
    const existing = await this.readQuietly(blobPath);
    if (existing !== null) {
      if (this.hash(existing) === contentHash) return contentHash;
      throw new ArtifactIntegrityError(
        `hash collision: content address ${contentHash} already stores different bytes`,
        contentHash,
      );
    }

    // Atomic write: stage in .tmp, fsync-free rename into the sharded path.
    await fs.mkdir(dirname(blobPath), { recursive: true });
    const tempDir = join(this.rootDir, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });
    tempCounter += 1;
    const tempPath = join(tempDir, `put-${contentHash}-${process.pid}-${tempCounter}`);
    try {
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, blobPath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
    return contentHash;
  }

  async read(contentHash: ContentHash): Promise<Uint8Array> {
    let stored: Buffer;
    try {
      stored = await fs.readFile(this.pathFor(contentHash));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ArtifactBlobNotFoundError(`no blob stored at ${contentHash}`, contentHash);
      }
      throw error;
    }
    if (this.hash(stored) !== contentHash) {
      throw new ArtifactIntegrityError(
        `integrity check failed: stored content does not hash to ${contentHash}`,
        contentHash,
      );
    }
    // Plain Uint8Array copy — callers never receive a Node Buffer.
    return new Uint8Array(stored);
  }

  /** Shard path `rootDir/ab/cd/<rest of the hash>` for a content address. */
  private pathFor(contentHash: ContentHash): string {
    return join(
      this.rootDir,
      contentHash.substring(0, 2),
      contentHash.substring(2, 4),
      contentHash.substring(4),
    );
  }

  /** Read a blob if present; null only for ENOENT, everything else rethrows. */
  private async readQuietly(blobPath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(blobPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
