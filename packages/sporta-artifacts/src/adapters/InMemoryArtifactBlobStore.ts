import type { ContentHash } from "@sporta/contracts/contract";
import { ArtifactIntegrityError, ArtifactBlobNotFoundError } from "../domain/errors.js";
import type { ArtifactBlobStorePort } from "../domain/ports.js";
import { sha256Content } from "./hash.js";
/**
 * In-memory content-addressed blob store (fixture-grade).
 *
 * Integrity is verified on EVERY read: stored bytes that no longer hash
 * to their content address raise a typed ArtifactIntegrityError — never
 * silent corruption.
 */

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export class InMemoryArtifactBlobStore implements ArtifactBlobStorePort {
  private readonly blobs = new Map<ContentHash, Uint8Array>();
  private readonly hash: (content: Uint8Array) => ContentHash;

  constructor(hash: (content: Uint8Array) => ContentHash = sha256Content) {
    this.hash = hash;
  }

  async put(content: Uint8Array): Promise<ContentHash> {
    const contentHash = this.hash(content);
    const existing = this.blobs.get(contentHash);
    if (existing !== undefined) {
      if (!bytesEqual(existing, content)) {
        throw new ArtifactIntegrityError(
          `hash collision: content address ${contentHash} already stores different bytes`,
          contentHash,
        );
      }
      return contentHash; // content-addressed dedup: same bytes, same address
    }
    this.blobs.set(contentHash, content);
    return contentHash;
  }

  async read(contentHash: ContentHash): Promise<Uint8Array> {
    const stored = this.blobs.get(contentHash);
    if (stored === undefined) {
      throw new ArtifactBlobNotFoundError(`no blob stored at ${contentHash}`, contentHash);
    }
    if (this.hash(stored) !== contentHash) {
      throw new ArtifactIntegrityError(
        `integrity check failed: stored content does not hash to ${contentHash}`,
        contentHash,
      );
    }
    return stored;
  }

  /**
   * Fixture persistence seam: seed state as if previously persisted by an
   * external process. Deliberately unverified so read-time integrity
   * checking stays observable; production adapters verify on read instead.
   */
  async restore(contentHash: ContentHash, content: Uint8Array): Promise<void> {
    this.blobs.set(contentHash, content);
  }
}
