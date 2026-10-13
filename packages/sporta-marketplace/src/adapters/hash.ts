/**
 * sha256 hashing adapter (adapters layer — node:crypto lives here so
 * the domain stays pure). Implements `MarketplaceHashPort`.
 */
import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/contracts/contract";
import type { MarketplaceHashPort } from "../domain/ports.js";

/** Hex sha256 over text (utf8). */
export function sha256Text(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/** The `MarketplaceHashPort` implementation over node:crypto. */
export class Sha256MarketplaceHash implements MarketplaceHashPort {
  text(value: string): ContentHash {
    return sha256Text(value);
  }
}
