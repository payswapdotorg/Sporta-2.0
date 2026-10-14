/**
 * W10A-3 — the live-run composition (app layer, P10-05). Composes the
 * live leg THROUGH the existing `TransformRunService`: no second
 * execution runtime, no second ledger, no second evidence vocabulary.
 * The drained live frames become the run's input feed bytes EXACTLY
 * like the fixture/sample feeds, and the produced record pins the
 * `LiveSessionEvidence` (honest grade `real-local-live` — the closed
 * vocabulary makes "production" unutterable; session identity via
 * `descriptor.sourceId`; frame statistics; close reason).
 *
 * Failure law: a descriptor that fails validation, a source that
 * refuses to open, a session that fails mid-drain (queue overflow,
 * socket error), or a mid-drain abort each throw the typed
 * `LiveIngressError` carrying the partial evidence — a
 * disconnected/failed source is NEVER reported successful and NO run
 * executes on a fabricated feed.
 */
import type { ProvenanceDescriptor } from "@sporta/contracts/contract";
import type { TransformRunManifest } from "@sporta/transforms/contract";
import { LiveIngressError } from "../domain/errors.js";
import { validateLiveSourceDescriptor } from "../domain/liveSource.js";
import type {
  LiveSessionEvidence,
  LiveSessionHandle,
  LiveSourceDescriptor,
  LiveSourcePort,
} from "../domain/liveSource.js";
import type { StartTransformRunInput, TransformRunService } from "./transformRunService.js";

/** Feed identity/rights pinned onto the run manifest's inputs. */
export interface LiveFeedDeclaration {
  readonly artifactRef: string;
  readonly rightsSnapshot: string;
  readonly provenance: ProvenanceDescriptor | null;
}

/**
 * One live-source run declaration: the existing run input minus
 * `inputs` (the feed bytes are derived from the live drain), plus the
 * declared live source and the feed identity.
 */
export interface StartLiveTransformRunInput {
  readonly run: Omit<StartTransformRunInput, "inputs">;
  readonly liveSource: {
    readonly port: LiveSourcePort;
    readonly descriptor: LiveSourceDescriptor;
  };
  readonly feed: LiveFeedDeclaration;
}

/**
 * The frozen `TransformRunManifest` extended with pinned live-session
 * evidence (the frozen interface itself stays untouched per the
 * additive-only law; this subtype is structurally assignable to it).
 */
export interface LiveTransformRunManifest extends TransformRunManifest {
  /** Every live session this run drained (first slice: exactly one). */
  readonly liveSessions: readonly LiveSessionEvidence[];
}

/** Constructor deps: the EXISTING run service — the single owner of run assembly. */
export interface LiveTransformRunDeps {
  readonly runs: TransformRunService;
}

/** The live-run composition service (see the file header for the composition laws). */
export class LiveTransformRunService {
  private readonly runs: TransformRunService;

  constructor(deps: LiveTransformRunDeps) {
    this.runs = deps.runs;
  }

  async runLivePipeline(input: StartLiveTransformRunInput): Promise<LiveTransformRunManifest> {
    const { descriptor, port } = input.liveSource;
    // Fail-closed descriptor validation BEFORE any IO.
    const validation = validateLiveSourceDescriptor(descriptor);
    if (!validation.ok) {
      throw new LiveIngressError(
        `live source descriptor refused validation: ${validation.refusal.detail}`,
        validation.refusal,
        null,
      );
    }
    if (input.run.signal?.aborted) {
      throw new LiveIngressError(
        "run aborted before the live session opened",
        { kind: "aborted", detail: "run aborted before the live session opened", framesConsumed: 0 },
        null,
      );
    }
    const opened = await port.open(descriptor);
    if ("refusal" in opened) {
      throw new LiveIngressError(
        `live source refused to open: ${opened.refusal.detail}`,
        opened.refusal,
        null,
      );
    }
    const handle = opened.handle;
    const signal = input.run.signal;
    // An abort mid-drain closes the session immediately — pending next()
    // calls wake with the aborted terminal and the drain fails closed.
    const onAbort = (): void => {
      void handle.close("aborted");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    let drained: { payloads: readonly string[]; evidence: LiveSessionEvidence };
    try {
      drained = await this.drainLiveSession(handle, signal);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }

    // The drained frames feed the EXISTING run service exactly like the
    // fixture/sample feeds: newline-delimited text as the input artifact bytes.
    const feedBytes = new TextEncoder().encode(
      drained.payloads.map((payload) => `${payload}\n`).join(""),
    );
    const run = await this.runs.runPipeline({
      ...input.run,
      inputs: [
        {
          artifactRef: input.feed.artifactRef,
          rightsSnapshot: input.feed.rightsSnapshot,
          bytes: feedBytes,
          provenance: input.feed.provenance,
        },
      ],
    });
    return { ...run, liveSessions: [drained.evidence] };
  }

  /**
   * Drain the session until clean end. Failures and aborts throw the
   * typed error with the partial evidence retained; a clean end
   * finalizes the session as `completed`.
   */
  private async drainLiveSession(
    handle: LiveSessionHandle,
    signal: AbortSignal | undefined,
  ): Promise<{ payloads: readonly string[]; evidence: LiveSessionEvidence }> {
    const payloads: string[] = [];
    for (;;) {
      if (signal?.aborted) {
        const evidence = await handle.close("aborted");
        throw new LiveIngressError(
          `run aborted mid-drain after ${payloads.length} frames`,
          {
            kind: "aborted",
            detail: `run aborted mid-drain after ${payloads.length} frames`,
            framesConsumed: payloads.length,
          },
          evidence,
        );
      }
      const next = await handle.next();
      if ("frame" in next) {
        payloads.push(next.frame.payload);
        continue;
      }
      // Terminal — discriminate STRUCTURALLY (SPEC W10A-3): a latched
      // refusal, a refused state, or a non-source-unavailable terminal
      // kind means the session failed; only a source-unavailable
      // terminal with no latched refusal and an in-flight session is a
      // clean end of stream.
      const snapshot = handle.evidence();
      const failed =
        next.refusal.kind !== "source-unavailable" ||
        snapshot.refusal !== null ||
        snapshot.closeReason === "refused";
      if (failed) {
        const evidence = await handle.close("aborted");
        throw new LiveIngressError(
          `live source failed mid-drain (${next.refusal.kind}): ${next.refusal.detail}`,
          next.refusal,
          evidence,
        );
      }
      const evidence = await handle.close("completed");
      return { payloads, evidence };
    }
  }
}
