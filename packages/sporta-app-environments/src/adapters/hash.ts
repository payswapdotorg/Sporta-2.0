/**
 * sha256 hashing adapter (adapters layer — node:crypto lives here so
 * domain/app stay pure). Implements the domain
 * `AppEnvironmentHashPort` with REAL sha256.
 */
import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/contracts/contract";
import type { AppEnvironmentHashPort } from "../domain/ports.js";
import { stableStringify } from "../domain/stable.js";

/** Hex sha256 over text (utf8). */
export function sha256Text(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/** Hex sha256 over bytes. */
export function sha256Bytes(value: Uint8Array): ContentHash {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** The `AppEnvironmentHashPort` implementation over node:crypto. */
export class Sha256AppEnvironmentHash implements AppEnvironmentHashPort {
  text(value: string): ContentHash {
    return sha256Text(value);
  }

  /** Canonical-JSON digest: same value -> same digest, always. */
  stable(value: unknown): ContentHash {
    return sha256Text(stableStringify(value));
  }
}
