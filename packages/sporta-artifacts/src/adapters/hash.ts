import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/contracts/contract";
/**
 * sha-256 helpers (adapters layer — node:crypto is allowed ONLY here).
 */

/** sha-256 of raw bytes, hex-encoded. */
export function sha256Content(content: Uint8Array): ContentHash {
  return createHash("sha256").update(content).digest("hex");
}

/** sha-256 of a utf-8 string, hex-encoded. */
export function sha256Text(text: string): ContentHash {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
