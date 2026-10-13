/**
 * sha256 hashing adapter (adapters layer — node:crypto lives here so
 * domain/app stay pure). Implements the domain `MarketplaceHashPort`.
 */
import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/marketplace/contract";
import type { MarketplaceHashPort } from "../domain/ports.js";
import { stableStringify } from "../domain/stable.js";

/** Hex sha256 over text (utf8). */
export function sha256Text(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/** The `MarketplaceHashPort` implementation over node:crypto. */
export class Sha256MarketplaceHash implements MarketplaceHashPort {
  text(value: string): ContentHash {
    return sha256Text(value);
  }

  /** Canonical-JSON digest: same value -> same digest, always. */
  stable(value: unknown): ContentHash {
    return sha256Text(stableStringify(value));
  }
}
