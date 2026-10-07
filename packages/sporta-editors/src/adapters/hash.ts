import { createHash } from "node:crypto";
import type { EditorHashFn } from "../domain/ports.js";
/**
 * sha-256 hash adapter (adapters layer — node:crypto is allowed ONLY here).
 */

/** Injected sha-256 helper for the Editor Broker. */
export const sha256EditorHash: EditorHashFn = (input: string): string =>
  createHash("sha256").update(input, "utf8").digest("hex");
