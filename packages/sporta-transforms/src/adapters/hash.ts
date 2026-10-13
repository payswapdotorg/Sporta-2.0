/**
 * sha256 hashing adapter (adapters layer — node:crypto lives here so
 * the domain stays pure). Implements the domain `TransformHashPort`.
 */
import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/contracts/contract";
import type { TransformHashPort } from "../domain/ports.js";

/** Hex sha256 over text (utf8). */
export function sha256Text(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/** Hex sha256 over raw bytes. */
export function sha256Bytes(value: Uint8Array): ContentHash {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** The `TransformHashPort` implementation over node:crypto. */
export class Sha256TransformHash implements TransformHashPort {
  text(value: string): ContentHash {
    return sha256Text(value);
  }

  bytes(value: Uint8Array): ContentHash {
    return sha256Bytes(value);
  }
}
