/**
 * W9C — REAL sha256 hashing (adapters layer — node:crypto). Domain and
 * app layers stay crypto-free; the hash port is injected. Same law as
 * the w9a/w9b hash adapters: `sha256:<64 lowercase hex>`.
 */
import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/contracts/contract";
import type { AppEnvironmentHashPort } from "../domain/ports.js";
import { stableStringify } from "../domain/stable.js";

/** sha256 over utf8 text, `sha256:<64 hex>`. */
export function sha256Text(value: string): ContentHash {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

/** The hash port implementation (text + stable-stringified canonical JSON). */
export class Sha256AppEnvironmentHash implements AppEnvironmentHashPort {
  text(value: string): ContentHash {
    return sha256Text(value);
  }
  stable(value: unknown): ContentHash {
    return sha256Text(stableStringify(value));
  }
}
