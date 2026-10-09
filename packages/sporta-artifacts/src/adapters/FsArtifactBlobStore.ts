import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import type { ContentHash } from "@sporta/contracts/contract";
import { ArtifactIntegrityError, ArtifactBlobNotFoundError } from "../domain/errors.js";
import type { ArtifactBlobStorePort } from "../domain/ports.js";
import { sha256Content } from "./hash.js";

/**
 * Durable filesystem-based content-addressed blob store.
 *
 * Blobs are stored as files in a directory structure, with content-addressed
 * filenames (sha256 hash). Atomic writes are performed via temp files + rename.
 * Integrity is verified on every read - stored content that doesn't hash
 * back to its content address raises a typed ArtifactIntegrityError.
 */
export class FsArtifactBlobStore implements ArtifactBlobStorePort {
  private readonly rootDir: string;
  private readonly hash: (content: Uint8Array) => ContentHash;

  constructor(
    rootDir: string = join(tmpdir(), "sporta-artifacts"),
    hash: (content: Uint8Array) => ContentHash = sha256Content,
  ) {
    this.rootDir = rootDir;
    this.hash = hash;
  }

  /**
   * Store content and return its content address.
   * Uses atomic write via temp file + rename.
   */
  async put(content: Uint8Array): Promise<ContentHash> {
    const contentHash = this.hash(content);
    const blobPath = this.blobPath(contentHash);

    // Check if already exists with same content (content-addressed dedup)
    try {
      const existing = await fs.readFile(blobPath);
      if (this.hash(existing) === contentHash) {
        return contentHash; // Same content already stored
      }
      // Hash collision - different content at same address
      throw new ArtifactIntegrityError(
        `hash collision: content address ${contentHash} already stores different bytes`,
        contentHash,
      );
    } catch (error) {
      // File doesn't exist or can't be read - proceed to write
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // Atomic write: create in temp dir then rename
    const tempDir = join(this.rootDir, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempPath = join(tempDir, `temp-${contentHash}`);
    try {
      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, blobPath);
    } finally {
      // Clean up temp file regardless of success
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore if already cleaned up
      }
    }

    return contentHash;
  }

  /**
   * Read content by content address with integrity verification.
   * Throws ArtifactBlobNotFoundError if not present.
   * Throws ArtifactIntegrityError if content doesn't match hash.
   */
  async read(contentHash: ContentHash): Promise<Uint8Array> {
    const blobPath = this.blobPath(contentHash);
    
    try {
      const content = await fs.readFile(blobPath);
      
      // Verify integrity
      if (this.hash(content) !== contentHash) {
        throw new ArtifactIntegrityError(
          `integrity check failed: stored content does not hash to ${contentHash}`,
          contentHash,
        );
      }
      
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ArtifactBlobNotFoundError(`no blob stored at ${contentHash}`, contentHash);
      }
      throw error; // Re-throw other errors
    }
  }

  /**
   * Get the file path for a content hash.
   * Creates the directory structure if needed.
   */
  private blobPath(contentHash: ContentHash): string {
    // Create directory structure like 'ab/cd/ef...' for better filesystem performance
    const hashPath = join(
      contentHash.substring(0, 2),
      contentHash.substring(2, 4),
      contentHash.substring(4)
    );
    const fullPath = join(this.rootDir, hashPath);
    
    // Ensure parent directory exists
    fs.mkdir(dirname(fullPath), { recursive: true }).catch(() => {
      // Ignore if already exists
    });
    
    return fullPath;
  }
}