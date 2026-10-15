/**
 * W12A-3 — the artifact-content/export read seam. EVIDENCE CLASS: REAL.
 * A pure projection over the REAL ArtifactGatedReadService (the wave-4
 * rights-gated read seam): the seam reads revision content bytes through
 * the GATED read path (`readRevisionContent`), and returns the revision
 * record's `contentHash` alongside. The store verifies bytes ↔
 * contentHash on every read (the store's integrity law); the seam
 * NEVER re-hashes-and-claims (it surfaces the revision record's hash,
 * never its own computation of one).
 *
 * Gate law (verbatim from the ADR `adr-wave4-c6-host.md` decision 1):
 * the gate runs BEFORE every storage touch. A prohibited or
 * retention-expired content read NEVER reaches the blob store. Gate
 * refusals surface as typed `ScreenRefusal`s with the gate's verbatim
 * reason — never bypassed, never a silent null, never stringly.
 *
 * State-owner law (the ADR): this seam owns NO store, NO blob cache, NO
 * second state. The gated service IS the single read authority; this
 * seam is a structural projection over its returns.
 *
 * Acceptance: W12-09 (both arms named, both REAL — the gate-allowed
 * arm returns bytes that re-hash to the committed contentHash; the
 * gate-refused arm returns the typed ScreenRefusal with the verbatim
 * reason).
 */
import type { ArtifactGatedReadService } from "@sporta/artifacts/contract";
import type { ArtifactReadUsageContext } from "@sporta/artifacts/contract";
import type { ContentHash } from "@sporta/contracts/contract";
import type { ScreenRefusal } from "../marketplace/marketplaceScreenPorts.js";

/**
 * The successful export result: the content bytes AND the revision
 * record's contentHash. The hash is taken from the revision record
 * (the store verifies bytes ↔ contentHash on read); the seam never
 * re-hashes-and-claims.
 */
export interface ExportRevisionContentOk {
  /** The content bytes (read through the gated seam; integrity-verified by the store). */
  readonly bytes: Uint8Array;
  /** The revision record's contentHash (the trusted hash; never re-computed by the seam). */
  readonly contentHash: ContentHash;
}

/** Constructor dependencies. */
export interface CreateLibraryExportSeamDeps {
  /** The REAL gated read service (the single rights-gated read authority). */
  readonly gated: ArtifactGatedReadService;
  /**
   * The usage context the seam attests for the read. The gate is
   * FAIL-CLOSED (the wave-4 law): a bare or empty usage context is a
   * typed refusal (the gate cannot affirm any permission). When the
   * caller's usage is not permitted by the revision's PolicySet.rights,
   * the gate refuses with `ArtifactRightsRefusalError` — translated by
   * the seam into a `ScreenRefusal` with the verbatim reason.
   */
  readonly usage?: ArtifactReadUsageContext;
}

/**
 * Create the export seam. The seam is a CURRIED read function: takes
 * deps, returns the read closure. The closure is a pure projection
 * over the gated service — no store, no second state.
 *
 * Returned closure signature:
 *   (revisionId: string) => Promise<ExportRevisionContentOk | ScreenRefusal>
 *
 * Refusal law: the seam translates EVERY typed gate error into a
 * `ScreenRefusal` with the gate's verbatim message — never bypassed,
 * never stringly null. The caller sees one of:
 *   - `{ bytes, contentHash }` — the gate allowed; bytes hash to
 *     contentHash (verified by the store on read; the test re-hashes
 *     to assert, NOT the seam).
 *   - `{ reason: "<verbatim gate message>" }` — the gate refused
 *     (rights / retention / unavailable / blob-not-found / integrity);
 *     the reason carries the gate's own message verbatim.
 */
export function exportRevisionContent(
  deps: CreateLibraryExportSeamDeps,
): (revisionId: string) => Promise<ExportRevisionContentOk | ScreenRefusal> {
  const { gated, usage } = deps;
  return async (revisionId: string): Promise<ExportRevisionContentOk | ScreenRefusal> => {
    // Step 1: read the revision RECORD through the gated seam. The
    // gate runs FIRST (rights then retention). If the gate refuses,
    // the typed error is caught and translated to a ScreenRefusal
    // with the verbatim reason. If the revision is unknown, the seam
    // returns a ScreenRefusal (honest absence — never a fabricated
    // record).
    let revisionRecord;
    try {
      revisionRecord = await gated.readRevision({ revisionId, usage });
    } catch (error) {
      return { reason: gateRefusalReason(error, "revision") };
    }
    if (revisionRecord === null) {
      return {
        reason: `unknown revision ${revisionId} — the registry has no such revision (the gate did not refuse; the revision id is simply absent)`,
      };
    }

    // Step 2: read the content BYTES through the gated seam. The gate
    // runs FIRST (the gate precedes every storage touch — a prohibited
    // or retention-expired content read NEVER reaches the blob store).
    // The store verifies bytes ↔ contentHash on read (the store's
    // integrity law). The seam NEVER re-hashes-and-claims — the
    // returned contentHash is taken from the revision record (step 1),
    // NOT computed from the bytes.
    let bytes: Uint8Array;
    try {
      const read = await gated.readRevisionContent({ revisionId, usage });
      if (read === null) {
        // The revision was known in step 1 but the content read
        // returned null — defensive: should not happen (the gated
        // service throws ArtifactReadUnavailableError when no blob
        // store is wired, never returns null for a known revision).
        // Surface honestly as a typed refusal.
        return {
          reason: `unknown revision ${revisionId} — content read returned null for a known revision (the gated service is in an inconsistent state)`,
        };
      }
      bytes = read;
    } catch (error) {
      return { reason: gateRefusalReason(error, "content") };
    }

    // Step 3: return the bytes + the revision record's contentHash.
    // The hash is taken from the revision record (the trusted hash);
    // the store has verified bytes ↔ contentHash on read. The seam
    // never re-hashes-and-claims.
    return {
      bytes,
      contentHash: revisionRecord.contentHash,
    };
  };
}

/**
 * Translate a gate typed error into a verbatim refusal reason. The
 * gate's own `Error.message` carries verbatim — the seam never
 * substitutes its own wording for the gate's law (the ADR: typed
 * refusals preserved verbatim, never a silent no-op, never a stringly
 * null). The `capability` label (`"revision"` or `"content"`) is
 * prepended for diagnostic clarity at the screen surface.
 */
function gateRefusalReason(
  error: unknown,
  capability: "revision" | "content",
): string {
  if (error instanceof Error) {
    return `${capability} gate refused: ${error.message}`;
  }
  // Defensive: a non-Error throw from the gated service is surfaced
  // verbatim too (stringified). The gate's typed errors all extend
  // `ArtifactError` (an `Error` subclass), so this arm is rare — but
  // the seam never silently swallows a throw.
  return `${capability} gate refused: ${String(error)}`;
}
