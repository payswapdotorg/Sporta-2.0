import { createHash } from "node:crypto";
import type { ContentHash } from "@sporta/contracts/contract";
import type { WorldHashFn } from "../domain/ports.js";
/**
 * sha-256 hash adapter (adapters layer — node:crypto is allowed ONLY here).
 */

/** Injected sha-256 helper for the World Model service. */
export const sha256WorldHash: WorldHashFn = (input: string): ContentHash =>
  createHash("sha256").update(input, "utf8").digest("hex");
